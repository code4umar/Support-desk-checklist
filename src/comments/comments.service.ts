import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Comment } from './comment.entity';
import { Ticket } from '../tickets/ticket.entity';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertTicketVisible } from '../common/utils/ticket-visibility';
import { CreateCommentDto } from './dto/create-comment.dto';
import { User } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { findMentionedUsers } from './mentions';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private comments: Repository<Comment>,
    @InjectRepository(Ticket) private tickets: Repository<Ticket>,
    @InjectRepository(User) private users: Repository<User>,
    private notifications: NotificationsService,
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
    const savedComment = await this.comments.save(comment);

    // Mentions & Notifications (Failure in this block should never break comment creation)
    try {
      const allUsers = await this.users.find();
      const mentionedUsers = findMentionedUsers(dto.body, allUsers, user.id);
      const mentionedUserIds = mentionedUsers.map((u) => u.id);

      if (mentionedUserIds && mentionedUserIds.length > 0) {
        const authorUser = allUsers.find((u) => u.id === user.id);
        const authorName =
          authorUser?.full_name ||
          (user as any).full_name ||
          (user as any).name ||
          'User';

        await this.notifications.notifyUsers({
          userIds: mentionedUserIds,
          type: NotificationType.MENTION,
          message: `${authorName} mentioned you on ticket #${ticketId}`,
          ticketId: ticketId,
          actorId: user.id,
        });
      }
    } catch (err) {
      // Intentionally ignore errors so notification failure never breaks comment creation
    }

    return savedComment;
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

    const rows = await this.comments.find({
      where,
      relations: { author: true },
      order: { created_at: 'ASC' },
    });

    // Send the author's name and role, but never the whole user record
    // (no email), so a customer cannot read staff email addresses.
    return rows.map(({ author, ...comment }) => ({
      ...comment,
      author_name: author?.full_name ?? null,
      author_role: author?.role ?? null,
    }));
  }
}