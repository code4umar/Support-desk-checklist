import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';

@Injectable()
export class DirectoryService {
  constructor(@InjectRepository(User) private users: Repository<User>) {}

  // agents and admins only, and only the three fields a dropdown needs
  listStaff() {
    return this.users.find({
      where: { role: In([UserRole.AGENT, UserRole.ADMIN]) },
      select: { id: true, full_name: true, role: true },
      order: { full_name: 'ASC' },
    });
  }
}
