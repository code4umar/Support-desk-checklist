import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../enums';
import { AuthUser } from '../decorators/current-user.decorator';

// Rule 2: a customer sees only their own tickets. Another customer's
// ticket must answer 404, never 403 — a 403 would confirm the ticket
// exists, and to a customer it shouldn't even be a fact.
//
// Used everywhere a ticket is loaded by id: tickets, comments, events, tags.
export function assertTicketVisible(
  ticket: { requester_id: number } | null,
  user: AuthUser,
): asserts ticket is { requester_id: number } {
  if (!ticket) {
    throw new NotFoundException('Ticket not found');
  }
  if (user.role === UserRole.CUSTOMER && ticket.requester_id !== user.id) {
    throw new NotFoundException('Ticket not found');
  }
}
