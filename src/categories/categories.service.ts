import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateCategoryDto } from './dto/create-category.dto';

export interface Category {
  id: number;
  name: string;
  ticket_count: number;
  article_count: number;
}

// TypeORM answers INSERT ... RETURNING with rows, but UPDATE/DELETE with [rows, count]
const rowsOf = (res: any): any[] => (Array.isArray(res?.[0]) ? res[0] : res);

// One shared list of categories for tickets and help articles.
@Injectable()
export class CategoriesService {
  constructor(@InjectDataSource() private ds: DataSource) {}

  list(): Promise<Category[]> {
    return this.ds.query(
      `SELECT c.id, c.name,
              (SELECT count(*)::int FROM tickets t WHERE t.category_id = c.id) AS ticket_count,
              (SELECT count(*)::int FROM kb_articles a WHERE a.category_id = c.id AND a.published) AS article_count
         FROM categories c
        ORDER BY lower(c.name), c.id`,
    );
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('A category needs a name');
    const clash = await this.ds.query(`SELECT 1 FROM categories WHERE lower(name) = lower($1)`, [name]);
    if (clash.length) throw new ConflictException(`A category called "${name}" already exists`);
    const rows = rowsOf(
      await this.ds.query(`INSERT INTO categories (name) VALUES ($1) RETURNING id, name`, [name]),
    );
    return { ...rows[0], ticket_count: 0, article_count: 0 };
  }

  // Tickets and articles in this category are kept; the FK sets them to NULL.
  async remove(id: number): Promise<void> {
    const rows = rowsOf(await this.ds.query(`DELETE FROM categories WHERE id = $1 RETURNING id`, [id]));
    if (!rows.length) throw new NotFoundException('Category not found');
  }

  // Used by tickets and articles: a categoryId that points nowhere is a 422, like a bad assignee.
  async assertExists(id: number | null | undefined): Promise<void> {
    if (id === null || id === undefined) return;
    const rows = await this.ds.query(`SELECT 1 FROM categories WHERE id = $1`, [id]);
    if (!rows.length) throw new UnprocessableEntityException('Category does not exist');
  }
}
