import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

// Every route is scoped to the signed-in user: you only ever see / change your own.
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    return this.service.list(user.id, safeLimit);
  }

  // declared BEFORE ':id/read' so "read-all" is never parsed as an id
  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.service.markAllRead(user.id);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.markRead(id, user.id);
  }
}
