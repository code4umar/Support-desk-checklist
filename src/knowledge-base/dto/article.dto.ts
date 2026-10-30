import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_TAGS } from '../kb-search';

export class CreateArticleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  // Markdown
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  body: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  // null clears it
  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class UpdateArticleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_TAGS)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export const FEEDBACK_SOURCES = ['article', 'ticket_form'] as const;

export class ArticleFeedbackDto {
  @IsBoolean()
  helpful: boolean;

  // 'ticket_form' = the vote came from a suggestion on the new-ticket form
  @IsOptional()
  @IsIn(FEEDBACK_SOURCES)
  source?: (typeof FEEDBACK_SOURCES)[number];
}

export class ListArticlesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
