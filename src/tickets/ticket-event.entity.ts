import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TicketStatus } from '../common/enums';
import { User } from '../users/user.entity';
import { Ticket } from './ticket.entity';

// Written ONLY by services (status change / assignment). No controller
// exposes a way to create these directly — see rule 7 of the spec.
@Entity('ticket_events')
export class TicketEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticket_id: number;

  @ManyToOne(() => Ticket, (ticket) => ticket.events, {
    nullable: false,
    onDelete: 'CASCADE', // deleting a ticket takes its events with it
  })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  // Nullable: a system-generated event (rare) may have no human actor.
  @Column({ nullable: true })
  actor_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @Column({ type: 'enum', enum: TicketStatus, enumName: 'tickets_status_enum', nullable: true })
  from_status: TicketStatus | null;

  @Column({ type: 'enum', enum: TicketStatus, enumName: 'tickets_status_enum', nullable: true })
  to_status: TicketStatus | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
