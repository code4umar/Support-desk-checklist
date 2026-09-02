import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../enums';

// Applied on top of JwtAuthGuard. If a route has no @Roles() metadata,
// this guard is a no-op — any signed-in user passes. Rule 3 of the spec
// ("only agent or admin may assign/status/tag") is enforced declaratively
// by putting @Roles(UserRole.AGENT, UserRole.ADMIN) on those handlers,
// never by an `if` inside a service — that's the mistake mentors watch for.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires one of these roles: ${requiredRoles.join(', ')}`,
      );
    }
    return true;
  }
}
