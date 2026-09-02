import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { TicketStatus, TicketPriority } from '../common/enums';
import { User } from '../users/user.entity';
import { Comment } from '../comments/comment.entity';
import { TicketEvent } from '../tickets/ticket-event.entity';
import { TicketTag } from '../tags/ticket-tag.entity';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    enumName: 'tickets_status_enum',
    default: TicketStatus.OPEN,
  })
  status: TicketStatus;

  @Column({
    type: 'enum',
    enum: TicketPriority,
    enumName: 'tickets_priority_enum',
  })
  priority: TicketPriority;

  // Mandatory: every ticket has exactly one requester.
  @Column()
  requester_id: number;

  @ManyToOne(() => User, (user) => user.ticketsRequested, { nullable: false })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  // Optional: a ticket may be unassigned.
  @Column({ nullable: true })
  assignee_id: number | null;

  @ManyToOne(() => User, (user) => user.ticketsAssigned, { nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User | null;

  @Column({ type: 'timestamptz' })
  due_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @OneToMany(() => Comment, (comment) => comment.ticket)
  comments: Comment[];

  @OneToMany(() => TicketEvent, (event) => event.ticket)
  events: TicketEvent[];

  // Junction rows for tags. Read tag names via ticketTags[].tag.name,
  // or use the TicketsService helper that flattens this for responses.
  @OneToMany(() => TicketTag, (tt) => tt.ticket)
  ticketTags: TicketTag[];
}
