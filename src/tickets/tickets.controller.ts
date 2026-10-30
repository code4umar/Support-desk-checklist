import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ListTicketsQueryDto } from './dto/list-tickets.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { LinkTicketDto, SimilarTicketsQueryDto } from './dto/link-ticket.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard) // every route here requires a token; @Roles() narrows further
export class TicketsController {
  constructor(private ticketsService: TicketsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthUser) {
    return this.ticketsService.create(dto, user);
  }

  @Get()
  findAll(@Query() query: ListTicketsQueryDto, @CurrentUser() user: AuthUser) {
    return this.ticketsService.findAll(query, user);
  }

  // declared before ':id' so "similar" isn't parsed as an id
  @Get('similar')
  findSimilar(@Query() query: SimilarTicketsQueryDto, @CurrentUser() user: AuthUser) {
    return this.ticketsService.findSimilar(query.q, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ticketsService.findVisibleOrFail(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.update(id, dto, user);
  }

  @Post(':id/assign')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.assign(id, dto, user);
  }

  @Post(':id/status')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.changeStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.ticketsService.remove(id);
  }

  @Post(':id/link')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  link(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LinkTicketDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ticketsService.link(id, dto.knownIssueId, user);
  }

  @Delete(':id/link')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  unlink(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ticketsService.unlink(id, user);
  }

  @Get(':id/linked')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  listLinked(@Param('id', ParseIntPipe) id: number) {
    return this.ticketsService.listLinked(id);
  }

  @Get(':id/events')
  listEvents(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.ticketsService.listEvents(id, user);
  }
}
