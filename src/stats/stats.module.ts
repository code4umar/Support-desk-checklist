import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { Ticket } from '../tickets/ticket.entity';
import { TicketEvent } from '../tickets/ticket-event.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, TicketEvent]), UsersModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}