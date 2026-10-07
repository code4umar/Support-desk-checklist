#!/usr/bin/env node
// Deskly BACKEND: admin notifications (ticket created + user login).
// Run from the backend repo root:  node apply-notifications-backend.mjs     Undo: node apply-notifications-backend.mjs --revert

import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const BACKUP = path.join(ROOT, '.notif-backup');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(path.join(ROOT, p)), { recursive: true }); fs.writeFileSync(path.join(ROOT, p), s); };
const created = [];
const touched = new Set();
const warnings = [];
function backup(rel) {
  if (touched.has(rel)) return; touched.add(rel);
  const dest = path.join(BACKUP, rel);
  if (fs.existsSync(dest)) return;
  if (exists(rel)) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), dest); }
}
function save(rel, s) { backup(rel); write(rel, s); }
// create a new file (never overwrites a file that already has different content without backing it up)
function createFile(rel, content) {
  const had = exists(rel);
  if (had && read(rel) === content) return;
  if (!had) created.push(rel);
  save(rel, content);
}
// replace `from` by `to` once; skip if already applied; warn if the anchor is missing
function edit(rel, label, from, to, doneMarker) {
  if (!exists(rel)) { warnings.push(`${rel} not found (${label})`); return; }
  let s = read(rel);
  if (doneMarker && s.includes(doneMarker)) return;
  if (!s.includes(from)) { warnings.push(`${rel}: could not find the place to edit (${label}). See the notes at the end of the instructions.`); return; }
  save(rel, s.replace(from, to));
}
function revert() {
  if (!fs.existsSync(BACKUP) && !fs.existsSync(path.join(ROOT, '.notif-created.json'))) { console.error('Nothing to revert.'); process.exit(1); }
  let n = 0;
  (function w(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else { const rel = path.relative(BACKUP, p); fs.mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true }); fs.copyFileSync(p, path.join(ROOT, rel)); n++; } } })(BACKUP);
  if (fs.existsSync(path.join(ROOT, '.notif-created.json'))) {
    for (const rel of JSON.parse(read('.notif-created.json'))) { if (exists(rel)) { fs.unlinkSync(path.join(ROOT, rel)); n++; } }
    fs.unlinkSync(path.join(ROOT, '.notif-created.json'));
  }
  console.log(`Reverted (${n} files). You can delete the .notif-backup folder now.`);
  process.exit(0);
}
if (process.argv.includes('--revert')) revert();
function finish(nextSteps) {
  if (created.length) write('.notif-created.json', JSON.stringify(created, null, 2));
  console.log(`\nDone. ${touched.size} files written (originals backed up in .notif-backup/).`);
  if (warnings.length) { console.log('\nCheck these:'); warnings.forEach((w) => console.log(' - ' + w)); }
  console.log('\n' + nextSteps);
  console.log('Undo anytime:  node ' + path.basename(process.argv[1]) + ' --revert');
}

if (!exists('package.json') || !exists('src/app.module.ts') || !exists('src/tickets/tickets.service.ts')) {
  console.error('Run this from the backend repo root (the folder with package.json and src/).'); process.exit(1);
}

createFile("src/notifications/notification.entity.ts", "import {\n  Entity,\n  PrimaryGeneratedColumn,\n  Column,\n  CreateDateColumn,\n  ManyToOne,\n  JoinColumn,\n  Index,\n} from 'typeorm';\nimport { User } from '../users/user.entity';\nimport { Ticket } from '../tickets/ticket.entity';\n\nexport enum NotificationType {\n  TICKET_CREATED = 'ticket_created',\n  USER_LOGIN = 'user_login',\n}\n\n// One row per recipient: if 3 admins exist, a new ticket creates 3 rows,\n// so each admin has their own read / unread state.\n@Entity('notifications')\n@Index('IDX_notifications_user_read', ['user_id', 'read_at'])\nexport class Notification {\n  @PrimaryGeneratedColumn()\n  id: number;\n\n  // the person who RECEIVES the notification\n  @Column()\n  user_id: number;\n\n  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })\n  @JoinColumn({ name: 'user_id' })\n  user: User;\n\n  @Column({ type: 'varchar', length: 40 })\n  type: NotificationType;\n\n  @Column({ type: 'text' })\n  message: string;\n\n  // set for ticket notifications; becomes NULL if the ticket is deleted\n  @Column({ type: 'int', nullable: true })\n  ticket_id: number | null;\n\n  @ManyToOne(() => Ticket, { nullable: true, onDelete: 'SET NULL' })\n  @JoinColumn({ name: 'ticket_id' })\n  ticket: Ticket | null;\n\n  // who caused it (the user who logged in / created the ticket)\n  @Column({ type: 'int', nullable: true })\n  actor_id: number | null;\n\n  @Column({ type: 'timestamptz', nullable: true })\n  read_at: Date | null;\n\n  @CreateDateColumn({ type: 'timestamptz' })\n  created_at: Date;\n}\n");
createFile("src/notifications/notifications.service.ts", "import { Injectable, Logger, NotFoundException } from '@nestjs/common';\nimport { InjectRepository } from '@nestjs/typeorm';\nimport { IsNull, Repository } from 'typeorm';\nimport { Notification, NotificationType } from './notification.entity';\nimport { User } from '../users/user.entity';\nimport { UserRole } from '../common/enums';\n\nexport interface NotifyAdminsInput {\n  type: NotificationType;\n  message: string;\n  ticketId?: number | null;\n  actorId?: number | null;\n}\n\n@Injectable()\nexport class NotificationsService {\n  private readonly logger = new Logger(NotificationsService.name);\n\n  constructor(\n    @InjectRepository(Notification) private notifications: Repository<Notification>,\n    @InjectRepository(User) private users: Repository<User>,\n  ) {}\n\n  // Creates one notification for every admin, except the person who caused the\n  // event (an admin doesn't need to be told about their own login / ticket).\n  // It must NEVER break the main action, so every failure is logged and swallowed.\n  async notifyAdmins(input: NotifyAdminsInput): Promise<void> {\n    try {\n      const admins = await this.users.find({ where: { role: UserRole.ADMIN } });\n      const rows = admins\n        .filter((a) => a.id !== input.actorId)\n        .map((a) =>\n          this.notifications.create({\n            user_id: a.id,\n            type: input.type,\n            message: input.message,\n            ticket_id: input.ticketId ?? null,\n            actor_id: input.actorId ?? null,\n            read_at: null,\n          }),\n        );\n      if (rows.length > 0) {\n        await this.notifications.save(rows);\n      }\n    } catch (err) {\n      this.logger.warn(`Could not create notification: ${(err as Error).message}`);\n    }\n  }\n\n  // One call gives the bell everything it needs (list + unread badge number).\n  async list(userId: number, limit = 20) {\n    const [items, unread] = await Promise.all([\n      this.notifications.find({\n        where: { user_id: userId },\n        order: { created_at: 'DESC', id: 'DESC' },\n        take: limit,\n      }),\n      this.notifications.count({ where: { user_id: userId, read_at: IsNull() } }),\n    ]);\n    return { unread, items };\n  }\n\n  async markRead(id: number, userId: number): Promise<Notification> {\n    // user_id in the filter = nobody can touch someone else's notification\n    const n = await this.notifications.findOne({ where: { id, user_id: userId } });\n    if (!n) {\n      throw new NotFoundException('Notification not found');\n    }\n    if (!n.read_at) {\n      n.read_at = new Date();\n      await this.notifications.save(n);\n    }\n    return n;\n  }\n\n  async markAllRead(userId: number): Promise<{ updated: number }> {\n    const res = await this.notifications.update(\n      { user_id: userId, read_at: IsNull() },\n      { read_at: new Date() },\n    );\n    return { updated: res.affected ?? 0 };\n  }\n}\n");
createFile("src/notifications/notifications.controller.ts", "import {\n  Controller,\n  DefaultValuePipe,\n  Get,\n  Param,\n  ParseIntPipe,\n  Patch,\n  Query,\n  UseGuards,\n} from '@nestjs/common';\nimport { NotificationsService } from './notifications.service';\nimport { JwtAuthGuard } from '../common/guards/jwt-auth.guard';\nimport { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';\n\n// Every route is scoped to the signed-in user: you only ever see / change your own.\n@Controller('notifications')\n@UseGuards(JwtAuthGuard)\nexport class NotificationsController {\n  constructor(private readonly service: NotificationsService) {}\n\n  @Get()\n  list(\n    @CurrentUser() user: AuthUser,\n    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,\n  ) {\n    const safeLimit = Math.min(Math.max(limit, 1), 50);\n    return this.service.list(user.id, safeLimit);\n  }\n\n  // declared BEFORE ':id/read' so \"read-all\" is never parsed as an id\n  @Patch('read-all')\n  markAllRead(@CurrentUser() user: AuthUser) {\n    return this.service.markAllRead(user.id);\n  }\n\n  @Patch(':id/read')\n  markRead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {\n    return this.service.markRead(id, user.id);\n  }\n}\n");
createFile("src/notifications/notifications.module.ts", "import { Module } from '@nestjs/common';\nimport { TypeOrmModule } from '@nestjs/typeorm';\nimport { Notification } from './notification.entity';\nimport { User } from '../users/user.entity';\nimport { NotificationsService } from './notifications.service';\nimport { NotificationsController } from './notifications.controller';\n\n@Module({\n  imports: [TypeOrmModule.forFeature([Notification, User])],\n  providers: [NotificationsService],\n  controllers: [NotificationsController],\n  exports: [NotificationsService],\n})\nexport class NotificationsModule {}\n");
createFile("src/notifications/notifications.service.spec.ts", "import { Test } from '@nestjs/testing';\nimport { getRepositoryToken } from '@nestjs/typeorm';\nimport { NotFoundException } from '@nestjs/common';\nimport { NotificationsService } from './notifications.service';\nimport { Notification, NotificationType } from './notification.entity';\nimport { User } from '../users/user.entity';\nimport { UserRole } from '../common/enums';\n\ndescribe('NotificationsService', () => {\n  let service: NotificationsService;\n  let notifRepo: {\n    create: jest.Mock; save: jest.Mock; find: jest.Mock; count: jest.Mock;\n    findOne: jest.Mock; update: jest.Mock;\n  };\n  let userRepo: { find: jest.Mock };\n\n  beforeEach(async () => {\n    notifRepo = {\n      create: jest.fn((x) => x),\n      save: jest.fn((x) => Promise.resolve(x)),\n      find: jest.fn(),\n      count: jest.fn(),\n      findOne: jest.fn(),\n      update: jest.fn(),\n    };\n    userRepo = { find: jest.fn() };\n\n    const moduleRef = await Test.createTestingModule({\n      providers: [\n        NotificationsService,\n        { provide: getRepositoryToken(Notification), useValue: notifRepo },\n        { provide: getRepositoryToken(User), useValue: userRepo },\n      ],\n    }).compile();\n    service = moduleRef.get(NotificationsService);\n  });\n\n  it('creates one notification per admin, skipping the person who caused it', async () => {\n    userRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);\n\n    await service.notifyAdmins({\n      type: NotificationType.USER_LOGIN,\n      message: 'Sam logged in',\n      actorId: 2,\n    });\n\n    expect(userRepo.find).toHaveBeenCalledWith({ where: { role: UserRole.ADMIN } });\n    const rows = notifRepo.save.mock.calls[0][0];\n    expect(rows.map((r: any) => r.user_id)).toEqual([1, 3]);\n    expect(rows[0]).toMatchObject({ type: 'user_login', message: 'Sam logged in', read_at: null });\n  });\n\n  it('saves nothing when the only admin is the actor', async () => {\n    userRepo.find.mockResolvedValue([{ id: 1 }]);\n    await service.notifyAdmins({ type: NotificationType.USER_LOGIN, message: 'x', actorId: 1 });\n    expect(notifRepo.save).not.toHaveBeenCalled();\n  });\n\n  it('never throws, even if the database fails', async () => {\n    userRepo.find.mockRejectedValue(new Error('db down'));\n    await expect(\n      service.notifyAdmins({ type: NotificationType.TICKET_CREATED, message: 'x' }),\n    ).resolves.toBeUndefined();\n  });\n\n  it('list returns items plus the unread count', async () => {\n    notifRepo.find.mockResolvedValue([{ id: 9 }]);\n    notifRepo.count.mockResolvedValue(4);\n    await expect(service.list(1, 20)).resolves.toEqual({ unread: 4, items: [{ id: 9 }] });\n  });\n\n  it('markRead only touches the owner\\'s notification and 404s otherwise', async () => {\n    notifRepo.findOne.mockResolvedValue(null);\n    await expect(service.markRead(5, 1)).rejects.toBeInstanceOf(NotFoundException);\n    expect(notifRepo.findOne).toHaveBeenCalledWith({ where: { id: 5, user_id: 1 } });\n  });\n\n  it('markRead stamps read_at once', async () => {\n    notifRepo.findOne.mockResolvedValue({ id: 5, user_id: 1, read_at: null });\n    const n = await service.markRead(5, 1);\n    expect(n.read_at).toBeInstanceOf(Date);\n    expect(notifRepo.save).toHaveBeenCalledTimes(1);\n  });\n\n  it('markAllRead reports how many rows were updated', async () => {\n    notifRepo.update.mockResolvedValue({ affected: 3 });\n    await expect(service.markAllRead(1)).resolves.toEqual({ updated: 3 });\n  });\n});\n");
createFile("src/migrations/1790300000000-AddNotifications.ts", "import { MigrationInterface, QueryRunner } from \"typeorm\";\n\nexport class AddNotifications1790300000000 implements MigrationInterface {\n    name = 'AddNotifications1790300000000'\n\n    public async up(queryRunner: QueryRunner): Promise<void> {\n        await queryRunner.query(`CREATE TABLE \"notifications\" (\n            \"id\" SERIAL NOT NULL,\n            \"user_id\" integer NOT NULL,\n            \"type\" character varying(40) NOT NULL,\n            \"message\" text NOT NULL,\n            \"ticket_id\" integer,\n            \"actor_id\" integer,\n            \"read_at\" TIMESTAMP WITH TIME ZONE,\n            \"created_at\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),\n            CONSTRAINT \"PK_notifications_id\" PRIMARY KEY (\"id\")\n        )`);\n        await queryRunner.query(`CREATE INDEX \"IDX_notifications_user_read\" ON \"notifications\" (\"user_id\", \"read_at\")`);\n        await queryRunner.query(`ALTER TABLE \"notifications\" ADD CONSTRAINT \"FK_notifications_user\" FOREIGN KEY (\"user_id\") REFERENCES \"users\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION`);\n        await queryRunner.query(`ALTER TABLE \"notifications\" ADD CONSTRAINT \"FK_notifications_ticket\" FOREIGN KEY (\"ticket_id\") REFERENCES \"tickets\"(\"id\") ON DELETE SET NULL ON UPDATE NO ACTION`);\n    }\n\n    public async down(queryRunner: QueryRunner): Promise<void> {\n        await queryRunner.query(`ALTER TABLE \"notifications\" DROP CONSTRAINT \"FK_notifications_ticket\"`);\n        await queryRunner.query(`ALTER TABLE \"notifications\" DROP CONSTRAINT \"FK_notifications_user\"`);\n        await queryRunner.query(`DROP INDEX \"IDX_notifications_user_read\"`);\n        await queryRunner.query(`DROP TABLE \"notifications\"`);\n    }\n}\n");

// ---- app.module.ts
edit('src/app.module.ts', 'import entity', "import { HealthController } from './health/health.controller';", "import { Notification } from './notifications/notification.entity';\nimport { HealthController } from './health/health.controller';", "notifications/notification.entity");
edit('src/app.module.ts', 'import module', "import { StatsModule } from './stats/stats.module';", "import { StatsModule } from './stats/stats.module';\nimport { NotificationsModule } from './notifications/notifications.module';", "notifications/notifications.module");
edit('src/app.module.ts', 'entities list', "TicketEvent],", "TicketEvent, Notification],", "TicketEvent, Notification]");
edit('src/app.module.ts', 'module imports', "    StatsModule,\n  ],", "    StatsModule,\n    NotificationsModule,\n  ],", "NotificationsModule,\n  ]");

// ---- tickets
edit('src/tickets/tickets.module.ts', 'import', "import { UsersModule } from '../users/users.module';", "import { UsersModule } from '../users/users.module';\nimport { NotificationsModule } from '../notifications/notifications.module';", "notifications.module");
edit('src/tickets/tickets.module.ts', 'imports list', "    UsersModule,\n  ],", "    UsersModule,\n    NotificationsModule,\n  ],", "NotificationsModule,\n  ]");
edit('src/tickets/tickets.service.ts', 'imports', "import { UsersService } from '../users/users.service';", "import { UsersService } from '../users/users.service';\nimport { NotificationsService } from '../notifications/notifications.service';\nimport { NotificationType } from '../notifications/notification.entity';", "NotificationsService");
edit('src/tickets/tickets.service.ts', 'constructor', "    private usersService: UsersService,\n  ) {}", "    private usersService: UsersService,\n    private notifications: NotificationsService,\n  ) {}", "private notifications: NotificationsService");
edit('src/tickets/tickets.service.ts', 'create()', "    return this.tickets.save(ticket);\n  }\n\n  // ---- Rule 2 (visibility)", `    const saved = await this.tickets.save(ticket);

    // tell every admin (except the creator) about the new ticket
    await this.notifications.notifyAdmins({
      type: NotificationType.TICKET_CREATED,
      message: \`New ticket #\${saved.id}: \${saved.subject} (by \${user.email})\`,
      ticketId: saved.id,
      actorId: user.id,
    });

    return saved;
  }

  // ---- Rule 2 (visibility)`, "NotificationType.TICKET_CREATED");

// ---- auth
edit('src/auth/auth.module.ts', 'import', "import { JwtStrategy } from './strategies/jwt.strategy';", "import { JwtStrategy } from './strategies/jwt.strategy';\nimport { NotificationsModule } from '../notifications/notifications.module';", "notifications.module");
edit('src/auth/auth.module.ts', 'imports list', "    PassportModule,\n", "    PassportModule,\n    NotificationsModule,\n", "    NotificationsModule,\n");
edit('src/auth/auth.service.ts', 'imports', "import { sanitizeUser } from '../common/utils/sanitize-user';", "import { sanitizeUser } from '../common/utils/sanitize-user';\nimport { NotificationsService } from '../notifications/notifications.service';\nimport { NotificationType } from '../notifications/notification.entity';", "NotificationsService");
edit('src/auth/auth.service.ts', 'constructor', "    private jwt: JwtService,\n  ) {}", "    private jwt: JwtService,\n    private notifications: NotificationsService,\n  ) {}", "private notifications: NotificationsService");
edit('src/auth/auth.service.ts', 'login()', "    return { access_token, user: sanitizeUser(user) };\n  }\n\n  async me", `    // tell every admin (except the person logging in) that someone signed in
    await this.notifications.notifyAdmins({
      type: NotificationType.USER_LOGIN,
      message: \`\${user.full_name} (\${user.role}) logged in\`,
      actorId: user.id,
    });

    return { access_token, user: sanitizeUser(user) };
  }

  async me`, "NotificationType.USER_LOGIN");

// ---- existing unit tests need the new dependency (TicketsService now needs NotificationsService)
for (const f of ['src/tickets/tickets.service.spec.ts', 'src/tickets/due-date.spec.ts']) {
  edit(f, 'test imports', "import { UsersService } from '../users/users.service';", "import { UsersService } from '../users/users.service';\nimport { NotificationsService } from '../notifications/notifications.service';", "NotificationsService");
}
edit('src/tickets/due-date.spec.ts', 'test provider', "        { provide: UsersService, useValue: { findById: jest.fn() } },", "        { provide: UsersService, useValue: { findById: jest.fn() } },\n        { provide: NotificationsService, useValue: { notifyAdmins: jest.fn() } },", "provide: NotificationsService");
edit('src/tickets/tickets.service.spec.ts', 'test var', "  let usersService: { findById: jest.Mock };", "  let usersService: { findById: jest.Mock };\n  let notifications: { notifyAdmins: jest.Mock };", "let notifications");
edit('src/tickets/tickets.service.spec.ts', 'test setup', "    usersService = { findById: jest.fn() };", "    usersService = { findById: jest.fn() };\n    notifications = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };", "notifications = {");
edit('src/tickets/tickets.service.spec.ts', 'test provider', "        { provide: UsersService, useValue: usersService },", "        { provide: UsersService, useValue: usersService },\n        { provide: NotificationsService, useValue: notifications },", "provide: NotificationsService");


// ---- one extra unit test: creating a ticket notifies the admins
{
  const f = 'src/tickets/tickets.service.spec.ts';
  if (exists(f) && !read(f).includes('notifies admins when a ticket is created')) {
    const s = read(f);
    const i = s.lastIndexOf('});');
    if (i === -1 || !s.includes('notifications.notifyAdmins') && !s.includes('let notifications')) warnings.push(f + ': could not add the extra test (optional).');
    else save(f, s.slice(0, i) + `
  // ---- notifications: creating a ticket tells the admins
  it('notifies admins when a ticket is created (excluding the creator)', async () => {
    const saved = await service.create(
      { subject: 'Printer broken', body: 'It smokes', priority: TicketPriority.HIGH } as any,
      customer,
    );

    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    const arg = notifications.notifyAdmins.mock.calls[0][0];
    expect(arg.type).toBe('ticket_created');
    expect(arg.ticketId).toBe(saved.id);
    expect(arg.actorId).toBe(customer.id);
    expect(arg.message).toContain('Printer broken');
  });
` + s.slice(i));
  }
}

finish(`Next:
  1. npm run migration:run      (creates the notifications table; in production run it against Neon too)
  2. npm test                   (unit tests)
  3. restart the backend:  npm run start:dev`);
