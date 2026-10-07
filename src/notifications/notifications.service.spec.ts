import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Notification, NotificationType } from './notification.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notifRepo: {
    create: jest.Mock; save: jest.Mock; find: jest.Mock; count: jest.Mock;
    findOne: jest.Mock; update: jest.Mock;
  };
  let userRepo: { find: jest.Mock };

  beforeEach(async () => {
    notifRepo = {
      create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve(x)),
      find: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };
    userRepo = { find: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notifRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  it('creates one notification per admin, skipping the person who caused it', async () => {
    userRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    await service.notifyAdmins({
      type: NotificationType.USER_LOGIN,
      message: 'Sam logged in',
      actorId: 2,
    });

    expect(userRepo.find).toHaveBeenCalledWith({ where: { role: UserRole.ADMIN } });
    const rows = notifRepo.save.mock.calls[0][0];
    expect(rows.map((r: any) => r.user_id)).toEqual([1, 3]);
    expect(rows[0]).toMatchObject({ type: 'user_login', message: 'Sam logged in', read_at: null });
  });

  it('saves nothing when the only admin is the actor', async () => {
    userRepo.find.mockResolvedValue([{ id: 1 }]);
    await service.notifyAdmins({ type: NotificationType.USER_LOGIN, message: 'x', actorId: 1 });
    expect(notifRepo.save).not.toHaveBeenCalled();
  });

  it('never throws, even if the database fails', async () => {
    userRepo.find.mockRejectedValue(new Error('db down'));
    await expect(
      service.notifyAdmins({ type: NotificationType.TICKET_CREATED, message: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('list returns items plus the unread count', async () => {
    notifRepo.find.mockResolvedValue([{ id: 9 }]);
    notifRepo.count.mockResolvedValue(4);
    await expect(service.list(1, 20)).resolves.toEqual({ unread: 4, items: [{ id: 9 }] });
  });

  it('markRead only touches the owner\'s notification and 404s otherwise', async () => {
    notifRepo.findOne.mockResolvedValue(null);
    await expect(service.markRead(5, 1)).rejects.toBeInstanceOf(NotFoundException);
    expect(notifRepo.findOne).toHaveBeenCalledWith({ where: { id: 5, user_id: 1 } });
  });

  it('markRead stamps read_at once', async () => {
    notifRepo.findOne.mockResolvedValue({ id: 5, user_id: 1, read_at: null });
    const n = await service.markRead(5, 1);
    expect(n.read_at).toBeInstanceOf(Date);
    expect(notifRepo.save).toHaveBeenCalledTimes(1);
  });

  it('markAllRead reports how many rows were updated', async () => {
    notifRepo.update.mockResolvedValue({ affected: 3 });
    await expect(service.markAllRead(1)).resolves.toEqual({ updated: 3 });
  });
});
