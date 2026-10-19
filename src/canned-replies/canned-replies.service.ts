import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { CreateCannedReplyDto } from './dto/create-canned-reply.dto';

export interface CannedReply {
  id: number;
  title: string;
  body: string;
  created_by: number | null;
  created_by_name: string | null;
}

// TypeORM answers INSERT ... RETURNING with rows, but UPDATE/DELETE with [rows, count]
const rowsOf = (res: any): any[] => (Array.isArray(res?.[0]) ? res[0] : res);

// A shared library of ready-made answers for the whole support team.
@Injectable()
export class CannedRepliesService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  list(): Promise<CannedReply[]> {
    return this.ds.query(
      `SELECT r.id, r.title, r.body, r.created_by, u.full_name AS created_by_name
         FROM canned_replies r
         LEFT JOIN users u ON u.id = r.created_by
        ORDER BY lower(r.title), r.id`,
    );
  }

  async create(dto: CreateCannedReplyDto, user: AuthUser): Promise<CannedReply> {
    const title = dto.title.trim();
    const body = dto.body.trim();
    if (!title || !body) {
      throw new BadRequestException('A saved reply needs a title and some text');
    }
    const rows = rowsOf(
      await this.ds.query(
        `INSERT INTO canned_replies (title, body, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, title, body, created_by`,
        [title, body, user.id],
      ),
    );
    return { ...rows[0], created_by_name: null };
  }

  // You can delete your own replies; admins can delete any (including the starter ones).
  async remove(id: number, user: AuthUser): Promise<void> {
    const rows: { id: number; created_by: number | null }[] = await this.ds.query(
      `SELECT id, created_by FROM canned_replies WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Saved reply not found');
    if (user.role !== UserRole.ADMIN && row.created_by !== user.id) {
      throw new ForbiddenException('You can only delete your own saved replies');
    }
    await this.ds.query(`DELETE FROM canned_replies WHERE id = $1`, [id]);
  }
}
