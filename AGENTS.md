# AGENTS.md

Repo-wide guidance for automated agents. See `CLAUDE.md` for the product/business
context and the source-of-truth hierarchy. This file adds environment/run notes.

The product is a single Next.js 14 (App Router) + Supabase web app in `maanta-app/`.
Standard commands are already defined and should be treated as the source of truth:

- `maanta-app/package.json` scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`.
- `Makefile` (repo root): `make test`, `make test-e2e`, plus Supabase `db-*` targets.
- `.github/workflows/ci.yml`: the authoritative install/lint/typecheck/test/build recipe
  (Node 20, `npm ci` in `maanta-app/`) and the `db-tests` job (`supabase start` + `supabase/tests/*.sql`).

## Cursor Cloud specific instructions

Dependencies are refreshed automatically by the startup update script (`npm ci` in
`maanta-app`). The notes below are the non-obvious, durable caveats for running the
app and services in this environment. Run all app commands from `maanta-app/`.

### Services
- **Next.js dev app** — `npm run dev` (Turbopack, port 3000). Reads `maanta-app/.env.local`.
- **Local Supabase** (Postgres 17 + PostGIS) — `supabase start`. This is the only
  hard dependency for DB-backed pages. Everything else (Stripe, IntaSend, Resend,
  web-push, what3words, Sentry, PostHog) is optional and degrades gracefully.

### Docker + Supabase startup (not in the update script by design)
- Docker is installed but the daemon is not auto-started. Start it once per VM
  (e.g. `sudo dockerd` in a background tmux session). If you hit
  `permission denied ... /var/run/docker.sock`, run `sudo chmod 666 /var/run/docker.sock`.
- `supabase start` boots the stack and applies every migration in `supabase/migrations/`.

### CRITICAL: local `service_role` grant gap (non-obvious)
On a from-scratch `supabase start`, the local `service_role` role does **not** inherit
the table privileges that hosted Supabase grants by default. Because the app reads
via `createServiceClient()` (service_role), pages fail with
`permission denied for table deals` (Postgres `42501`) until you grant them. This is a
local-only environment gap (production is unaffected); do **not** "fix" it by editing
migrations. After every fresh `supabase start`, run:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;
```

(e.g. `docker exec -i supabase_db_maanta psql -U postgres -d postgres` and paste the above.)
Do **not** re-grant writes to `authenticated` — a security migration intentionally
revoked those.

### Seed data
Apply the idempotent rehearsal seed for realistic data (BBS Mall merchants + live deals):
`docker exec -i supabase_db_maanta psql -U postgres -d postgres < supabase/seed/node0_rehearsal_seed.sql`

### `.env.local` and the Clerk browser caveat (important)
`.env.local` (gitignored) points at the local Supabase stack. Get the keys with
`supabase status -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`).

Clerk has **no local emulator**. Its behavior depends on how keys are set:
- **SSR / `curl` / `next build` / `npm run lint` / `npm test`**: work with either
  placeholder Clerk keys (see `ci.yml`) or with the keys unset.
- **A real browser**: a Clerk *development* instance forces a "dev-browser handshake",
  so browser navigation gets **307-redirected** to `https://<domain>.clerk.accounts.dev/...handshake`.
  With placeholder keys that domain does not exist and the browser fails.
  Two ways to get a working browser session:
  1. **Keyless mode (quickest for public pages):** leave `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
     and `CLERK_SECRET_KEY` unset. Clerk auto-provisions a throwaway dev instance
     (writes `maanta-app/.clerk/`, gitignored). Anonymous/public pages (`/feed`, `/demo`,
     marketing pages) then load in a real browser. This does **not** give working
     login/merchant/admin flows.
  2. **Real Clerk dev keys (full auth):** set real `pk_test_…` / `sk_test_…` keys for the
     Clerk instance referenced in `supabase/config.toml` (`cheerful-sailfish-3`). Required
     to exercise login, claim-deal, merchant, and admin flows end-to-end.

### PWA service worker gotcha
The app registers `/sw.js` (PWA/web-push) and caches aggressively. After backend/config
changes, a normal browser tab may serve a stale cached shell (and stale errors). Use an
**Incognito window** or unregister the service worker + hard reload to see fresh state.

### Good no-login smoke test
`/feed` (shopper deal feed) and `/demo` render seeded live deals with no auth — the
fastest end-to-end check that Supabase + seed + app are wired correctly.
