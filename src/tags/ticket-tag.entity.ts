import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { Tag } from './tag.entity';

@Entity('ticket_tags')
export class TicketTag {
  @PrimaryColumn()
  ticket_id: number;

  @PrimaryColumn()
  tag_id: number;

  @ManyToOne(() => Ticket, (ticket) => ticket.ticketTags, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @ManyToOne(() => Tag, (tag) => tag.ticketTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}
