import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketEvent } from '../tickets/ticket-event.entity';
import { Ticket } from '../tickets/ticket.entity';
import { UsersService } from '../users/users.service';
import { TicketStatus } from '../common/enums';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(TicketEvent) private events: Repository<TicketEvent>,
    @InjectRepository(Ticket) private tickets: Repository<Ticket>,
    private usersService: UsersService,
  ) {}

  async getPublic() {
    const done = [TicketStatus.RESOLVED, TicketStatus.CLOSED];
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const raw = await this.events
      .createQueryBuilder('e')
      .select('COUNT(DISTINCT e.ticket_id)', 'count')
      .where('e.to_status IN (:...done)', { done })
      .andWhere('e.created_at >= :since', { since })
      .getRawOne();
    const resolvedThisWeek = Number(raw?.count ?? 0);

    const last = await this.events
      .createQueryBuilder('e')
      .where('e.to_status IN (:...done)', { done })
      .orderBy('e.created_at', 'DESC')
      .getOne();

    let latestResolved: {
      id: number;
      closedBy: string | null;
      minutes: number | null;
    } | null = null;

    if (last) {
      const ticket = await this.tickets.findOne({ where: { id: last.ticket_id } });
      const actor = last.actor_id
        ? await this.usersService.findById(last.actor_id)
        : null;
      const minutes = ticket
        ? Math.max(
            0,
            Math.round(
              (new Date(last.created_at).getTime() -
                new Date(ticket.created_at).getTime()) /
                60000,
            ),
          )
        : null;
      latestResolved = {
        id: last.ticket_id,
        closedBy: actor?.full_name ?? null,
        minutes,
      };
    }

    return { resolvedThisWeek, latestResolved };
  }
}