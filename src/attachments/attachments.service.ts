import { BadRequestException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketAttachment } from './ticket-attachment.entity';
import { Ticket } from '../tickets/ticket.entity';
import { assertTicketVisible } from '../common/utils/ticket-visibility';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { MAX_FILES_PER_TICKET, MAX_TOTAL_BYTES, UploadedFileLike, sanitizeFilename, validateUpload } from './attachment-rules';

const toMeta = (a: TicketAttachment) => ({
  id: a.id,
  ticket_id: a.ticket_id,
  filename: a.filename,
  mime_type: a.mime_type,
  size: a.size,
  uploaded_by: a.uploaded_by,
  uploader_name: a.uploader?.full_name ?? null,
  created_at: a.created_at,
});

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(TicketAttachment) private files: Repository<TicketAttachment>,
    @InjectRepository(Ticket) private tickets: Repository<Ticket>,
  ) {}

  // Same visibility rule as everything else: a customer can only reach files on their own tickets (others get 404).
  private async ticketFor(ticketId: number, user: AuthUser) {
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    assertTicketVisible(ticket, user);
    return ticket;
  }

  async upload(ticketId: number, file: UploadedFileLike | undefined, user: AuthUser) {
    await this.ticketFor(ticketId, user);
    if (!file) throw new BadRequestException('No file was uploaded');

    const check = validateUpload(file);
    if (!check.ok) {
      throw check.reason.includes('2 MB') ? new PayloadTooLargeException(check.reason) : new BadRequestException(check.reason);
    }

    const stats = await this.files
      .createQueryBuilder('a')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(a.size), 0)', 'total')
      .where('a.ticket_id = :ticketId', { ticketId })
      .getRawOne<{ count: string; total: string }>();
    if (Number(stats?.count ?? 0) >= MAX_FILES_PER_TICKET) {
      throw new BadRequestException(`A ticket can have at most ${MAX_FILES_PER_TICKET} files`);
    }
    if (Number(stats?.total ?? 0) + file.size > MAX_TOTAL_BYTES) {
      throw new BadRequestException('This ticket has reached its 10 MB file limit');
    }

    const saved = await this.files.save(
      this.files.create({
        ticket_id: ticketId,
        uploaded_by: user.id,
        filename: sanitizeFilename(file.originalname),
        mime_type: check.mime,
        size: file.size,
        data: file.buffer,
      }),
    );
    // read it back with the uploader's name, so the page can show who added it straight away
    const full = await this.files.findOne({ where: { id: saved.id }, relations: { uploader: true } });
    return toMeta(full ?? saved);
  }

  async list(ticketId: number, user: AuthUser) {
    await this.ticketFor(ticketId, user);
    const rows = await this.files.find({
      where: { ticket_id: ticketId },
      relations: { uploader: true },
      order: { created_at: 'ASC', id: 'ASC' },
    });
    return rows.map(toMeta);
  }

  async getFile(id: number, user: AuthUser) {
    const file = await this.files.createQueryBuilder('a').addSelect('a.data').where('a.id = :id', { id }).getOne();
    if (!file) throw new NotFoundException('File not found');
    await this.ticketFor(file.ticket_id, user);
    return file;
  }

  async remove(id: number, user: AuthUser) {
    const file = await this.files.findOne({ where: { id } });
    if (!file) throw new NotFoundException('File not found');
    await this.ticketFor(file.ticket_id, user);
    if (user.role === UserRole.CUSTOMER && file.uploaded_by !== user.id) {
      throw new ForbiddenException('You can only delete files you uploaded');
    }
    await this.files.delete(id);
    return { deleted: true };
  }
}
