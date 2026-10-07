import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './ticket.entity';
import { TicketEvent } from './ticket-event.entity';
import { TicketTag } from '../tags/ticket-tag.entity';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketEvent, TicketTag]),
    UsersModule,
  ],
  providers: [TicketsService],
  controllers: [TicketsController],
  exports: [TicketsService, TypeOrmModule],
})
export class TicketsModule {}
