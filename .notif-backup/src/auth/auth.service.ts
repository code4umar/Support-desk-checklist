import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { sanitizeUser } from '../common/utils/sanitize-user';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.users.create({
      email: dto.email,
      password_hash,
      full_name: dto.full_name,
      role: UserRole.CUSTOMER, // rule 1: registration ALWAYS creates a customer
    });
    const saved = await this.users.save(user);
    return sanitizeUser(saved);
  }

  async login(dto: LoginDto) {
    // password_hash has select:false on the entity, so it must be
    // explicitly re-added here — this is the one place that's allowed.
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const matches = await bcrypt.compare(dto.password, user.password_hash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const access_token = this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return { access_token, user: sanitizeUser(user) };
  }

  async me(userId: number) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return sanitizeUser(user);
  }
}
