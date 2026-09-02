import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { User } from '../users/user.entity';
import { Ticket } from '../tickets/ticket.entity';
import { Comment } from '../comments/comment.entity';
import { Tag } from '../tags/tag.entity';
import { TicketTag } from '../tags/ticket-tag.entity';
import { TicketEvent } from '../tickets/ticket-event.entity';
import {
  UserRole,
  TicketStatus,
  TicketPriority,
  PRIORITY_DUE_HOURS,
} from '../common/enums';

const BCRYPT_ROUNDS = 10;

// All seeded accounts share this password so a reviewer can sign in as
// any of them. Documented in README.md too.
const SEED_PASSWORD = 'Password123!';

async function upsertUser(
  repo: any,
  email: string,
  full_name: string,
  role: UserRole,
  password_hash: string,
) {
  let user = await repo.findOne({ where: { email } });
  if (!user) {
    user = repo.create({ email, full_name, role, password_hash });
    user = await repo.save(user);
  }
  return user;
}

function dueAtFor(priority: TicketPriority, createdAt: Date): Date {
  const hours = PRIORITY_DUE_HOURS[priority];
  return new Date(createdAt.getTime() + hours * 60 * 60 * 1000);
}

async function seed() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository(User);
  const ticketRepo = AppDataSource.getRepository(Ticket);
  const commentRepo = AppDataSource.getRepository(Comment);
  const tagRepo = AppDataSource.getRepository(Tag);
  const ticketTagRepo = AppDataSource.getRepository(TicketTag);
  const eventRepo = AppDataSource.getRepository(TicketEvent);

  const password_hash = await bcrypt.hash(SEED_PASSWORD, BCRYPT_ROUNDS);

  console.log('Seeding users...');
  const admin = await upsertUser(userRepo, 'admin@supportdesk.test', 'Ayesha Admin', UserRole.ADMIN, password_hash);
  const agent1 = await upsertUser(userRepo, 'agent1@supportdesk.test', 'Bilal Agent', UserRole.AGENT, password_hash);
  const agent2 = await upsertUser(userRepo, 'agent2@supportdesk.test', 'Sara Agent', UserRole.AGENT, password_hash);
  const customers: User[] = [];
  const customerNames = ['Ali Customer', 'Zainab Customer', 'Hamza Customer', 'Mariam Customer', 'Usman Customer'];
  for (let i = 0; i < customerNames.length; i++) {
    const c = await upsertUser(
      userRepo,
      `customer${i + 1}@supportdesk.test`,
      customerNames[i],
      UserRole.CUSTOMER,
      password_hash,
    );
    customers.push(c);
  }

  console.log('Seeding tags...');
  const tagNames = ['billing', 'bug', 'feature-request', 'urgent-fix', 'login', 'performance'];
  const tags: Tag[] = [];
  for (const name of tagNames) {
    let tag = await tagRepo.findOne({ where: { name } });
    if (!tag) tag = await tagRepo.save(tagRepo.create({ name }));
    tags.push(tag);
  }

  // Only seed tickets if the table is empty — keeps this safe to run twice.
  const existingTicketCount = await ticketRepo.count();
  if (existingTicketCount === 0) {
    console.log('Seeding tickets, comments, tags, and events...');

    const statuses = [
      TicketStatus.OPEN,
      TicketStatus.IN_PROGRESS,
      TicketStatus.RESOLVED,
      TicketStatus.CLOSED,
    ];
    const priorities = [
      TicketPriority.LOW,
      TicketPriority.NORMAL,
      TicketPriority.HIGH,
      TicketPriority.URGENT,
    ];
    const subjects = [
      'Cannot log in to my account',
      'Invoice shows wrong amount',
      'App crashes on checkout',
      'Feature request: dark mode',
      'Password reset email not arriving',
      'Slow page load on dashboard',
      'Duplicate charge on my card',
      'Export to CSV is broken',
      'Need to change billing address',
      'Mobile app freezes on startup',
    ];

    const agents = [agent1, agent2];
    let overdueCount = 0;
    let internalCommentCount = 0;
    let ticketTagLinkCount = 0;
    const TARGET_TICKETS = 28; // >= 25 required
    const TARGET_OVERDUE = 4; // >= 3 required
    const TARGET_INTERNAL_COMMENTS = 6; // >= 5 required
    const TARGET_TAG_LINKS = 24; // >= 20 required

    for (let i = 0; i < TARGET_TICKETS; i++) {
      const status = statuses[i % statuses.length];
      const priority = priorities[i % priorities.length];
      const requester = customers[i % customers.length];
      const shouldBeAssigned = status !== TicketStatus.OPEN;
      const assignee = shouldBeAssigned ? agents[i % agents.length] : null;

      // Backdate creation so "overdue" (due_at in the past, not resolved/closed) is achievable.
      const isForcedOverdue =
        overdueCount < TARGET_OVERDUE &&
        status !== TicketStatus.RESOLVED &&
        status !== TicketStatus.CLOSED;
      const createdAt = isForcedOverdue
        ? new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) // 20 days ago
        : new Date(Date.now() - (i + 1) * 60 * 60 * 1000); // staggered, recent

      const due_at = dueAtFor(priority, createdAt);
      if (isForcedOverdue) overdueCount++;

      const ticket = await ticketRepo.save(
        ticketRepo.create({
          subject: subjects[i % subjects.length] + ` #${i + 1}`,
          body: `Details for ticket ${i + 1}: a customer-reported issue seeded for demo purposes.`,
          status,
          priority,
          requester_id: requester.id,
          assignee_id: assignee ? assignee.id : null,
          due_at,
          created_at: createdAt,
        }),
      );

      // Comments: at least 15 total, at least 5 internal.
      await commentRepo.save(
        commentRepo.create({
          ticket_id: ticket.id,
          author_id: requester.id,
          body: 'This is what I am seeing on my end, please help.',
          is_internal: false,
        }),
      );
      if (assignee) {
        const makeInternal = internalCommentCount < TARGET_INTERNAL_COMMENTS && i % 2 === 0;
        await commentRepo.save(
          commentRepo.create({
            ticket_id: ticket.id,
            author_id: assignee.id,
            body: makeInternal
              ? 'Internal note: checking the logs before replying to the customer.'
              : 'Thanks for reporting — looking into this now.',
            is_internal: makeInternal,
          }),
        );
        if (makeInternal) internalCommentCount++;
      }

      // Tags: at least 20 ticket-tag links across 6 tags.
      const tagsForThisTicket = Math.min(2, tags.length);
      for (let t = 0; t < tagsForThisTicket; t++) {
        if (ticketTagLinkCount >= TARGET_TAG_LINKS && i > 15) continue;
        const tag = tags[(i + t) % tags.length];
        const exists = await ticketTagRepo.findOne({
          where: { ticket_id: ticket.id, tag_id: tag.id },
        });
        if (!exists) {
          await ticketTagRepo.save(
            ticketTagRepo.create({ ticket_id: ticket.id, tag_id: tag.id }),
          );
          ticketTagLinkCount++;
        }
      }

      // Events: an event row for every ticket that has ever left OPEN.
      if (status !== TicketStatus.OPEN) {
        // Reconstruct a plausible history up to the current status.
        const path: TicketStatus[] = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS];
        if (status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED) {
          path.push(TicketStatus.RESOLVED);
        }
        if (status === TicketStatus.CLOSED) {
          path.push(TicketStatus.CLOSED);
        }
        for (let s = 1; s < path.length; s++) {
          await eventRepo.save(
            eventRepo.create({
              ticket_id: ticket.id,
              actor_id: (assignee ?? admin).id,
              from_status: path[s - 1],
              to_status: path[s],
              note: s === path.length - 1 ? 'Seeded transition' : null,
            }),
          );
        }
        // Assignment event too, since assignment also writes an event (rule 7).
        if (assignee) {
          await eventRepo.save(
            eventRepo.create({
              ticket_id: ticket.id,
              actor_id: admin.id,
              from_status: null,
              to_status: null,
              note: `Assigned to user #${assignee.id} (${assignee.full_name})`,
            }),
          );
        }
      }
    }

    console.log(`Seeded ${TARGET_TICKETS} tickets, ${overdueCount} overdue, ${internalCommentCount} internal comments, ${ticketTagLinkCount} tag links.`);
  } else {
    console.log(`Tickets already exist (${existingTicketCount}) — skipping ticket/comment/event seeding. Safe re-run.`);
  }

  console.log('\nSeed complete. Accounts (all share the same password):');
  console.log(`  Password for every seeded account: ${SEED_PASSWORD}`);
  console.log(`  Admin:   admin@supportdesk.test`);
  console.log(`  Agent 1: agent1@supportdesk.test`);
  console.log(`  Agent 2: agent2@supportdesk.test`);
  for (let i = 0; i < customers.length; i++) {
    console.log(`  Customer ${i + 1}: customer${i + 1}@supportdesk.test`);
  }

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
