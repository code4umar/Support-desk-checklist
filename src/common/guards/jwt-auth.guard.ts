import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    // Every endpoint except register/login goes through this guard.
    // No token, or a bad/expired one, always lands here as 401.
    if (err || !user) {
      throw err || new UnauthorizedException();
    }
    return user;
  }
}
