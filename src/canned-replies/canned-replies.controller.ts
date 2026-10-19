import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CannedRepliesService } from './canned-replies.service';
import { CreateCannedReplyDto } from './dto/create-canned-reply.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

@Controller('canned-replies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CannedRepliesController {
  constructor(private replies: CannedRepliesService) {}

  @Get()
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  list() {
    return this.replies.list();
  }

  @Post()
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  create(@Body() dto: CreateCannedReplyDto, @CurrentUser() user: AuthUser) {
    return this.replies.create(dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.replies.remove(id, user);
  }
}
