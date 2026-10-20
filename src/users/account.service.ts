import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { UserRole } from '../common/enums';
import { ActivityService } from '../activity/activity.service';
import { AuthUser } from '../common/decorators/current-user.decorator';

const BCRYPT_ROUNDS = 10;

const publicUser = (u: User) => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name,
  role: u.role,
  created_at: u.created_at,
});

// Everything about the signed-in person's own account, plus the admin-only user management.
@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private activity: ActivityService,
  ) {}

  // admins only (enforced by the controller)
  async listUsers() {
    const all = await this.users.find({ order: { created_at: 'ASC', id: 'ASC' } });
    return all.map(publicUser);
  }

  async updateProfile(userId: number, fullName: string) {
    const name = fullName.trim();
    if (!name) throw new BadRequestException('Name cannot be empty');

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.full_name === name) return publicUser(user);

    const old = user.full_name;
    user.full_name = name;
    await this.users.save(user);
    await this.activity.log({
      actorId: userId,
      action: 'profile_updated',
      targetType: 'user',
      targetId: userId,
      details: `Name changed from "${old}" to "${name}"`,
    });
    return publicUser(user);
  }

  async changePassword(userId: number, current: string, next: string) {
    // password_hash is select:false, so it has to be asked for explicitly
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.id = :id', { id: userId })
      .getOne();
    if (!user) throw new NotFoundException('User not found');

    // 400 (not 401) on purpose: the client signs people out on 401
    if (!(await bcrypt.compare(current, user.password_hash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (current === next) {
      throw new BadRequestException('New password must be different from the current one');
    }

    await this.users.update(userId, { password_hash: await bcrypt.hash(next, BCRYPT_ROUNDS) });
    await this.activity.log({
      actorId: userId,
      action: 'password_changed',
      targetType: 'user',
      targetId: userId,
    });
    return { message: 'Password updated' };
  }

  async setRole(actor: AuthUser, targetId: number, role: UserRole) {
    if (actor.id === targetId) {
      throw new BadRequestException('You cannot change your own role');
    }
    const target = await this.users.findOne({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === role) return publicUser(target);

    const old = target.role;
    target.role = role;
    await this.users.save(target);
    await this.activity.log({
      actorId: actor.id,
      action: 'role_changed',
      targetType: 'user',
      targetId,
      details: `${target.full_name}: ${old} → ${role}`,
    });
    return publicUser(target);
  }
}
