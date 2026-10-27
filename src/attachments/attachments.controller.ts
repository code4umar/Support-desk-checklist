import {
  Controller, Delete, Get, Param, ParseIntPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { MAX_FILE_BYTES, UploadedFileLike } from './attachment-rules';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller()
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  // POST /tickets/:ticketId/attachments   (multipart form, field name "file")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('tickets/:ticketId/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }))
  upload(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @UploadedFile() file: UploadedFileLike | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.upload(ticketId, file, user);
  }

  // GET /tickets/:ticketId/attachments   (list, no file contents)
  @Get('tickets/:ticketId/attachments')
  list(@Param('ticketId', ParseIntPipe) ticketId: number, @CurrentUser() user: AuthUser) {
    return this.service.list(ticketId, user);
  }

  // GET /attachments/:id/download
  @Get('attachments/:id/download')
  async download(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const file = await this.service.getFile(id, user);
    const inline = file.mime_type.startsWith('image/'); // images show in the page; everything else downloads
    const ascii = file.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.set({
      'Content-Type': file.mime_type,
      'Content-Length': String(file.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    });
    res.send(file.data);
  }

  // DELETE /attachments/:id   (staff, or the person who uploaded it)
  @Delete('attachments/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user);
  }
}
