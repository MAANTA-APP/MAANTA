# AGENTS.md

See `CLAUDE.md` for the full repository guide (product overview, source-of-truth
hierarchy, layout, frozen business rules). Standard app commands live in
`maanta-app/package.json` (`dev`, `build`, `lint`, `typecheck`, `test`), and DB
ops targets live in the root `Makefile`.

## Cursor Cloud specific instructions

The product is a single Next.js 14 (App Router) + Supabase app in `maanta-app/`.
Auth is **Clerk** (a Supabase third-party JWT provider). Money/state logic lives
in Postgres SECURITY DEFINER RPCs (`claim_deal`, `verify_redemption`, …), not in
TS. All commands below run from `maanta-app/` unless noted.

### Startup layer vs. update script
- The update script only runs `npm ci` in `maanta-app/` (dependency refresh).
- Everything below (Docker, Supabase, dev server) is **not** in the update
  script — start it per session as needed.

### Running the app locally end-to-end
1. **Docker** must be running (Supabase local needs it). If `docker ps` fails,
   start the daemon: `sudo dockerd > /tmp/dockerd.log 2>&1 &` then
   `sudo chmod 666 /var/run/docker.sock`. Docker + the Supabase CLI are already
   installed on the VM image.
2. **Start Supabase** (applies all `supabase/migrations/`):
   `supabase start`. Local API is `http://127.0.0.1:54321`, DB is
   `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. The anon /
   service-role keys it prints are fixed local demo keys.
3. **CRITICAL non-obvious gotcha — grant `service_role`.** On a from-scratch
   `supabase start`, `service_role` does **not** inherit default privileges on
   most `public` tables (only tables a migration explicitly `GRANT`s to it work;
   the app authors hand-grant `authenticated` SELECT but not `service_role`).
   Hosted Supabase gives `service_role` these via project default privileges, so
   this only bites locally. The app reads/writes almost everything through
   `createServiceClient()` (service_role), so **without this grant every
   DB-backed page throws `permission denied for table deals`** (etc.). Fix it on
   the local DB (not via a migration — do not commit this):
   ```sh
   docker exec -i supabase_db_maanta psql \
     postgresql://postgres:postgres@127.0.0.1:5432/postgres <<'SQL'
   GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
   GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
   SQL
   ```
4. **Seed** realistic data (idempotent, safe to re-run):
   `docker exec -i supabase_db_maanta psql postgresql://postgres:postgres@127.0.0.1:5432/postgres < supabase/seed/node0_rehearsal_seed.sql`.
   This creates BBS Mall merchants (Nuur, Bilan), live deals, and a **pending OTP
   ticket `431977`** on Nuur's abaya deal for exercising the verify money-path.
5. **`.env.local`** must point at the local stack (Supabase local URL + demo
   anon/service keys). For Clerk, a well-formed **dummy** publishable key lets
   pages render — the CI one works:
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_cGxhY2Vob2xkZXIuY2xlcmsuYWNjb3VudHMuZGV2JA==`.
6. **Dev server:** `npm run dev` (port 3000). It is a Turbopack dev server;
   editing `.env.local` triggers an env reload.

### What works without real Clerk keys, and what doesn't
- **Works:** shopper feed (`/feed`), deal detail, search, and other public/
  service-role-backed pages — these render seeded deals straight from the DB.
- **Blocked:** any authenticated UI flow (shopper claim, merchant redeem/verify,
  onboarding, admin). These need a **real Clerk test instance** whose domain
  matches `supabase/config.toml`'s `auth.third_party.clerk` (`cheerful-sailfish-3`)
  so local Supabase trusts its JWTs. Keyless/dummy Clerk cannot satisfy RLS.
  Provide `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` as secrets to
  unblock these flows.
- You can still exercise the core money-path directly against the running stack:
  POST to `http://127.0.0.1:54321/rest/v1/rpc/verify_redemption` with the
  service-role key (the RPC authorizes `service_role`) to verify OTP `431977` —
  it charges the KES 30 success fee and debits the merchant wallet.

### Tests / lint / build
- `npm run lint`, `npm run typecheck`, `npm test` (vitest, 191 tests) need no
  services. `npm run build` needs the env checks satisfied — the CI placeholder
  env vars in `.github/workflows/ci.yml` are sufficient, or use `.env.local`.
- SQL assertion suites: `make db-verify` (boots a throwaway Supabase, runs
  `supabase/tests/*.sql`). Playwright `test:e2e` self-skips without a live
  deployed env — do not point it at prod (it charges real fees).
- Node 22 (VM default) builds and runs fine even though CI pins Node 20.
