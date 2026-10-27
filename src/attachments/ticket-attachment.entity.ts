import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { User } from '../users/user.entity';

// A file attached to a ticket. The bytes live in the database (bytea) so no extra storage service is needed.
@Entity('ticket_attachments')
@Index('IDX_ticket_attachments_ticket', ['ticket_id'])
export class TicketAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticket_id: number;

  @ManyToOne(() => Ticket, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  // who uploaded it; becomes NULL if that user is deleted
  @Column({ type: 'int', nullable: true })
  uploaded_by: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by' })
  uploader: User | null;

  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'varchar', length: 100 })
  mime_type: string;

  @Column({ type: 'int' })
  size: number;

  // never loaded by normal queries (lists stay light); only the download asks for it
  @Column({ type: 'bytea', select: false })
  data: Buffer;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
