import { LEGAL_TRANSITIONS, TicketStatus } from '../common/enums';

describe('LEGAL_TRANSITIONS: status machine', () => {
  it('open only allows in_progress', () => {
    expect(LEGAL_TRANSITIONS[TicketStatus.OPEN]).toEqual([TicketStatus.IN_PROGRESS]);
  });

  it('in_progress only allows resolved', () => {
    expect(LEGAL_TRANSITIONS[TicketStatus.IN_PROGRESS]).toEqual([TicketStatus.RESOLVED]);
  });

  it('resolved allows closed or back to in_progress, nothing else', () => {
    const moves = LEGAL_TRANSITIONS[TicketStatus.RESOLVED];
    expect(moves).toContain(TicketStatus.CLOSED);
    expect(moves).toContain(TicketStatus.IN_PROGRESS);
    expect(moves).not.toContain(TicketStatus.OPEN);
  });

  it('closed only allows in_progress', () => {
    expect(LEGAL_TRANSITIONS[TicketStatus.CLOSED]).toEqual([TicketStatus.IN_PROGRESS]);
  });
});