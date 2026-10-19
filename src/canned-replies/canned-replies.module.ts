import { Module } from '@nestjs/common';
import { CannedRepliesController } from './canned-replies.controller';
import { CannedRepliesService } from './canned-replies.service';

// No TypeOrmModule.forFeature needed: the service only uses the shared DataSource.
@Module({
  controllers: [CannedRepliesController],
  providers: [CannedRepliesService],
})
export class CannedRepliesModule {}
