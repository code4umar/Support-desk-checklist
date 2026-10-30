import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { Ticket } from './ticket.entity';
import { TicketEvent } from './ticket-event.entity';
import { TicketTag } from '../tags/ticket-tag.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CategoriesService } from '../categories/categories.service';
import { TicketStatus, TicketPriority, UserRole } from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';

// A fresh set of jest.fn() mocks per test — no real database involved.
function mockRepo() {
  return {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 1, ...x })),
    findOne: jest.fn(),
    remove: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(),
  };
}

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepo: ReturnType<typeof mockRepo>;
  let eventRepo: ReturnType<typeof mockRepo>;
  let usersService: { findById: jest.Mock };
  let notifications: { notifyAdmins: jest.Mock; notifyUsers: jest.Mock };
  let categories: { assertExists: jest.Mock };

  const agent: AuthUser = { id: 99, email: 'agent@x.com', role: UserRole.AGENT };
  const customer: AuthUser = { id: 5, email: 'cust@x.com', role: UserRole.CUSTOMER };

  beforeEach(async () => {
    ticketRepo = mockRepo();
    eventRepo = mockRepo();
    usersService = { findById: jest.fn() };
    notifications = {
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
      notifyUsers: jest.fn().mockResolvedValue(undefined),
    };
    categories = { assertExists: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
        { provide: getRepositoryToken(TicketEvent), useValue: eventRepo },
        { provide: getRepositoryToken(TicketTag), useValue: mockRepo() },
        { provide: UsersService, useValue: usersService },
        { provide: NotificationsService, useValue: notifications },
        { provide: CategoriesService, useValue: categories },
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

  // ---- notifications: creating a ticket tells the admins
  it('notifies admins when a ticket is created (excluding the creator)', async () => {
    const saved = await service.create(
      { subject: 'Printer broken', body: 'It smokes', priority: TicketPriority.HIGH } as any,
      customer,
    );

    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    const arg = notifications.notifyAdmins.mock.calls[0][0];
    expect(arg.type).toBe('ticket_created');
    expect(arg.ticketId).toBe(saved.id);
    expect(arg.actorId).toBe(customer.id);
    expect(arg.message).toContain('Printer broken');
  });

  // ---- categories
  it('stores the category on create after checking it exists', async () => {
    const saved = await service.create(
      { subject: 'Refund', body: 'Please', priority: TicketPriority.LOW, categoryId: 3 } as any,
      customer,
    );
    expect(categories.assertExists).toHaveBeenCalledWith(3);
    expect(saved.category_id).toBe(3);
  });

  it('rejects an unknown category with 422 and saves nothing', async () => {
    categories.assertExists.mockRejectedValue(new UnprocessableEntityException('Category does not exist'));
    await expect(
      service.create({ subject: 'x', body: 'y', priority: TicketPriority.LOW, categoryId: 999 } as any, customer),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(ticketRepo.save).not.toHaveBeenCalled();
  });

  it('records priority and category edits in the audit trail', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 4, requester_id: customer.id, priority: TicketPriority.LOW, category_id: null,
    });
    const saved = await service.update(4, { priority: TicketPriority.HIGH, categoryId: 2 }, agent);

    expect(saved.category_id).toBe(2);
    expect(saved).not.toHaveProperty('categoryId');
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 4, note: 'Priority changed from low to high; Category set to #2' }),
    );
  });

  it('writes no audit event when nothing tracked changed', async () => {
    ticketRepo.findOne.mockResolvedValue({
      id: 4, requester_id: customer.id, priority: TicketPriority.LOW, category_id: null,
    });
    await service.update(4, { subject: 'New subject' }, customer);
    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  // ---- known issues
  it('resolving a known issue resolves its active linked tickets and tells their requesters', async () => {
    ticketRepo.findOne.mockResolvedValue({ ...ticketWith(TicketStatus.IN_PROGRESS), id: 10, subject: 'Login outage' });
    ticketRepo.find.mockResolvedValue([
      { id: 11, status: TicketStatus.OPEN, requester_id: 21, known_issue_id: 10 },
      { id: 12, status: TicketStatus.IN_PROGRESS, requester_id: 22, known_issue_id: 10 },
      { id: 13, status: TicketStatus.CLOSED, requester_id: 23, known_issue_id: 10 },
    ]);

    await service.changeStatus(10, { status: TicketStatus.RESOLVED } as any, agent);

    const savedIds = ticketRepo.save.mock.calls.map((c) => c[0].id);
    expect(savedIds).toEqual([10, 11, 12]); // the closed one is left alone
    expect(eventRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 11, from_status: 'open', to_status: 'resolved', note: 'Resolved together with known issue #10' }),
    );
    const arg = notifications.notifyUsers.mock.calls[0][0];
    expect(arg.userIds).toEqual([21, 22]);
    expect(arg.type).toBe('ticket_resolved');
  });

  it('does not cascade on other status changes', async () => {
    ticketRepo.findOne.mockResolvedValue(ticketWith(TicketStatus.OPEN));
    await service.changeStatus(1, { status: TicketStatus.IN_PROGRESS } as any, agent);
    expect(ticketRepo.find).not.toHaveBeenCalled();
  });

  it('links a ticket to a known issue and records it', async () => {
    ticketRepo.findOne
      .mockResolvedValueOnce({ id: 5, known_issue_id: null })
      .mockResolvedValueOnce({ id: 10, known_issue_id: null });
    const saved = await service.link(5, 10, agent);
    expect(saved.known_issue_id).toBe(10);
    expect(eventRepo.save).toHaveBeenCalledWith(expect.objectContaining({ ticket_id: 5, note: 'Linked to known issue #10' }));
  });

  it('refuses links that would self-link, chain, or orphan dependants', async () => {
    await expect(service.link(5, 5, agent)).rejects.toBeInstanceOf(BadRequestException);

    ticketRepo.findOne
      .mockResolvedValueOnce({ id: 5, known_issue_id: null })
      .mockResolvedValueOnce({ id: 10, known_issue_id: 3 });
    await expect(service.link(5, 10, agent)).rejects.toBeInstanceOf(UnprocessableEntityException);

    ticketRepo.findOne
      .mockResolvedValueOnce({ id: 5, known_issue_id: null })
      .mockResolvedValueOnce({ id: 10, known_issue_id: null });
    ticketRepo.count.mockResolvedValueOnce(2);
    await expect(service.link(5, 10, agent)).rejects.toBeInstanceOf(ConflictException);
  });
});
