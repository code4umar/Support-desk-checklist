import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { User } from './users/user.entity';
import { Ticket } from './tickets/ticket.entity';
import { Comment } from './comments/comment.entity';
import { Tag } from './tags/tag.entity';
import { TicketTag } from './tags/ticket-tag.entity';
import { TicketEvent } from './tickets/ticket-event.entity';
import { Notification } from './notifications/notification.entity';
import { ActivityLog } from './activity/activity-log.entity';
import { TicketAttachment } from './attachments/ticket-attachment.entity';
import { HealthController } from './health/health.controller';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TicketsModule } from './tickets/tickets.module';
import { CommentsModule } from './comments/comments.module';
import { TagsModule } from './tags/tags.module';
import { StatsModule } from './stats/stats.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ActivityModule } from './activity/activity.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { DirectoryModule } from './directory/directory.module';
import { RatingsModule } from './ratings/ratings.module';
import { AiModule } from './ai/ai.module';
import { MailModule } from './mail/mail.module';
import { CannedRepliesModule } from './canned-replies/canned-replies.module';
import { CategoriesModule } from './categories/categories.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: parseInt(config.get('DB_PORT', '5432'), 10),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_DATABASE', 'support_desk'),
        ssl: config.get('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
        entities: [User, Ticket, Comment, Tag, TicketTag, TicketEvent, Notification, ActivityLog, TicketAttachment],
        synchronize: false, // schema only changes via migrations
        logging: config.get('NODE_ENV') === 'development',
        // on Vercel a request can't wait out ~30s of reconnect attempts: fail fast and say why
        ...(process.env.VERCEL ? { retryAttempts: 1, retryDelay: 500 } : {}),
      }),
    }),
    MailModule,
    AuthModule,
    UsersModule,
    TicketsModule,
    CommentsModule,
    TagsModule,
    StatsModule,
    NotificationsModule,
    ActivityModule,
    AttachmentsModule,
    DirectoryModule,
    RatingsModule,
    AiModule,
    CannedRepliesModule,
    CategoriesModule,
    KnowledgeBaseModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
