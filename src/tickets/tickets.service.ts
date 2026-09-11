import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './ticket.entity';
import { TicketEvent } from './ticket-event.entity';
import { TicketTag } from '../tags/ticket-tag.entity';
import { UsersService } from '../users/users.service';
import {
  TicketStatus,
  TicketPriority,
  UserRole,
  PRIORITY_DUE_HOURS,
  LEGAL_TRANSITIONS,
} from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertTicketVisible } from '../common/utils/ticket-visibility';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ChangeStatusDto } from './dto/change-status.dto';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private tickets: Repository<Ticket>,
    @InjectRepository(TicketEvent) private events: Repository<TicketEvent>,
    @InjectRepository(TicketTag) private ticketTags: Repository<TicketTag>,
    private usersService: UsersService,
  ) {}

  // ---- Rule 8: due_at is computed server-side from priority, on create only ----
  private computeDueAt(priority: TicketPriority): Date {
    const hours = PRIORITY_DUE_HOURS[priority];
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  async create(dto: CreateTicketDto, user: AuthUser): Promise<Ticket> {
    const ticket = this.tickets.create({
      subject: dto.subject,
      body: dto.body,
      priority: dto.priority,
      status: TicketStatus.OPEN,
      requester_id: user.id,
      due_at: this.computeDueAt(dto.priority),
    });
    return this.tickets.save(ticket);
  }

  // ---- Rule 2 (visibility) + filters/search/sort/page (requirements 13-14) ----
  async findAll(query: ListTicketsQueryDto, user: AuthUser) {
    const qb = this.tickets.createQueryBuilder('ticket');

    if (user.role === UserRole.CUSTOMER) {
      qb.andWhere('ticket.requester_id = :userId', { userId: user.id });
    }

    if (query.status) {
      qb.andWhere('ticket.status = :status', { status: query.status });
    }
    if (query.priority) {
      qb.andWhere('ticket.priority = :priority', { priority: query.priority });
    }
    if (query.assigneeId !== undefined) {
      qb.andWhere('ticket.assignee_id = :assigneeId', {
        assigneeId: query.assigneeId,
      });
    }
    if (query.q) {
      qb.andWhere('(ticket.subject ILIKE :q OR ticket.body ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }
    if (query.overdue) {
      qb.andWhere('ticket.due_at < NOW()').andWhere(
        'ticket.status NOT IN (:...doneStatuses)',
        { doneStatuses: [TicketStatus.RESOLVED, TicketStatus.CLOSED] },
      );
    }
    if (query.tag) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM ticket_tags tt
          INNER JOIN tags t ON t.id = tt.tag_id
          WHERE tt.ticket_id = ticket.id AND t.name = :tagName
        )`,
        { tagName: query.tag },
      );
    }

    const total = await qb.getCount();

    const sortColumn =
      query.sortBy === 'dueAt'
        ? 'ticket.due_at'
        : query.sortBy === 'priority'
          ? `(CASE ticket.priority
               WHEN 'urgent' THEN 4
               WHEN 'high' THEN 3
               WHEN 'normal' THEN 2
               WHEN 'low' THEN 1
             END)`
          : 'ticket.created_at';
    const order = (query.order ?? 'desc').toUpperCase() as 'ASC' | 'DESC';

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const data = await qb
      .orderBy(sortColumn, order)
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();

    return { data, page, pageSize, total };
  }

  async findOneOrFail(id: number): Promise<Ticket> {
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  // Loads + enforces visibility in one step; use this from every endpoint
  // that takes a :id, so a customer always gets 404 rather than 403/200.
  async findVisibleOrFail(id: number, user: AuthUser): Promise<Ticket> {
    const ticket = await this.tickets.findOne({
      where: { id },
      relations: ['requester', 'assignee', 'ticketTags', 'ticketTags.tag'],
    });
    assertTicketVisible(ticket, user);
    return ticket as Ticket;
  }

  async update(id: number, dto: UpdateTicketDto, user: AuthUser): Promise<Ticket> {
    const ticket = await this.findVisibleOrFail(id, user);

    const isOwner = ticket.requester_id === user.id;
    const isStaff = user.role === UserRole.AGENT || user.role === UserRole.ADMIN;
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('Not allowed to update this ticket');
    }

    Object.assign(ticket, dto);
    return this.tickets.save(ticket);
  }

  async remove(id: number): Promise<void> {
    const ticket = await this.findOneOrFail(id);
    await this.tickets.remove(ticket);
  }

  // ---- Rule 5: assignee must be agent or admin -> 422 otherwise ----
  // ---- Rule 7: every assignment writes a ticket_events row ----
  async assign(id: number, dto: AssignTicketDto, actor: AuthUser): Promise<Ticket> {
    const ticket = await this.findOneOrFail(id);

    const candidate = await this.usersService.findById(dto.assigneeId);
    if (
      !candidate ||
      (candidate.role !== UserRole.AGENT && candidate.role !== UserRole.ADMIN)
    ) {
      throw new UnprocessableEntityException(
        'Assignee must be an existing agent or admin',
      );
    }

    ticket.assignee_id = candidate.id;
    const saved = await this.tickets.save(ticket);

    await this.events.save(
      this.events.create({
        ticket_id: ticket.id,
        actor_id: actor.id,
        from_status: null,
        to_status: null,
        note: `Assigned to user #${candidate.id} (${candidate.full_name})`,
      }),
    );

    return saved;
  }

  // ---- Rule 4: the status transition machine ----
  // ---- Rule 7: every status change writes a ticket_events row ----
  async changeStatus(
    id: number,
    dto: ChangeStatusDto,
    actor: AuthUser,
  ): Promise<Ticket> {
    const ticket = await this.findOneOrFail(id);

    const legalNextStates = LEGAL_TRANSITIONS[ticket.status] ?? [];
    if (!legalNextStates.includes(dto.status)) {
      throw new ConflictException(
        `Cannot move a ticket from ${ticket.status} to ${dto.status}`,
      );
    }

    const isReopeningClosed =
      ticket.status === TicketStatus.CLOSED &&
      dto.status === TicketStatus.IN_PROGRESS;
    if (isReopeningClosed && !dto.note?.trim()) {
      throw new BadRequestException('A note is required to reopen a closed ticket');
    }

    const fromStatus = ticket.status;
    ticket.status = dto.status;
    const saved = await this.tickets.save(ticket);

    await this.events.save(
      this.events.create({
        ticket_id: ticket.id,
        actor_id: actor.id,
        from_status: fromStatus,
        to_status: dto.status,
        note: dto.note ?? null,
      }),
    );

    return saved;
  }

  async listEvents(id: number, user: AuthUser): Promise<TicketEvent[]> {
    await this.findVisibleOrFail(id, user);
    return this.events.find({
      where: { ticket_id: id },
      order: { created_at: 'DESC' },
    });
  }

  // ---- Tags on a ticket (used by TagsModule to keep visibility consistent) ----
  async assertVisible(id: number, user: AuthUser): Promise<Ticket> {
    return this.findVisibleOrFail(id, user);
  }
}