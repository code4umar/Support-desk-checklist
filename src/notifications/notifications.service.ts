import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';

export interface NotifyAdminsInput {
  type: NotificationType;
  message: string;
  ticketId?: number | null;
  actorId?: number | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private notifications: Repository<Notification>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  // Creates one notification for every admin, except the person who caused the
  // event (an admin doesn't need to be told about their own login / ticket).
  // It must NEVER break the main action, so every failure is logged and swallowed.
  async notifyAdmins(input: NotifyAdminsInput): Promise<void> {
    try {
      const admins = await this.users.find({ where: { role: UserRole.ADMIN } });
      const rows = admins
        .filter((a) => a.id !== input.actorId)
        .map((a) =>
          this.notifications.create({
            user_id: a.id,
            type: input.type,
            message: input.message,
            ticket_id: input.ticketId ?? null,
            actor_id: input.actorId ?? null,
            read_at: null,
          }),
        );
      if (rows.length > 0) {
        await this.notifications.save(rows);
      }
    } catch (err) {
      this.logger.warn(`Could not create notification: ${(err as Error).message}`);
    }
  }

  // One call gives the bell everything it needs (list + unread badge number).
  async list(userId: number, limit = 20) {
    const [items, unread] = await Promise.all([
      this.notifications.find({
        where: { user_id: userId },
        order: { created_at: 'DESC', id: 'DESC' },
        take: limit,
      }),
      this.notifications.count({ where: { user_id: userId, read_at: IsNull() } }),
    ]);
    return { unread, items };
  }

  async markRead(id: number, userId: number): Promise<Notification> {
    // user_id in the filter = nobody can touch someone else's notification
    const n = await this.notifications.findOne({ where: { id, user_id: userId } });
    if (!n) {
      throw new NotFoundException('Notification not found');
    }
    if (!n.read_at) {
      n.read_at = new Date();
      await this.notifications.save(n);
    }
    return n;
  }

  async markAllRead(userId: number): Promise<{ updated: number }> {
    const res = await this.notifications.update(
      { user_id: userId, read_at: IsNull() },
      { read_at: new Date() },
    );
    return { updated: res.affected ?? 0 };
  }
}
