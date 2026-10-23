import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { Comment } from './comment.entity';
import { Ticket } from '../tickets/ticket.entity';
import { User } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole } from '../common/enums';

describe('CommentsService mentions', () => {
  let service: CommentsService;
  let comments: { create: jest.Mock; save: jest.Mock };
  let tickets: { findOne: jest.Mock };
  let users: { find: jest.Mock; findOne: jest.Mock };
  let notifications: { notifyUsers: jest.Mock };

  const agent = { id: 2, email: 'b@x.com', role: UserRole.AGENT };
  const customer = { id: 9, email: 'c@x.com', role: UserRole.CUSTOMER };
  const staff = [
    { id: 1, full_name: 'Ayesha Admin' },
    { id: 2, full_name: 'Bilal Agent' },
    { id: 3, full_name: 'Sara Agent' },
  ];

  beforeEach(async () => {
    comments = { create: jest.fn((x) => x), save: jest.fn((x) => Promise.resolve({ id: 50, ...x })) };
    tickets = { findOne: jest.fn().mockResolvedValue({ id: 7, subject: 'Printer broken', requester_id: 9 }) };
    users = { find: jest.fn().mockResolvedValue(staff), findOne: jest.fn().mockResolvedValue({ id: 2, full_name: 'Bilal Agent' }) };
    notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: comments },
        { provide: getRepositoryToken(Ticket), useValue: tickets },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(CommentsService);
  });

  it('notifies the mentioned staff member, linked to the ticket, and not the author', async () => {
    await service.create(7, { body: 'Hey @Sara Agent and @Bilal Agent, look' } as any, agent);
    expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);
    const arg = notifications.notifyUsers.mock.calls[0][0];
    expect(arg.userIds).toEqual([3]); // Bilal is the author, so only Sara
    expect(arg.type).toBe('mention');
    expect(arg.ticketId).toBe(7);
    expect(arg.message).toContain('Bilal Agent mentioned you on ticket #7');
  });

  it('does nothing when nobody is mentioned', async () => {
    await service.create(7, { body: 'No tags here' } as any, agent);
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('a customer can mention staff in a public comment', async () => {
    users.findOne.mockResolvedValue({ id: 9, full_name: 'Ali Customer' });
    await service.create(7, { body: '@Sara Agent any update?' } as any, customer);
    expect(notifications.notifyUsers.mock.calls[0][0].userIds).toEqual([3]);
  });

  it('a customer still cannot post an internal comment (rule 6 unchanged)', async () => {
    await expect(service.create(7, { body: '@Sara Agent', isInternal: true } as any, customer)).rejects.toBeInstanceOf(ForbiddenException);
    expect(notifications.notifyUsers).not.toHaveBeenCalled();
  });

  it('a failure while notifying never breaks the comment', async () => {
    users.find.mockRejectedValue(new Error('db down'));
    const saved = await service.create(7, { body: '@Sara Agent hi' } as any, agent);
    expect(saved.id).toBe(50);
  });
});
