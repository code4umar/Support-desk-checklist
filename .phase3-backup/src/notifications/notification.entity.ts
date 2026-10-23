import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Ticket } from '../tickets/ticket.entity';

export enum NotificationType {
  TICKET_CREATED = 'ticket_created',
  USER_LOGIN = 'user_login',
  USER_REGISTERED = 'user_registered',
}

// One row per recipient: if 3 admins exist, a new ticket creates 3 rows,
// so each admin has their own read / unread state.
@Entity('notifications')
@Index('IDX_notifications_user_read', ['user_id', 'read_at'])
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  // the person who RECEIVES the notification
  @Column()
  user_id: number;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 40 })
  type: NotificationType;

  @Column({ type: 'text' })
  message: string;

  // set for ticket notifications; becomes NULL if the ticket is deleted
  @Column({ type: 'int', nullable: true })
  ticket_id: number | null;

  @ManyToOne(() => Ticket, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket | null;

  // who caused it (the user who logged in / created the ticket)
  @Column({ type: 'int', nullable: true })
  actor_id: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  read_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}