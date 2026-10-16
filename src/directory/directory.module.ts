import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { DirectoryController } from './directory.controller';
import { DirectoryService } from './directory.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [DirectoryController],
  providers: [DirectoryService],
})
export class DirectoryModule {}
