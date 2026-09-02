import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from './tag.entity';
import { TicketTag } from './ticket-tag.entity';
import { Ticket } from '../tickets/ticket.entity';
import { TagsService } from './tags.service';
import { TagsController } from './tags.controller';
import { TicketTagsController } from './ticket-tags.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tag, TicketTag, Ticket])],
  providers: [TagsService],
  controllers: [TagsController, TicketTagsController],
})
export class TagsModule {}
