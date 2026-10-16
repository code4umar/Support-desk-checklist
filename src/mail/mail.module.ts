import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

// Global, so any service can inject MailService without importing this module.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
