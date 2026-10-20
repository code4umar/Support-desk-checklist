import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AccountService } from './account.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly account: AccountService) {}

  // GET /users  (admins only)
  @Get()
  @Roles(UserRole.ADMIN)
  list() {
    return this.account.listUsers();
  }

  // PATCH /users/me  { full_name }
  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.account.updateProfile(user.id, dto.full_name);
  }

  // POST /users/me/password  { current_password, new_password }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.account.changePassword(user.id, dto.current_password, dto.new_password);
  }

  // PATCH /users/:id/role  { role }  (admins only; never your own)
  @Patch(':id/role')
  @Roles(UserRole.ADMIN)
  setRole(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.account.setRole(user, id, dto.role);
  }
}
