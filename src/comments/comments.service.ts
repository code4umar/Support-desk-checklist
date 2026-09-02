import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { Ticket } from '../tickets/ticket.entity';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertTicketVisible } from '../common/utils/ticket-visibility';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private comments: Repository<Comment>,
    @InjectRepository(Ticket) private tickets: Repository<Ticket>,
  ) {}

  async create(ticketId: number, dto: CreateCommentDto, user: AuthUser) {
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    assertTicketVisible(ticket, user);

    // Rule 6: only agent/admin may create an internal comment.
    const wantsInternal = dto.isInternal === true;
    const isStaff = user.role === UserRole.AGENT || user.role === UserRole.ADMIN;
    if (wantsInternal && !isStaff) {
      throw new ForbiddenException('Only agents or admins can post internal comments');
    }

    const comment = this.comments.create({
      ticket_id: ticketId,
      author_id: user.id,
      body: dto.body,
      is_internal: wantsInternal,
    });
    return this.comments.save(comment);
  }

  async findAllForTicket(ticketId: number, user: AuthUser) {
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    assertTicketVisible(ticket, user);

    const isStaff = user.role === UserRole.AGENT || user.role === UserRole.ADMIN;
    const where: any = { ticket_id: ticketId };
    if (!isStaff) {
      // A customer never receives an internal comment, full stop.
      where.is_internal = false;
    }
    return this.comments.find({ where, order: { created_at: 'ASC' } });
  }
}
