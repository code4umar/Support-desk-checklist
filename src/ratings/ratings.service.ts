import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../tickets/ticket.entity';
import { TicketStatus } from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertTicketVisible } from '../common/utils/ticket-visibility';
import { RateTicketDto } from './dto/rate-ticket.dto';

@Injectable()
export class RatingsService {
  constructor(@InjectRepository(Ticket) private tickets: Repository<Ticket>) {}

  // Only the person who raised the ticket can rate it, and only once it is
  // resolved or closed. Rating again simply updates the earlier rating.
  async rate(ticketId: number, dto: RateTicketDto, user: AuthUser) {
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    assertTicketVisible(ticket, user);
    const t = ticket as Ticket;

    if (t.requester_id !== user.id) {
      throw new ForbiddenException('Only the person who raised the ticket can rate it');
    }
    if (t.status !== TicketStatus.RESOLVED && t.status !== TicketStatus.CLOSED) {
      throw new BadRequestException('You can rate a ticket once it is resolved');
    }

    await this.tickets.query(
      `INSERT INTO ticket_ratings (ticket_id, user_id, stars, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (ticket_id) DO UPDATE
         SET stars = EXCLUDED.stars,
             comment = EXCLUDED.comment,
             updated_at = now()`,
      [ticketId, user.id, dto.stars, dto.comment?.trim() || null],
    );
    return this.getForTicket(ticketId, user);
  }

  // Always answers with an object ({ rating: null } when there is none),
  // so the frontend never has to parse an empty body.
  async getForTicket(ticketId: number, user: AuthUser) {
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    assertTicketVisible(ticket, user);

    const rows: { stars: number; comment: string | null; updated_at: Date }[] =
      await this.tickets.query(
        `SELECT stars, comment, updated_at FROM ticket_ratings WHERE ticket_id = $1`,
        [ticketId],
      );
    return { rating: rows[0] ?? null };
  }

  async summary() {
    const rows: { average: number; count: number }[] = await this.tickets.query(
      `SELECT COALESCE(ROUND(AVG(stars)::numeric, 2), 0)::float AS average,
              COUNT(*)::int AS count
         FROM ticket_ratings`,
    );
    return rows[0] ?? { average: 0, count: 0 };
  }
}
