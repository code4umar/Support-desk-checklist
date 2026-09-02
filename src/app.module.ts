import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './users/user.entity';
import { Ticket } from './tickets/ticket.entity';
import { Comment } from './comments/comment.entity';
import { Tag } from './tags/tag.entity';
import { TicketTag } from './tags/ticket-tag.entity';
import { TicketEvent } from './tickets/ticket-event.entity';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TicketsModule } from './tickets/tickets.module';
import { CommentsModule } from './comments/comments.module';
import { TagsModule } from './tags/tags.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
        entities: [User, Ticket, Comment, Tag, TicketTag, TicketEvent],
        synchronize: false, // schema only changes via migrations
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    UsersModule,
    TicketsModule,
    CommentsModule,
    TagsModule,
  ],
})
export class AppModule {}

