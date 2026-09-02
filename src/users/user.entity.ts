import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserRole } from '../common/enums';
import { Ticket } from '../tickets/ticket.entity';
import { Comment } from '../comments/comment.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  // Never serialize this out. select:false means it's excluded from
  // normal queries by default — AuthService must .addSelect() it explicitly.
  @Column({ select: false })
  password_hash: string;

  @Column()
  full_name: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'users_role_enum' })
  role: UserRole;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  // A user can raise many tickets (as requester)
  @OneToMany(() => Ticket, (ticket) => ticket.requester)
  ticketsRequested: Ticket[];

  // A user (agent/admin) can be assigned many tickets
  @OneToMany(() => Ticket, (ticket) => ticket.assignee)
  ticketsAssigned: Ticket[];

  @OneToMany(() => Comment, (comment) => comment.author)
  comments: Comment[];
}
