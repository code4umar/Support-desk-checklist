import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AccountService } from './account.service';
import { User } from './user.entity';
import { ActivityService } from '../activity/activity.service';
import { UserRole } from '../common/enums';

describe('AccountService', () => {
  let service: AccountService;
  let repo: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; update: jest.Mock; createQueryBuilder: jest.Mock };
  let activity: { log: jest.Mock };
  const admin = { id: 1, email: 'a@x.com', role: 'admin' };

  beforeEach(async () => {
    repo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn((x) => Promise.resolve(x)),
      update: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn(),
    };
    activity = { log: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: ActivityService, useValue: activity },
      ],
    }).compile();
    service = moduleRef.get(AccountService);
  });

  const withPasswordHash = (hash: string | null) => {
    const qb: any = {
      addSelect: () => qb,
      where: () => qb,
      getOne: () => Promise.resolve(hash ? { id: 1, password_hash: hash } : null),
    };
    repo.createQueryBuilder.mockReturnValue(qb);
  };

  it('listUsers never exposes password hashes', async () => {
    repo.find.mockResolvedValue([{ id: 1, email: 'a@x.com', full_name: 'A', role: 'admin', created_at: new Date(), password_hash: 'SECRET' }]);
    const out = await service.listUsers();
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });

  it('updateProfile trims, saves and logs; rejects blank names', async () => {
    repo.findOne.mockResolvedValue({ id: 1, full_name: 'Old', email: 'a@x.com', role: 'agent', created_at: new Date() });
    await service.updateProfile(1, '  New Name  ');
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ full_name: 'New Name' }));
    expect(activity.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'profile_updated', actorId: 1 }));
    await expect(service.updateProfile(1, '   ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changePassword: wrong current password is a 400 (not a 401)', async () => {
    withPasswordHash(bcrypt.hashSync('oldpass123', 4));
    await expect(service.changePassword(1, 'nope', 'newpass123')).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('changePassword: same password is rejected, a new one is hashed and logged', async () => {
    withPasswordHash(bcrypt.hashSync('oldpass123', 4));
    await expect(service.changePassword(1, 'oldpass123', 'oldpass123')).rejects.toBeInstanceOf(BadRequestException);

    await service.changePassword(1, 'oldpass123', 'brandnew123');
    const [, patch] = repo.update.mock.calls[0];
    expect(await bcrypt.compare('brandnew123', patch.password_hash)).toBe(true);
    expect(activity.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'password_changed' }));
  });

  it('changePassword: unknown user -> 404', async () => {
    withPasswordHash(null);
    await expect(service.changePassword(9, 'a', 'bbbbbbbb')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('setRole: an admin can never change their own role', async () => {
    await expect(service.setRole(admin, 1, UserRole.CUSTOMER)).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('setRole: changes another user and writes an activity entry', async () => {
    repo.findOne.mockResolvedValue({ id: 5, full_name: 'Sam', email: 's@x.com', role: UserRole.CUSTOMER, created_at: new Date() });
    const out = await service.setRole(admin, 5, UserRole.AGENT);
    expect(out.role).toBe(UserRole.AGENT);
    expect(activity.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'role_changed', actorId: 1, targetId: 5, details: expect.stringContaining('customer → agent') }),
    );
  });

  it('setRole: unknown target -> 404', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.setRole(admin, 77, UserRole.AGENT)).rejects.toBeInstanceOf(NotFoundException);
  });
});
