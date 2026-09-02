import { Body, Controller, Delete, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { IsInt } from 'class-validator';
import { TagsService } from './tags.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

class AttachTagDto {
  @IsInt()
  tagId: number;
}

@Controller('tickets/:ticketId/tags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.AGENT, UserRole.ADMIN)
export class TicketTagsController {
  constructor(private tagsService: TagsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  attach(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AttachTagDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tagsService.attach(ticketId, dto.tagId, user);
  }

  @Delete(':tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('tagId', ParseIntPipe) tagId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tagsService.remove(ticketId, tagId, user);
  }
}
