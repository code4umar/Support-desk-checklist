import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums';

@Controller('activity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  // GET /activity?limit=50  (admins only, newest first)
  @Get()
  list(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.activity.list(Math.min(Math.max(limit, 1), 100));
  }
}
