import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private ai: AiService) {}

  // every click costs an API call, so this is limited to 8 per minute
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post(':id/suggest-reply')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  suggest(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ai.suggestReply(id, user);
  }
}
