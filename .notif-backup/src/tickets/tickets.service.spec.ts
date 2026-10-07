import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { Ticket } from './ticket.entity';
import { TicketEvent } from './ticket-event.entity';
import { TicketTag } from '../tags/ticket-tag.entity';
import { UsersService } from '../users/users.service';
import { TicketStatus, TicketPriority, UserRole } from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';

// A fresh set of jest.fn() mocks per test — no real database involved.
function mockRepo() {
  return {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 1, ...x })),
    findOne: jest.fn(),
    remove: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
}

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepo: ReturnType<typeof mockRepo>;
  let eventRepo: ReturnType<typeof mockRepo>;
  let usersService: { findById: jest.Mock };

  const agent: AuthUser = { id: 99, email: 'agent@x.com', role: UserRole.AGENT };
  const customer: AuthUser = { id: 5, email: 'cust@x.com', role: UserRole.CUSTOMER };

  beforeEach(async () => {
    ticketRepo = mockRepo();
    eventRepo = mockRepo();
    usersService = { findById: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
        { provide: getRepositoryToken(TicketEvent), useValue: eventRepo },
        { provide: getRepositoryToken(TicketTag), useValue: mockRepo() },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = moduleRef.get(TicketsService);
  });

  function ticketWith(status: TicketStatus) {
    return {
      id: 1,
      status,
      priority: TicketPriority.NORMAL,
      requester_id: 5,
      assignee_id: null,
    };
  }

  // ---- Every legal transition succeeds ----
  const legalMoves: [TicketStatus, TicketStatus][] = [
    [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
    [TicketStatus.IN_PROGRESS, TicketStatus.RESOLVED],
    [TicketStatus.RESOLVED, TicketStatus.CLOSED],
    [TicketStatus.RESOLVED, TicketStatus.IN_PROGRESS],
    [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  ];

  it.each(legalMoves)('allows %s -> %s', async (from, to) => {
    ticketRepo.findOne.mockResolvedValue(ticketWith(from));
    const note = from === TicketStatus.CLOSED ? 'reopening for follow-up' : undefined;

    const result = await service.changeStatus(1, { status: to, note }, agent);

    expect(result.status).toBe(to);
    expect(eventRepo.save).toHaveBeenCalled();
  });

  // ---- Every illegal transition is rejected with 409 ----
  const illegalMoves: [TicketStatus, TicketStatus][] = [
    [TicketStatus.OPEN, TicketStatus.RESOLVED],
    [TicketStatus.OPEN, TicketStatus.CLOSED],
    [TicketStatus.IN_PROGRESS, TicketStatus.OPEN],
    [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
    [TicketStatus.RESOLVED, TicketStatus.OPEN],
    [TicketStatus.CLOSED, TicketStatus.OPEN],
    [TicketStatus.CLOSED, TicketStatus.RESOLVED],
  ];

  it.each(illegalMoves)('rejects %s -> %s with 409', async (from, to) => {
    ticketRepo.findOne.mockResolvedValue(ticketWith(from));

    await expect(
      service.changeStatus(1, { status: to }, agent),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // ---- Reopening closed without a note is a 400, not a 409 ----
  it('rejects closed -> in_progress with no note as 400', async () => {
    ticketRepo.findOne.mockResolvedValue(ticketWith(TicketStatus.CLOSED));

    await expect(
      service.changeStatus(1, { status: TicketStatus.IN_PROGRESS }, agent),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects closed -> in_progress with a blank/whitespace note as 400', async () => {
    ticketRepo.findOne.mockResolvedValue(ticketWith(TicketStatus.CLOSED));

    await expect(
      service.changeStatus(1, { status: TicketStatus.IN_PROGRESS, note: '   ' }, agent),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts closed -> in_progress with a real note', async () => {
    ticketRepo.findOne.mockResolvedValue(ticketWith(TicketStatus.CLOSED));

    const result = await service.changeStatus(
      1,
      { status: TicketStatus.IN_PROGRESS, note: 'customer says it is still broken' },
      agent,
    );
    expect(result.status).toBe(TicketStatus.IN_PROGRESS);
  });

  // ---- Rule 5: assigning a non-agent/admin is 422 ----
  it('rejects assigning a customer as assignee with 422', async () => {
    ticketRepo.findOne.mockResolvedValue(ticketWith(TicketStatus.OPEN));
    usersService.findById.mockResolvedValue({ id: 5, role: UserRole.CUSTOMER });

    await expect(
      service.assign(1, { assigneeId: 5 }, agent),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('accepts assigning an agent as assignee', async () => {
    ticketRepo.findOne.mockResolvedValue(ticketWith(TicketStatus.OPEN));
    usersService.findById.mockResolvedValue({
      id: 7,
      role: UserRole.AGENT,
      full_name: 'Some Agent',
    });

    const result = await service.assign(1, { assigneeId: 7 }, agent);
    expect(result.assignee_id).toBe(7);
    expect(eventRepo.save).toHaveBeenCalled(); // rule 7: assignment writes an event
  });
});
