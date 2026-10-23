#!/usr/bin/env node
// Deskly BACKEND Phase 3: @mentions in comments. Tagging "@Sara Agent" sends Sara a notification linked to the ticket.
// Run from the backend repo root:   node apply-phase3-backend.mjs          Undo:  node apply-phase3-backend.mjs --revert

import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const BACKUP = path.join(ROOT, '.phase3-backup');
const MANIFEST = '.phase3-created.json';
const abs = (p) => path.join(ROOT, p);
const exists = (p) => fs.existsSync(abs(p));
const read = (p) => fs.readFileSync(abs(p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), s); };
const backup = (p) => { const d = path.join(BACKUP, p); if (exists(p) && !fs.existsSync(d)) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(abs(p), d); } };
const created = [];
const warnings = [];
if (process.argv.includes('--revert')) {
  let n = 0;
  if (fs.existsSync(BACKUP)) (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else { fs.copyFileSync(p, abs(path.relative(BACKUP, p))); n++; } } })(BACKUP);
  if (exists(MANIFEST)) { for (const rel of JSON.parse(read(MANIFEST))) if (exists(rel)) { fs.unlinkSync(abs(rel)); n++; } fs.unlinkSync(abs(MANIFEST)); }
  console.log(n ? `Phase 3 removed (${n} files restored/deleted).` : 'Nothing to revert.');
  process.exit(0);
}
function createFile(rel, content) {
  const had = exists(rel);
  if (had && read(rel) === content) return;
  if (!had) created.push(rel); else backup(rel);
  write(rel, content);
}
function edit(rel, label, from, to, doneMarker) {
  if (!exists(rel)) { warnings.push(`${rel} not found (${label})`); return; }
  const s = read(rel);
  if (s.includes(doneMarker)) return;
  if (!s.includes(from)) { warnings.push(`${rel}: could not find the place for "${label}". That part was skipped.`); return; }
  backup(rel); write(rel, s.replace(from, to));
}
function editRe(rel, label, re, to, doneMarker) {
  if (!exists(rel)) { warnings.push(`${rel} not found (${label})`); return; }
  const s = read(rel);
  if (s.includes(doneMarker)) return;
  if (!re.test(s)) { warnings.push(`${rel}: could not find the place for "${label}". That part was skipped.`); return; }
  backup(rel); write(rel, s.replace(re, to));
}

if (!exists('package.json') || !exists('src/comments/comments.service.ts')) {
  console.error('Run this from the backend repo root (the folder with package.json and src/).'); process.exit(1);
}
if (!exists('src/notifications/notifications.service.ts')) {
  console.error('The notifications update is missing. Run apply-notifications-backend.mjs first.'); process.exit(1);
}

createFile("src/comments/mentions.ts", "export interface Mentionable {\n  id: number;\n  full_name: string;\n}\n\nconst escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');\n\n// Finds the people tagged as \"@Full Name\" in a comment.\n//  - case-insensitive, any amount of spacing inside the name\n//  - an email like \"a@Sara.com\" is NOT a mention (the @ must not be glued to a word before it)\n//  - \"@Sara Agentx\" is not \"@Sara Agent\" (the name must end at a word boundary)\nexport function findMentionedUsers<T extends Mentionable>(body: string, candidates: T[], excludeId?: number): T[] {\n  if (!body || !body.includes('@')) return [];\n  const found = new Map<number, T>();\n  for (const c of candidates) {\n    const name = c.full_name?.trim();\n    if (!name || c.id === excludeId) continue;\n    const pattern = escapeRegex(name).replace(/\\s+/g, '\\\\s+');\n    const re = new RegExp(`(?<![\\\\p{L}\\\\p{N}._%+-])@${pattern}(?![\\\\p{L}\\\\p{N}_])`, 'iu');\n    if (re.test(body)) found.set(c.id, c);\n  }\n  return [...found.values()];\n}\n");
createFile("src/comments/mentions.spec.ts", "import { findMentionedUsers } from './mentions';\n\nconst staff = [\n  { id: 1, full_name: 'Ayesha Admin' },\n  { id: 2, full_name: 'Bilal Agent' },\n  { id: 3, full_name: 'Sara Agent' },\n];\n\ndescribe('findMentionedUsers', () => {\n  it('finds one or several people', () => {\n    expect(findMentionedUsers('Hi @Bilal Agent, please check', staff).map((u) => u.id)).toEqual([2]);\n    expect(findMentionedUsers('@Sara Agent and @Ayesha Admin FYI', staff).map((u) => u.id).sort()).toEqual([1, 3]);\n  });\n\n  it('ignores case and extra spaces', () => {\n    expect(findMentionedUsers('cc @bilal   agent', staff).map((u) => u.id)).toEqual([2]);\n  });\n\n  it('works at the very start and end of the text and before punctuation', () => {\n    expect(findMentionedUsers('@Sara Agent', staff).map((u) => u.id)).toEqual([3]);\n    expect(findMentionedUsers('thanks @Sara Agent.', staff).map((u) => u.id)).toEqual([3]);\n    expect(findMentionedUsers('(@Sara Agent)', staff).map((u) => u.id)).toEqual([3]);\n  });\n\n  it('does not treat emails or partial names as mentions', () => {\n    expect(findMentionedUsers('mail me at team@Sara Agent.com', staff)).toEqual([]);\n    expect(findMentionedUsers('@Sara Agentx', staff)).toEqual([]);\n    expect(findMentionedUsers('Sara Agent without the at sign', staff)).toEqual([]);\n  });\n\n  it('never returns the author and never returns duplicates', () => {\n    expect(findMentionedUsers('@Bilal Agent @Bilal Agent', staff, 2)).toEqual([]);\n    expect(findMentionedUsers('@Bilal Agent @Bilal Agent', staff).length).toBe(1);\n  });\n\n  it('is safe with odd input', () => {\n    expect(findMentionedUsers('', staff)).toEqual([]);\n    expect(findMentionedUsers('@Bil(al', [{ id: 9, full_name: 'Bil(al' }]).length).toBe(1); // regex characters in names are escaped\n    expect(findMentionedUsers('@x', [{ id: 9, full_name: '   ' }])).toEqual([]);\n  });\n});\n");
createFile("src/comments/comments.service.spec.ts", "import { Test } from '@nestjs/testing';\nimport { getRepositoryToken } from '@nestjs/typeorm';\nimport { ForbiddenException } from '@nestjs/common';\nimport { CommentsService } from './comments.service';\nimport { Comment } from './comment.entity';\nimport { Ticket } from '../tickets/ticket.entity';\nimport { User } from '../users/user.entity';\nimport { NotificationsService } from '../notifications/notifications.service';\nimport { UserRole } from '../common/enums';\n\ndescribe('CommentsService mentions', () => {\n  let service: CommentsService;\n  let comments: { create: jest.Mock; save: jest.Mock };\n  let tickets: { findOne: jest.Mock };\n  let users: { find: jest.Mock; findOne: jest.Mock };\n  let notifications: { notifyUsers: jest.Mock };\n\n  const agent = { id: 2, email: 'b@x.com', role: UserRole.AGENT };\n  const customer = { id: 9, email: 'c@x.com', role: UserRole.CUSTOMER };\n  const staff = [\n    { id: 1, full_name: 'Ayesha Admin' },\n    { id: 2, full_name: 'Bilal Agent' },\n    { id: 3, full_name: 'Sara Agent' },\n  ];\n\n  beforeEach(async () => {\n    comments = { create: jest.fn((x) => x), save: jest.fn((x) => Promise.resolve({ id: 50, ...x })) };\n    tickets = { findOne: jest.fn().mockResolvedValue({ id: 7, subject: 'Printer broken', requester_id: 9 }) };\n    users = { find: jest.fn().mockResolvedValue(staff), findOne: jest.fn().mockResolvedValue({ id: 2, full_name: 'Bilal Agent' }) };\n    notifications = { notifyUsers: jest.fn().mockResolvedValue(undefined) };\n    const moduleRef = await Test.createTestingModule({\n      providers: [\n        CommentsService,\n        { provide: getRepositoryToken(Comment), useValue: comments },\n        { provide: getRepositoryToken(Ticket), useValue: tickets },\n        { provide: getRepositoryToken(User), useValue: users },\n        { provide: NotificationsService, useValue: notifications },\n      ],\n    }).compile();\n    service = moduleRef.get(CommentsService);\n  });\n\n  it('notifies the mentioned staff member, linked to the ticket, and not the author', async () => {\n    await service.create(7, { body: 'Hey @Sara Agent and @Bilal Agent, look' } as any, agent);\n    expect(notifications.notifyUsers).toHaveBeenCalledTimes(1);\n    const arg = notifications.notifyUsers.mock.calls[0][0];\n    expect(arg.userIds).toEqual([3]); // Bilal is the author, so only Sara\n    expect(arg.type).toBe('mention');\n    expect(arg.ticketId).toBe(7);\n    expect(arg.message).toContain('Bilal Agent mentioned you on ticket #7');\n  });\n\n  it('does nothing when nobody is mentioned', async () => {\n    await service.create(7, { body: 'No tags here' } as any, agent);\n    expect(notifications.notifyUsers).not.toHaveBeenCalled();\n  });\n\n  it('a customer can mention staff in a public comment', async () => {\n    users.findOne.mockResolvedValue({ id: 9, full_name: 'Ali Customer' });\n    await service.create(7, { body: '@Sara Agent any update?' } as any, customer);\n    expect(notifications.notifyUsers.mock.calls[0][0].userIds).toEqual([3]);\n  });\n\n  it('a customer still cannot post an internal comment (rule 6 unchanged)', async () => {\n    await expect(service.create(7, { body: '@Sara Agent', isInternal: true } as any, customer)).rejects.toBeInstanceOf(ForbiddenException);\n    expect(notifications.notifyUsers).not.toHaveBeenCalled();\n  });\n\n  it('a failure while notifying never breaks the comment', async () => {\n    users.find.mockRejectedValue(new Error('db down'));\n    const saved = await service.create(7, { body: '@Sara Agent hi' } as any, agent);\n    expect(saved.id).toBe(50);\n  });\n});\n");

// notification type + a method to notify specific people (no database change needed: the type column is plain text)
edit('src/notifications/notification.entity.ts', 'MENTION type', "  USER_LOGIN = 'user_login',", "  USER_LOGIN = 'user_login',\n  MENTION = 'mention',", "MENTION = 'mention'");
edit('src/notifications/notifications.service.ts', 'notifyUsers', '  // One call gives the bell everything it needs', `  // Notifies specific people (e.g. someone tagged in a comment), never the person who caused it.
  // Like notifyAdmins, it must NEVER break the main action.
  async notifyUsers(input: {
    userIds: number[];
    type: NotificationType;
    message: string;
    ticketId?: number | null;
    actorId?: number | null;
  }): Promise<void> {
    try {
      const ids = [...new Set(input.userIds)].filter((id) => id !== input.actorId);
      if (ids.length === 0) return;
      await this.notifications.save(
        ids.map((id) =>
          this.notifications.create({
            user_id: id,
            type: input.type,
            message: input.message,
            ticket_id: input.ticketId ?? null,
            actor_id: input.actorId ?? null,
            read_at: null,
          }),
        ),
      );
    } catch (err) {
      this.logger.warn(\`Could not create notification: \${(err as Error).message}\`);
    }
  }

  // One call gives the bell everything it needs`, 'async notifyUsers');

const CM = 'src/comments/comments.module.ts';
edit(CM, 'imports', "import { CommentsService } from './comments.service';", "import { CommentsService } from './comments.service';\nimport { User } from '../users/user.entity';\nimport { NotificationsModule } from '../notifications/notifications.module';", 'NotificationsModule');
edit(CM, 'module imports', 'imports: [TypeOrmModule.forFeature([Comment, Ticket])],', 'imports: [TypeOrmModule.forFeature([Comment, Ticket, User]), NotificationsModule],', 'Ticket, User]');

const CS = 'src/comments/comments.service.ts';
edit(CS, 'typeorm import', "import { Repository } from 'typeorm';", "import { In, Repository } from 'typeorm';", 'import { In, Repository }');
edit(CS, 'imports', "import { CreateCommentDto } from './dto/create-comment.dto';", "import { CreateCommentDto } from './dto/create-comment.dto';\nimport { User } from '../users/user.entity';\nimport { NotificationsService } from '../notifications/notifications.service';\nimport { NotificationType } from '../notifications/notification.entity';\nimport { findMentionedUsers } from './mentions';", 'findMentionedUsers');
edit(CS, 'constructor', '    @InjectRepository(Ticket) private tickets: Repository<Ticket>,\n  ) {}', '    @InjectRepository(Ticket) private tickets: Repository<Ticket>,\n    @InjectRepository(User) private users: Repository<User>,\n    private notifications: NotificationsService,\n  ) {}', 'private notifications: NotificationsService');
edit(CS, 'create()', '    return this.comments.save(comment);\n  }\n\n  async findAllForTicket', `    const saved = await this.comments.save(comment);
    await this.notifyMentions(saved.body, ticketId, ticket.subject, user);
    return saved;
  }

  // "@Name" in a comment -> that staff member gets a notification. It can never block the comment itself.
  private async notifyMentions(body: string, ticketId: number, subject: string | undefined, user: AuthUser) {
    try {
      if (!body || !body.includes('@')) return;
      const staff = await this.users.find({ where: { role: In([UserRole.AGENT, UserRole.ADMIN]) } });
      const mentioned = findMentionedUsers(body, staff, user.id);
      if (mentioned.length === 0) return;

      const author = await this.users.findOne({ where: { id: user.id } });
      const who = author?.full_name ?? 'Someone';
      const title = subject && subject.length > 60 ? \`\${subject.slice(0, 57)}…\` : subject ?? '';
      await this.notifications.notifyUsers({
        userIds: mentioned.map((m) => m.id),
        type: NotificationType.MENTION,
        message: \`\${who} mentioned you on ticket #\${ticketId}\${title ? \`: \${title}\` : ''}\`,
        ticketId,
        actorId: user.id,
      });
    } catch {
      /* never block the comment */
    }
  }

  async findAllForTicket`, 'notifyMentions');

if (created.length) write(MANIFEST, JSON.stringify(created, null, 2));
console.log('\nPhase 3 backend done. (No migration needed.)');
if (warnings.length) { console.log('\nCheck these (skipped parts):'); warnings.forEach((w) => console.log(' - ' + w)); }
console.log('\nNext:  npm test    then restart the backend (npm run start:dev)');
console.log('Undo anytime:  node apply-phase3-backend.mjs --revert');
