import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { TicketAttachment } from './ticket-attachment.entity';
import { Ticket } from '../tickets/ticket.entity';
import { UserRole } from '../common/enums';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const png = () => ({ originalname: '../shot.png', mimetype: 'image/png', size: PNG.length, buffer: PNG });

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let files: any;
  let tickets: { findOne: jest.Mock };
  let qb: any;
  const owner = { id: 9, email: 'o@x.com', role: UserRole.CUSTOMER };
  const stranger = { id: 10, email: 's@x.com', role: UserRole.CUSTOMER };
  const agent = { id: 2, email: 'a@x.com', role: UserRole.AGENT };

  beforeEach(async () => {
    qb = { select: () => qb, addSelect: () => qb, where: () => qb, getRawOne: () => Promise.resolve({ count: '0', total: '0' }), getOne: jest.fn() };
    files = {
      createQueryBuilder: jest.fn(() => qb), create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve({ id: 5, created_at: new Date(), uploader: null, ...x })),
      find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), delete: jest.fn().mockResolvedValue({}),
    };
    tickets = { findOne: jest.fn().mockResolvedValue({ id: 7, requester_id: 9 }) };
    const moduleRef = await Test.createTestingModule({
      providers: [AttachmentsService, { provide: getRepositoryToken(TicketAttachment), useValue: files }, { provide: getRepositoryToken(Ticket), useValue: tickets }],
    }).compile();
    service = moduleRef.get(AttachmentsService);
  });

  it('saves a valid file with a cleaned name and never returns the file bytes', async () => {
    const meta: any = await service.upload(7, png(), owner);
    expect(files.save).toHaveBeenCalledWith(expect.objectContaining({ filename: 'shot.png', mime_type: 'image/png', uploaded_by: 9, ticket_id: 7 }));
    expect(meta.data).toBeUndefined();
    expect(meta.filename).toBe('shot.png');
  });

  it("the reply already carries the uploader's name", async () => {
    files.findOne.mockResolvedValue({ id: 5, ticket_id: 7, uploaded_by: 9, filename: 'shot.png', mime_type: 'image/png', size: 11, created_at: new Date(), uploader: { full_name: 'Ali Customer' } });
    const meta: any = await service.upload(7, png(), owner);
    expect(meta.uploader_name).toBe('Ali Customer');
  });

  it("another customer cannot touch a ticket that is not theirs (404, not 403)", async () => {
    await expect(service.upload(7, png(), stranger)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list(7, stranger)).rejects.toBeInstanceOf(NotFoundException);
    expect(files.save).not.toHaveBeenCalled();
  });

  it('staff can upload to any ticket', async () => {
    await expect(service.upload(7, png(), agent)).resolves.toBeDefined();
  });

  it('rejects: no file, wrong type, too big', async () => {
    await expect(service.upload(7, undefined, owner)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(7, { originalname: 'a.html', mimetype: 'text/html', size: 5, buffer: Buffer.from('<b>x') }, owner)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(7, { ...png(), size: 3 * 1024 * 1024 }, owner)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('enforces the per-ticket file count and total size', async () => {
    qb.getRawOne = () => Promise.resolve({ count: '10', total: '100' });
    await expect(service.upload(7, png(), owner)).rejects.toBeInstanceOf(BadRequestException);
    qb.getRawOne = () => Promise.resolve({ count: '1', total: String(10 * 1024 * 1024 - 5) });
    await expect(service.upload(7, png(), owner)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a customer may delete only their own files; staff may delete any', async () => {
    files.findOne.mockResolvedValue({ id: 5, ticket_id: 7, uploaded_by: 2 }); // uploaded by the agent
    await expect(service.remove(5, owner)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove(5, agent)).resolves.toEqual({ deleted: true });
    files.findOne.mockResolvedValue({ id: 6, ticket_id: 7, uploaded_by: 9 });
    await expect(service.remove(6, owner)).resolves.toEqual({ deleted: true });
  });

  it('download: 404 for a missing file, and hidden from other customers', async () => {
    qb.getOne.mockResolvedValue(null);
    await expect(service.getFile(1, owner)).rejects.toBeInstanceOf(NotFoundException);
    qb.getOne.mockResolvedValue({ id: 1, ticket_id: 7, data: PNG });
    await expect(service.getFile(1, stranger)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getFile(1, owner)).resolves.toBeDefined();
  });
});
