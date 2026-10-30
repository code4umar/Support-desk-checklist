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
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { CategoriesService } from '../categories/categories.service';
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
import { escapeLike, searchTerms } from '../knowledge-base/kb-search';

// filler words that would make every ticket look "similar"
const SIMILARITY_STOP_WORDS = new Set([
  'the', 'and', 'for', 'not', 'can', 'cant', 'with', 'you', 'but', 'are', 'was', 'how', 'why',
  'what', 'when', 'this', 'that', 'from', 'have', 'has', 'get', 'its', 'dont', 'does', 'did', 'any', 'all',
]);

export interface SimilarTickets {
  count: number;
  // only staff get the tickets themselves; customers just learn they aren't alone
  items?: { id: number; subject: string; status: TicketStatus; known_issue_id: number | null }[];
}

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private tickets: Repository<Ticket>,
    @InjectRepository(TicketEvent) private events: Repository<TicketEvent>,
    @InjectRepository(TicketTag) private ticketTags: Repository<TicketTag>,
    private usersService: UsersService,
    private notifications: NotificationsService,
    private categories: CategoriesService,
  ) {}

  // ---- Rule 8: due_at is computed server-side from priority, on create only ----
  private computeDueAt(priority: TicketPriority): Date {
    const hours = PRIORITY_DUE_HOURS[priority];
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  async create(dto: CreateTicketDto, user: AuthUser): Promise<Ticket> {
    await this.categories.assertExists(dto.categoryId);
    const ticket = this.tickets.create({
      subject: dto.subject,
      body: dto.body,
      priority: dto.priority,
      status: TicketStatus.OPEN,
      requester_id: user.id,
      category_id: dto.categoryId ?? null,
      due_at: this.computeDueAt(dto.priority),
    });
    const saved = await this.tickets.save(ticket);

    // tell every admin (except the creator) about the new ticket
    await this.notifications.notifyAdmins({
      type: NotificationType.TICKET_CREATED,
      message: `New ticket #${saved.id}: ${saved.subject} (by ${user.email})`,
      ticketId: saved.id,
      actorId: user.id,
    });

    return saved;
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
    if (query.categoryId !== undefined) {
      qb.andWhere('ticket.category_id = :categoryId', {
        categoryId: query.categoryId,
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

    const { categoryId, ...fields } = dto;
    const changes: string[] = [];
    if (fields.priority !== undefined && fields.priority !== ticket.priority) {
      changes.push(`Priority changed from ${ticket.priority} to ${fields.priority}`);
    }
    if (categoryId !== undefined && categoryId !== ticket.category_id) {
      await this.categories.assertExists(categoryId);
      ticket.category_id = categoryId;
      changes.push(categoryId === null ? 'Category cleared' : `Category set to #${categoryId}`);
    }

    Object.assign(ticket, fields);
    const saved = await this.tickets.save(ticket);

    // priority/category edits join status and assignment changes in the audit trail
    if (changes.length) {
      await this.events.save(
        this.events.create({
          ticket_id: ticket.id,
          actor_id: user.id,
          from_status: null,
          to_status: null,
          note: changes.join('; '),
        }),
      );
    }
    return saved;
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

    if (dto.status === TicketStatus.RESOLVED) {
      await this.resolveLinked(ticket, actor);
    }

    return saved;
  }

  // ---- Known issues: one ticket stands for many duplicates ----

  // Resolving a known issue resolves every still-active ticket linked to it.
  // This deliberately skips the open -> in_progress step of the status
  // machine: the work was done once, on the known issue itself.
  private async resolveLinked(knownIssue: Ticket, actor: AuthUser): Promise<number> {
    const linked = await this.tickets.find({ where: { known_issue_id: knownIssue.id } });
    const active = linked.filter(
      (t) => t.status === TicketStatus.OPEN || t.status === TicketStatus.IN_PROGRESS,
    );
    for (const t of active) {
      const from = t.status;
      t.status = TicketStatus.RESOLVED;
      await this.tickets.save(t);
      await this.events.save(
        this.events.create({
          ticket_id: t.id,
          actor_id: actor.id,
          from_status: from,
          to_status: TicketStatus.RESOLVED,
          note: `Resolved together with known issue #${knownIssue.id}`,
        }),
      );
    }
    if (active.length) {
      await this.notifications.notifyUsers({
        userIds: active.map((t) => t.requester_id),
        type: NotificationType.TICKET_RESOLVED,
        message: `Good news: the issue behind your ticket was fixed ("${knownIssue.subject}")`,
        ticketId: knownIssue.id,
        actorId: actor.id,
      });
    }
    return active.length;
  }

  async link(id: number, knownIssueId: number, actor: AuthUser): Promise<Ticket> {
    if (id === knownIssueId) {
      throw new BadRequestException('A ticket cannot be linked to itself');
    }
    const ticket = await this.findOneOrFail(id);
    const target = await this.tickets.findOne({ where: { id: knownIssueId } });
    if (!target) {
      throw new UnprocessableEntityException(`Ticket #${knownIssueId} does not exist`);
    }
    // one level only, so "resolve the known issue" always reaches everyone
    if (target.known_issue_id) {
      throw new UnprocessableEntityException(
        `#${knownIssueId} is itself linked to #${target.known_issue_id}; link to that one instead`,
      );
    }
    const dependants = await this.tickets.count({ where: { known_issue_id: id } });
    if (dependants > 0) {
      throw new ConflictException(
        `#${id} is a known issue with ${dependants} linked tickets and cannot be linked elsewhere`,
      );
    }

    ticket.known_issue_id = knownIssueId;
    const saved = await this.tickets.save(ticket);
    await this.events.save(
      this.events.create({
        ticket_id: id,
        actor_id: actor.id,
        from_status: null,
        to_status: null,
        note: `Linked to known issue #${knownIssueId}`,
      }),
    );
    return saved;
  }

  async unlink(id: number, actor: AuthUser): Promise<Ticket> {
    const ticket = await this.findOneOrFail(id);
    if (!ticket.known_issue_id) return ticket;
    const was = ticket.known_issue_id;
    ticket.known_issue_id = null;
    const saved = await this.tickets.save(ticket);
    await this.events.save(
      this.events.create({
        ticket_id: id,
        actor_id: actor.id,
        from_status: null,
        to_status: null,
        note: `Unlinked from known issue #${was}`,
      }),
    );
    return saved;
  }

  async listLinked(id: number): Promise<Ticket[]> {
    await this.findOneOrFail(id);
    return this.tickets.find({ where: { known_issue_id: id }, order: { id: 'ASC' } });
  }

  // Active tickets that look like the text being typed on the new-ticket
  // form, from the last 14 days. A ticket counts when it shares at least
  // two meaningful words (or the only one, for one-word searches).
  async findSimilar(q: string, user: AuthUser): Promise<SimilarTickets> {
    const terms = searchTerms(q).filter((t) => t.length >= 3 && !SIMILARITY_STOP_WORDS.has(t));
    if (!terms.length) return { count: 0, ...(this.isStaff(user) ? { items: [] } : {}) };

    const params: unknown[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, user.id];
    const hits = terms
      .map((t) => {
        params.push(`%${escapeLike(t)}%`);
        const n = params.length;
        return `(CASE WHEN t.subject ILIKE $${n} OR t.body ILIKE $${n} THEN 1 ELSE 0 END)`;
      })
      .join(' + ');
    params.push(Math.min(2, terms.length));
    const rows: { id: number; subject: string; status: TicketStatus; known_issue_id: number | null }[] =
      await this.tickets.query(
        `SELECT id, subject, status, known_issue_id FROM (
           SELECT t.id, t.subject, t.status, t.known_issue_id, t.created_at, ${hits} AS hits
             FROM tickets t
            WHERE t.status IN ($1, $2)
              AND t.requester_id <> $3
              AND t.created_at > now() - interval '14 days'
         ) s
         WHERE hits >= $${params.length}
         ORDER BY hits DESC, created_at DESC
         LIMIT 20`,
        params,
      );
    return this.isStaff(user) ? { count: rows.length, items: rows.slice(0, 5) } : { count: rows.length };
  }

  private isStaff(user: AuthUser) {
    return user.role === UserRole.AGENT || user.role === UserRole.ADMIN;
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