# Hardening — Week 12

This week's work was deployment and hardening for Support Desk (Deskly). No formal written feedback document was received for Weeks 10 or 11, so this document records what was implemented to meet the Week 12 hardening requirements directly.

| Item | Action | Commit |
|------|--------|--------|
| No `/health` endpoint | Added `GET /health`, checks DB connectivity via a `SELECT 1` query, requires no auth | 8a9a315, 6ee4855 |
| No rate limiting on auth | Added `@nestjs/throttler`; login endpoint limited to 5 attempts per 60 seconds via `@Throttle`; global default of 20/60s for all other routes | c243f75 |
| No security headers | Added `helmet` in `main.ts` — sets `X-Content-Type-Options: nosniff`, a frame policy, removes `X-Powered-By`, and adds a CSP | 1c46d0b |
| No request body size cap | Added `express.json({ limit: '1mb' })` and `express.urlencoded({ limit: '1mb' })` in `main.ts` | 1c46d0b |
| No SSL support for a managed production database | Added `ssl` config to `data-source.ts` and `app.module.ts` (required for Neon) | da25a5a |
| No indexes on frequently filtered/sorted ticket columns | Added migration `1790222368084-AddTicketIndexes` with indexes on `status`, `priority`, `assignee_id`, `due_at` — hand-written after TypeORM's auto-generated migration attempted unrelated, risky schema changes | 5a4fea1 |
| Root client route (`/`) showed the default Next.js starter page | Replaced with a redirect to `/tickets`, which already redirects unauthenticated users to `/login` via `RequireAuth` | (client repo) |

## Deliberately not fixed
- CI running on both repos on every push/PR, migrations + seed + e2e in CI, `.env.example`, `.gitignore` covering `.env`, and the global exception filter (no stack trace/SQL leakage) were already in place from Weeks 10-11 (confirmed working, commit `1e64fdd` and earlier) and needed no changes this week.
- No formal Week 10/11 review feedback was available to close out, since none was issued in writing.