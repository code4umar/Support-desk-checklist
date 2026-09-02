import { NotFoundException } from '@nestjs/common';
import { assertTicketVisible } from './ticket-visibility';
import { UserRole } from '../enums';
import { AuthUser } from '../decorators/current-user.decorator';

describe('assertTicketVisible (rule 2)', () => {
  const ticketOwnedBy5 = { requester_id: 5 };

  it('lets a customer see their own ticket', () => {
    const owner: AuthUser = { id: 5, email: 'a@x.com', role: UserRole.CUSTOMER };
    expect(() => assertTicketVisible(ticketOwnedBy5, owner)).not.toThrow();
  });

  it('hides another customer\'s ticket behind a 404, not a 403', () => {
    const otherCustomer: AuthUser = { id: 6, email: 'b@x.com', role: UserRole.CUSTOMER };
    expect(() => assertTicketVisible(ticketOwnedBy5, otherCustomer)).toThrow(
      NotFoundException,
    );
  });

  it('lets an agent see any ticket', () => {
    const agent: AuthUser = { id: 999, email: 'agent@x.com', role: UserRole.AGENT };
    expect(() => assertTicketVisible(ticketOwnedBy5, agent)).not.toThrow();
  });

  it('lets an admin see any ticket', () => {
    const admin: AuthUser = { id: 1, email: 'admin@x.com', role: UserRole.ADMIN };
    expect(() => assertTicketVisible(ticketOwnedBy5, admin)).not.toThrow();
  });

  it('returns 404 (not 403) for a nonexistent ticket', () => {
    const customer: AuthUser = { id: 5, email: 'a@x.com', role: UserRole.CUSTOMER };
    expect(() => assertTicketVisible(null, customer)).toThrow(NotFoundException);
  });

  it('returns 404 for a nonexistent ticket even for staff', () => {
    const agent: AuthUser = { id: 999, email: 'agent@x.com', role: UserRole.AGENT };
    expect(() => assertTicketVisible(null, agent)).toThrow(NotFoundException);
  });
});
