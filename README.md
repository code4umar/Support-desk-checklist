# Support Desk — Backend

Coding Pixel Full-Stack Internship — Week 10 Capstone (backend).
Stack: NestJS · PostgreSQL · TypeORM · TypeScript.

## Status: Days 1–5 complete

- [x] Day 1 — schema, migration (verified: run/revert/run on a real Postgres), ERD
- [x] Day 2 — auth (register/login/me), JWT + roles guard, seed script
- [x] Day 3 — ticket CRUD, visibility rule, `GET /tickets` (filter/search/sort/page)
- [x] Day 4 — status machine, assign rule, comments, tags, ticket_events audit trail
- [x] Day 5 — 28 unit tests (mocked repos, no DB) + 25 e2e tests (real HTTP, real Postgres) — **all 53 passing**, CI workflow

## Setup

```bash
npm install
cp .env.example .env       # fill in your local Postgres credentials
npm run migration:run      # builds the schema on an empty database
npm run seed                # seeds demo data — safe to run twice
npm run start:dev
```

Server runs on `http://localhost:3000` by default.

## Migration commands

```bash
npm run migration:run       # apply
npm run migration:revert    # undo the last migration
```

## Testing

```bash
npm test           # unit tests — mocked repositories, no database needed
npm run test:e2e   # end-to-end — needs a real Postgres running with migrations applied
```

## Roles

| Role | Created by |
|---|---|
| customer | self-registration via `POST /auth/register` — the only role that endpoint can create; a `role` field in the request body is rejected (400) |
| agent | seed data only (no "create agent" endpoint exists — out of scope for Week 10) |
| admin | seed data only |

## Seeded accounts

Every seeded account uses the same password: **`Password123!`**

| Role | Email |
|---|---|
| Admin | `admin@supportdesk.test` |
| Agent | `agent1@supportdesk.test` |
| Agent | `agent2@supportdesk.test` |
| Customer | `customer1@supportdesk.test` |
| Customer | `customer2@supportdesk.test` |
| Customer | `customer3@supportdesk.test` |
| Customer | `customer4@supportdesk.test` |
| Customer | `customer5@supportdesk.test` |

Seed produces ≥25 tickets across all statuses/priorities, ≥3 overdue, ≥15 comments (≥5 internal), 6 tags, ≥20 ticket-tag links, and an event row for every ticket that has ever left `open`.

## Endpoints

All endpoints except `/auth/register` and `/auth/login` require `Authorization: Bearer <token>`.

| Method | Path | Who | Success | Notable failures |
|---|---|---|---|---|
| POST | `/auth/register` | anyone | 201 | 400 (validation / role in body), 409 (email taken) |
| POST | `/auth/login` | anyone | 200 | 401 |
| GET | `/auth/me` | signed in | 200 | 401 |
| POST | `/tickets` | signed in | 201 | 400 |
| GET | `/tickets` | signed in | 200 | 400 (bad query) |
| GET | `/tickets/:id` | signed in | 200 | 404 |
| PATCH | `/tickets/:id` | requester or agent/admin | 200 | 403, 404 |
| POST | `/tickets/:id/assign` | agent, admin | 200 | 403, 404, 422 |
| POST | `/tickets/:id/status` | agent, admin | 200 | 400, 403, 404, 409 |
| DELETE | `/tickets/:id` | admin | 204 | 403, 404 |
| POST | `/tickets/:id/comments` | signed in | 201 | 403, 404 |
| GET | `/tickets/:id/comments` | signed in | 200 | 404 |
| GET | `/tickets/:id/events` | signed in | 200 | 404 |
| GET | `/tags` | signed in | 200 | 401 |
| POST | `/tags` | admin | 201 | 403, 409 |
| POST | `/tickets/:id/tags` | agent, admin | 200 | 403, 404 |
| DELETE | `/tickets/:id/tags/:tagId` | agent, admin | 204 | 403, 404 |

### `GET /tickets` query parameters

`status`, `priority`, `assigneeId`, `tag`, `q` (search subject+body), `overdue=true`, `sortBy=createdAt|dueAt|priority`, `order=asc|desc`, `page` (default 1), `pageSize` (default 20, max 100). Filters combine (AND). Response:

```json
{ "data": [ /* tickets */ ], "page": 1, "pageSize": 20, "total": 28 }
```

`total` is counted **before** paging is applied.

## Business rules implemented

1. Registration always creates a `customer`; no password/hash ever leaves the API.
2. A customer sees only their own tickets; another customer's ticket → 404, never 403.
3. Only agent/admin may assign, change status, or tag (enforced via `@Roles()` guard, not manual checks).
4. Status machine: `open → in_progress → resolved → closed`, plus `resolved → in_progress` and `closed → in_progress` to reopen. Illegal moves → 409. Reopening `closed` without a `note` → 400.
5. Assigning a non-agent/admin → 422.
6. Only agent/admin may post `isInternal: true` comments; customers never receive them.
7. Every status change and assignment writes a `ticket_events` row — written by the server only.
8. `due_at` is computed server-side from priority at creation (urgent: 4h, high: 24h, normal: 72h, low: 168h); a `dueAt` in the request body is rejected 400 by the global whitelist.

## Environment variables

See `.env.example`:

| Variable | Purpose |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | Postgres connection |
| `PORT` | API port (default 3000) |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing |
| `CORS_ORIGIN` | Allowed frontend origin (default `http://localhost:3000`) |

## Project structure

```
docs/ERD.md              Mermaid diagram, all 6 tables
src/auth/                register, login, me, JWT strategy, roles guard
src/users/                user entity + lookup service
src/tickets/              tickets, assign, status machine, list query, events
src/comments/             comments, internal-comment rule
src/tags/                 tags, ticket-tag attach/detach
src/common/               shared guards, decorators, exception filter, visibility helper
src/migrations/           the one committed migration
src/seed/                 seed script (safe to re-run)
test/app.e2e-spec.ts      end-to-end spec, real HTTP + real DB
.github/workflows/ci.yml  Node 20, spins up Postgres, runs migrations + seed + both test suites
```

## Known implementation notes (for the check-in demo)

- `ticket_tags` is an explicit entity (not an implicit TypeORM `@ManyToMany` join table) so the composite primary key and cascade behavior are explicit and reviewable.
- `ticket_events` has no dedicated "assignee changed" columns (the spec's fixed schema only has `from_status`/`to_status`/`note`), so assignment events are recorded with both status columns `null` and a human-readable `note` describing the change.
- `password_hash` has `select: false` on the `User` entity — it is never returned unless a query explicitly re-adds it, which only `AuthService.login()` does (to compare the hash).
