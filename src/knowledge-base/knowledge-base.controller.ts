import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { KnowledgeBaseService } from './knowledge-base.service';
import { ArticleFeedbackDto, CreateArticleDto, ListArticlesQueryDto, UpdateArticleDto } from './dto/article.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums';

@Controller('kb')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KnowledgeBaseController {
  constructor(private kb: KnowledgeBaseService) {}

  // search + browse; also powers the "these articles might help" box on the new-ticket form
  @Get('articles')
  list(@Query() query: ListArticlesQueryDto, @CurrentUser() user: AuthUser) {
    return this.kb.list(query, user);
  }

  @Get('tags')
  tags(@CurrentUser() user: AuthUser) {
    return this.kb.tags(user);
  }

  // help-centre impact numbers for the staff dashboard
  @Get('insights')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  insights() {
    return this.kb.insights();
  }

  @Post('articles/:id/feedback')
  @HttpCode(HttpStatus.OK)
  feedback(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ArticleFeedbackDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.kb.feedback(id, dto, user);
  }

  @Get('articles/:id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.kb.findOne(id, user);
  }

  @Post('articles')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: AuthUser) {
    return this.kb.create(dto, user);
  }

  @Patch('articles/:id')
  @Roles(UserRole.AGENT, UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.kb.update(id, dto, user);
  }

  @Delete('articles/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.kb.remove(id, user);
  }
}
