import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { RateTicketDto } from './dto/rate-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RatingsController {
  constructor(private ratings: RatingsService) {}

  @Post('tickets/:id/rating')
  @HttpCode(HttpStatus.OK)
  rate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ratings.rate(id, dto, user);
  }

  @Get('tickets/:id/rating')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ratings.getForTicket(id, user);
  }

  // average rating for the dashboard (staff only)
  @Get('ratings/summary')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  summary() {
    return this.ratings.summary();
  }
}
