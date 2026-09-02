import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { TicketTag } from './ticket-tag.entity';

@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @OneToMany(() => TicketTag, (tt) => tt.tag)
  ticketTags: TicketTag[];
}
