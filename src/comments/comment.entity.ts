import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Ticket } from '../tickets/ticket.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticket_id: number;

  @ManyToOne(() => Ticket, (ticket) => ticket.comments, {
    nullable: false,
    onDelete: 'CASCADE', // deleting a ticket takes its comments with it
  })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @Column()
  author_id: number;

  @ManyToOne(() => User, (user) => user.comments, { nullable: false })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ type: 'text' })
  body: string;

  @Column({ default: false })
  is_internal: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
