import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';
import { UserRole } from '../common/enums';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { sanitizeUser } from '../common/utils/sanitize-user';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';

const BCRYPT_ROUNDS = 10;
const RESET_TTL_MS = 60 * 60 * 1000; // reset links live for 1 hour

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
    private notifications: NotificationsService,
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

    // tell every admin (except the person logging in) that someone signed in
    await this.notifications.notifyAdmins({
      type: NotificationType.USER_LOGIN,
      message: `${user.full_name} (${user.role}) logged in`,
      actorId: user.id,
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

  // ---- Password reset ----
  // Always answers the same way, so nobody can use this to learn which
  // emails are registered.
    async forgotPassword(dto: ForgotPasswordDto) {
    const generic = {
      message: 'If an account exists for that email, a reset link has been sent.',
    };
    console.log('[forgotPassword] request received for', dto.email);

    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user) {
      console.log('[forgotPassword] NO USER found for', dto.email);
      return generic;
    }

    // only the SHA-256 hash is stored; the real token only ever exists in the email link
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    // a new request cancels any older unused links for this user
    await this.users.query(
      `UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [user.id],
    );
    await this.users.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [user.id, sha256(token), expiresAt],
    );
    // housekeeping: drop rows that expired more than a day ago
    await this.users.query(
      `DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'`,
    );

    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    const link = `${base}/reset-password?token=${token}`;
    console.log('[forgotPassword] RESET LINK (temporary debug):', link);
    this.deliverResetLink(user.email, link);

    return generic;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const password_hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // One atomic statement: marks the token used only if it is unused AND
    // not expired, so a link can never be used twice.
    const res: any = await this.users.query(
      `UPDATE password_resets
          SET used_at = now()
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [sha256(dto.token)],
    );
    const rows = Array.isArray(res?.[0]) ? res[0] : res;
    const userId = rows?.[0]?.user_id;
    if (!userId) {
      throw new BadRequestException('Reset link is invalid or has expired');
    }

    await this.users.update({ id: userId }, { password_hash });

    // any other outstanding links for this user are now useless
    await this.users.query(
      `UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );

    return { message: 'Password updated' };
  }

  // No email service yet. In development the link is printed in this terminal.
  // In production nothing is sent until an email provider (e.g. Resend) is wired in here.
  private deliverResetLink(email: string, link: string) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`Password reset link for ${email}: ${link}`);
    }
  }
}