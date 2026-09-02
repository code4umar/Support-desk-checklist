# Support Desk — Backend

Coding Pixel Full-Stack Internship — Week 10 Capstone (backend).
Stack: NestJS · PostgreSQL · TypeORM · TypeScript.

## Status: Day 1 complete (schema + migration + ERD)

- [x] `docs/ERD.md` — Mermaid diagram, all 6 tables
- [x] 6 entities: `User`, `Ticket`, `Comment`, `Tag`, `TicketTag`, `TicketEvent`
- [x] One migration (`src/migrations/1735000000000-InitSchema.ts`) builds the full schema
- [x] `synchronize: false` everywhere; `status`/`priority` are real Postgres enums
- [x] Project builds clean (`npm run build`)
- [ ] Day 2: auth (register/login/me), JWT + roles guard, seed
- [ ] Day 3: ticket CRUD, visibility rule, `GET /tickets` (filter/search/sort/page)
- [ ] Day 4: status machine, assign rule, comments, tags, ticket_events
- [ ] Day 5: unit tests, e2e test, CI, this README finished properly

## Setup

```bash
cp .env.example .env       # fill in your local Postgres credentials
npm install
npm run migration:run      # builds the schema on an empty database
npm run seed                # (added Day 2) seeds demo data
npm run start:dev
```

## Migration commands

```bash
npm run migration:run       # apply
npm run migration:revert    # undo the last migration
```

## Roles

| Role | Created by |
|---|---|
| customer | self-registration (`POST /auth/register`) — the only role that endpoint can create |
| agent | seed data or created by an admin (admin-creation endpoint TBD Day 2) |
| admin | seed data |

## Seeded accounts

_Added in Day 2 once the seed script exists — will list each seeded email + password here._

## Endpoints

_Full endpoint table with request/response shapes added as each module is built (Days 2–4)._

## Environment variables

See `.env.example` for the full list (DB connection, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`).
