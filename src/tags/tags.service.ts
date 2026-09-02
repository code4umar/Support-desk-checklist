import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './tag.entity';
import { TicketTag } from './ticket-tag.entity';
import { Ticket } from '../tickets/ticket.entity';
import { AuthUser } from '../common/decorators/current-user.decorator';
import { assertTicketVisible } from '../common/utils/ticket-visibility';
import { CreateTagDto } from './dto/create-tag.dto';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag) private tags: Repository<Tag>,
    @InjectRepository(TicketTag) private ticketTags: Repository<TicketTag>,
    @InjectRepository(Ticket) private tickets: Repository<Ticket>,
  ) {}

  findAll(): Promise<Tag[]> {
    return this.tags.find({ order: { name: 'ASC' } });
  }

  async create(dto: CreateTagDto): Promise<Tag> {
    const existing = await this.tags.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException('A tag with this name already exists');
    }
    return this.tags.save(this.tags.create({ name: dto.name }));
  }

  async attach(ticketId: number, tagId: number, user: AuthUser): Promise<Tag[]> {
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    assertTicketVisible(ticket, user); // agent/admin only reach here anyway (guarded), but 404 on a missing ticket either way

    const tag = await this.tags.findOne({ where: { id: tagId } });
    if (!tag) throw new NotFoundException('Tag not found');

    const existing = await this.ticketTags.findOne({
      where: { ticket_id: ticketId, tag_id: tagId },
    });
    if (!existing) {
      await this.ticketTags.save(
        this.ticketTags.create({ ticket_id: ticketId, tag_id: tagId }),
      );
    }
    return this.listTagsForTicket(ticketId);
  }

  async remove(ticketId: number, tagId: number, user: AuthUser): Promise<void> {
    const ticket = await this.tickets.findOne({ where: { id: ticketId } });
    assertTicketVisible(ticket, user);

    const link = await this.ticketTags.findOne({
      where: { ticket_id: ticketId, tag_id: tagId },
    });
    if (!link) throw new NotFoundException('This tag is not attached to the ticket');
    await this.ticketTags.remove(link);
  }

  private async listTagsForTicket(ticketId: number): Promise<Tag[]> {
    const links = await this.ticketTags.find({
      where: { ticket_id: ticketId },
      relations: ['tag'],
    });
    return links.map((l) => l.tag);
  }
}
