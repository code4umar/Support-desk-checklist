import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UserRole } from '../common/enums';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { ActivityService } from '../activity/activity.service';
import { CategoriesService } from '../categories/categories.service';
import { ArticleFeedbackDto, CreateArticleDto, ListArticlesQueryDto, UpdateArticleDto } from './dto/article.dto';
import { escapeLike, excerpt, normalizeTags, searchTerms } from './kb-search';

export interface ArticleSummary {
  id: number;
  title: string;
  excerpt: string;
  tags: string[];
  category_id: number | null;
  category_name: string | null;
  published: boolean;
  updated_at: string;
}

export interface KbInsights {
  // "This solved it" clicks on new-ticket-form suggestions: tickets nobody had to file
  deflected_7d: number;
  votes_30d: number;
  helpful_rate_30d: number | null; // 0-100, null with no votes
  needs_work: { id: number; title: string; helpful: number; unhelpful: number }[];
}

export interface Article extends Omit<ArticleSummary, 'excerpt'> {
  body: string;
  author_id: number | null;
  author_name: string | null;
  created_at: string;
}

const rowsOf = (res: any): any[] => (Array.isArray(res?.[0]) ? res[0] : res);
const isStaff = (user: AuthUser) => user.role === UserRole.AGENT || user.role === UserRole.ADMIN;

// Help centre: staff write Markdown articles, everyone searches them
// (customers only see published ones, and get 404 for drafts).
@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectDataSource() private ds: DataSource,
    private categories: CategoriesService,
    private activity: ActivityService,
  ) {}

  async list(query: ListArticlesQueryDto, user: AuthUser): Promise<ArticleSummary[]> {
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where: string[] = [];
    if (!isStaff(user)) where.push('a.published');
    if (query.categoryId !== undefined) where.push(`a.category_id = ${p(query.categoryId)}`);
    if (query.tag) where.push(`${p(query.tag.trim().toLowerCase())} = ANY(a.tags)`);

    // Relevance: a hit in the title counts most, then a matching tag, then the body.
    const terms = searchTerms(query.q);
    // "???" or "%%" has nothing to match on: that's no results, not "everything"
    if (query.q?.trim() && !terms.length) return [];
    const score = terms.length
      ? terms
          .map((t) => {
            const like = p(`%${escapeLike(t)}%`);
            const exact = p(t);
            return `(CASE WHEN a.title ILIKE ${like} THEN 3 ELSE 0 END
                   + CASE WHEN ${exact} = ANY(a.tags) THEN 2 ELSE 0 END
                   + CASE WHEN a.body ILIKE ${like} THEN 1 ELSE 0 END)`;
          })
          .join(' + ')
      : '0';

    const rows = await this.ds.query(
      `SELECT * FROM (
         SELECT a.id, a.title, a.body, a.tags, a.category_id, c.name AS category_name,
                a.published, a.updated_at, ${score} AS score
           FROM kb_articles a
           LEFT JOIN categories c ON c.id = a.category_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ) hits
       ${terms.length ? 'WHERE score > 0' : ''}
       ORDER BY score DESC, updated_at DESC, id DESC
       LIMIT ${p(query.limit ?? 20)}`,
      params,
    );
    return rows.map(({ body, score: _score, ...r }: any) => ({ ...r, excerpt: excerpt(body) }));
  }

  async findOne(id: number, user: AuthUser): Promise<Article> {
    const rows = await this.ds.query(
      `SELECT a.id, a.title, a.body, a.tags, a.category_id, c.name AS category_name, a.published,
              a.author_id, u.full_name AS author_name, a.created_at, a.updated_at
         FROM kb_articles a
         LEFT JOIN categories c ON c.id = a.category_id
         LEFT JOIN users u ON u.id = a.author_id
        WHERE a.id = $1`,
      [id],
    );
    const article = rows[0];
    // a draft is invisible to customers, so they get the same 404 as a missing id
    if (!article || (!article.published && !isStaff(user))) {
      throw new NotFoundException('Article not found');
    }
    return article;
  }

  // Every distinct tag on a visible article, most used first: drives the tag chips.
  async tags(user: AuthUser): Promise<{ tag: string; count: number }[]> {
    return this.ds.query(
      `SELECT tag, count(*)::int AS count
         FROM kb_articles, unnest(tags) AS tag
        ${isStaff(user) ? '' : 'WHERE published'}
        GROUP BY tag
        ORDER BY count DESC, tag`,
    );
  }

  // Voting again from the same place replaces the earlier vote.
  async feedback(id: number, dto: ArticleFeedbackDto, user: AuthUser): Promise<{ helpful: boolean }> {
    await this.findOne(id, user); // 404s for drafts a customer can't see
    await this.ds.query(
      `INSERT INTO kb_feedback (article_id, user_id, helpful, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (article_id, user_id, source)
       DO UPDATE SET helpful = EXCLUDED.helpful, created_at = now()`,
      [id, user.id, dto.helpful, dto.source ?? 'article'],
    );
    return { helpful: dto.helpful };
  }

  async insights(): Promise<KbInsights> {
    const [totals] = await this.ds.query(
      `SELECT
         count(*) FILTER (WHERE source = 'ticket_form' AND helpful AND created_at > now() - interval '7 days')::int AS deflected_7d,
         count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS votes_30d,
         count(*) FILTER (WHERE helpful AND created_at > now() - interval '30 days')::int AS helpful_30d
       FROM kb_feedback`,
    );
    // articles people keep saying didn't help: the ones to rewrite first
    const needsWork = await this.ds.query(
      `SELECT a.id, a.title,
              count(*) FILTER (WHERE f.helpful)::int AS helpful,
              count(*) FILTER (WHERE NOT f.helpful)::int AS unhelpful
         FROM kb_feedback f
         JOIN kb_articles a ON a.id = f.article_id
        WHERE f.created_at > now() - interval '30 days'
        GROUP BY a.id, a.title
       HAVING count(*) FILTER (WHERE NOT f.helpful) > 0
        ORDER BY unhelpful DESC, helpful ASC, a.id
        LIMIT 3`,
    );
    return {
      deflected_7d: totals.deflected_7d,
      votes_30d: totals.votes_30d,
      helpful_rate_30d: totals.votes_30d ? Math.round((totals.helpful_30d / totals.votes_30d) * 100) : null,
      needs_work: needsWork,
    };
  }

  async create(dto: CreateArticleDto, user: AuthUser): Promise<Article> {
    await this.categories.assertExists(dto.categoryId);
    const rows = rowsOf(
      await this.ds.query(
        `INSERT INTO kb_articles (title, body, tags, category_id, published, author_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          dto.title.trim(),
          dto.body.trim(),
          normalizeTags(dto.tags),
          dto.categoryId ?? null,
          dto.published ?? true,
          user.id,
        ],
      ),
    );
    const id: number = rows[0].id;
    await this.activity.log({ actorId: user.id, action: 'article_created', targetType: 'article', targetId: id, details: dto.title.trim() });
    return this.findOne(id, user);
  }

  async update(id: number, dto: UpdateArticleDto, user: AuthUser): Promise<Article> {
    await this.findOne(id, user);
    if (dto.categoryId !== undefined) await this.categories.assertExists(dto.categoryId);

    const params: unknown[] = [];
    const sets: string[] = [];
    const set = (col: string, v: unknown) => {
      params.push(v);
      sets.push(`${col} = $${params.length}`);
    };
    if (dto.title !== undefined) set('title', dto.title.trim());
    if (dto.body !== undefined) set('body', dto.body.trim());
    if (dto.tags !== undefined) set('tags', normalizeTags(dto.tags));
    if (dto.categoryId !== undefined) set('category_id', dto.categoryId);
    if (dto.published !== undefined) set('published', dto.published);

    if (sets.length) {
      params.push(id);
      await this.ds.query(
        `UPDATE kb_articles SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
        params,
      );
      await this.activity.log({ actorId: user.id, action: 'article_updated', targetType: 'article', targetId: id });
    }
    return this.findOne(id, user);
  }

  async remove(id: number, user: AuthUser): Promise<void> {
    const rows = rowsOf(await this.ds.query(`DELETE FROM kb_articles WHERE id = $1 RETURNING title`, [id]));
    if (!rows.length) throw new NotFoundException('Article not found');
    await this.activity.log({ actorId: user.id, action: 'article_deleted', targetType: 'article', targetId: id, details: rows[0].title });
  }
}
