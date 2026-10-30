import { Module } from '@nestjs/common';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { CategoriesModule } from '../categories/categories.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [CategoriesModule, ActivityModule],
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
