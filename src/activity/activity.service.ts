import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from './activity-log.entity';

export interface ActivityInput {
  actorId?: number | null;
  action: string;
  targetType?: string;
  targetId?: number;
  details?: string;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(@InjectRepository(ActivityLog) private logs: Repository<ActivityLog>) {}

  // Writing the log must never break the real action, so failures are only logged.
  async log(input: ActivityInput): Promise<void> {
    try {
      await this.logs.save(
        this.logs.create({
          actor_id: input.actorId ?? null,
          action: input.action,
          target_type: input.targetType ?? null,
          target_id: input.targetId ?? null,
          details: input.details ?? null,
        }),
      );
    } catch (err) {
      this.logger.warn(`Could not write activity log: ${(err as Error).message}`);
    }
  }

  async list(limit = 50) {
    const rows = await this.logs.find({
      relations: { actor: true },
      order: { created_at: 'DESC', id: 'DESC' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      details: r.details,
      target_type: r.target_type,
      target_id: r.target_id,
      created_at: r.created_at,
      actor: r.actor ? { id: r.actor.id, full_name: r.actor.full_name, role: r.actor.role } : null,
    }));
  }
}
