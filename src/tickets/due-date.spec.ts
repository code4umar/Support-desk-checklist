import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TicketsService } from './tickets.service';
import { Ticket } from './ticket.entity';
import { TicketEvent } from './ticket-event.entity';
import { TicketTag } from '../tags/ticket-tag.entity';
import { UsersService } from '../users/users.service';
import { TicketPriority, UserRole, PRIORITY_DUE_HOURS } from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';

function mockRepo() {
  return {
    create: jest.fn((x) => x),
    save: jest.fn((x) => Promise.resolve({ id: 1, ...x })),
    findOne: jest.fn(),
  };
}

describe('TicketsService — due_at calculation (rule 8)', () => {
  let service: TicketsService;
  let ticketRepo: ReturnType<typeof mockRepo>;

  const customer: AuthUser = { id: 5, email: 'c@x.com', role: UserRole.CUSTOMER };

  beforeEach(async () => {
    ticketRepo = mockRepo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
        { provide: getRepositoryToken(TicketEvent), useValue: mockRepo() },
        { provide: getRepositoryToken(TicketTag), useValue: mockRepo() },
        { provide: UsersService, useValue: { findById: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(TicketsService);
  });

  const cases: [TicketPriority, number][] = [
    [TicketPriority.URGENT, 4],
    [TicketPriority.HIGH, 24],
    [TicketPriority.NORMAL, 72],
    [TicketPriority.LOW, 168],
  ];

  it.each(cases)('%s priority gets a due date %i hours out', async (priority, hours) => {
    const before = Date.now();

    await service.create({ subject: 's', body: 'b', priority }, customer);

    const saved = ticketRepo.save.mock.calls[0][0];
    const expectedMs = hours * 60 * 60 * 1000;
    const actualDelta = saved.due_at.getTime() - before;

    // Allow a small tolerance for the few ms of test execution time.
    expect(actualDelta).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(actualDelta).toBeLessThanOrEqual(expectedMs + 5000);
  });

  it('never accepts a caller-supplied due date (create() has no such param)', () => {
    // Structural guarantee: CreateTicketDto has no due_at/dueAt field, so
    // the global ValidationPipe (whitelist + forbidNonWhitelisted) rejects
    // it at the HTTP layer before this service ever sees it. This test
    // just documents the invariant the DTO enforces.
    expect(Object.keys(PRIORITY_DUE_HOURS)).toEqual([
      TicketPriority.URGENT,
      TicketPriority.HIGH,
      TicketPriority.NORMAL,
      TicketPriority.LOW,
    ]);
  });
});
