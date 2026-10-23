import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './comment.entity';
import { Ticket } from '../tickets/ticket.entity';
import { CommentsService } from './comments.service';
import { User } from '../users/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommentsController } from './comments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Ticket, User]), NotificationsModule],
  providers: [CommentsService],
  controllers: [CommentsController],
})
export class CommentsModule {}
