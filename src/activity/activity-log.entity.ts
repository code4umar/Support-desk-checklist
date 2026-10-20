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

// Audit trail: who did what, and when (role changes, password changes, sign-ins...).
@Entity('activity_logs')
@Index('IDX_activity_logs_created_at', ['created_at'])
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id: number;

  // the person who did it; becomes NULL if that user is deleted
  @Column({ type: 'int', nullable: true })
  actor_id: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor: User | null;

  @Column({ type: 'varchar', length: 60 })
  action: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  target_type: string | null;

  @Column({ type: 'int', nullable: true })
  target_id: number | null;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
