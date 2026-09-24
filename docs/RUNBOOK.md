This runs the `down()` method of the most recently applied migration, against whichever `.env` DB config is active.

## Logs

**API (Railway):** Railway dashboard → project → service → "Deployments" tab → click a deployment → "View Logs" (or the "Logs" icon in the left sidebar for live/historical logs across all deployments). Logs cover the last several days depending on plan; filter by time range in the top-right of the logs view.

**Client (Vercel):** Vercel dashboard → project → Deployments tab → click a deployment → "Logs" tab (runtime logs for serverless functions; build logs are under the same deployment's "Build Logs").

**Database (Neon):** Neon dashboard → project → Monitoring tab, for query stats and connection activity.

## Rate limit

5 failed login attempts in 60 seconds returns `429 Too Many Requests` on `POST /auth/login`. Configured via `@nestjs/throttler`'s `@Throttle({ default: { limit: 5, ttl: 60000 } })` decorator on the login route in `src/auth/auth.controller.ts`. All other routes fall back to a global default of 20 requests per 60 seconds, set in `ThrottlerModule.forRoot()` in `src/app.module.ts`.