# AGENTS.md

Repo-wide guidance for agents. See `CLAUDE.md` for the product/domain playbook and
the frozen business rules, and `maanta-app/package.json` for the canonical scripts.

## Cursor Cloud specific instructions

The app lives in `maanta-app/` (Next.js 14 App Router + Supabase Postgres 17, Clerk
auth). The update script already runs `npm ci` in `maanta-app/` on VM startup, so
dependencies are present. Standard commands are in `maanta-app/package.json`
(`dev`, `build`, `lint`, `typecheck`, `test`) and `CLAUDE.md` — don't duplicate them.

### Services

- **Next.js app** — `npm run dev` in `maanta-app/` (http://localhost:3000). This is
  the only long-running app process.
- **Local Supabase** (Postgres + PostgREST + auth), started with the Supabase CLI
  (`supabase start` from `maanta-app/`). Required for any DB-backed page — even the
  signed-out `/feed`, which reads via the service client.
- External SaaS (Clerk, Stripe, IntaSend, Resend, PostHog, Sentry, what3words) are
  optional and no-op / degrade gracefully when their env vars are unset, except
  Clerk (see gotchas). None are needed for the DB-level core loop.

### System deps (not in the update script)

Docker and the Supabase CLI are system dependencies (not part of the codebase), so
they are NOT installed by the update script — they are expected in the VM image.
If missing, install Docker (configure `/etc/docker/daemon.json` with
`"storage-driver": "fuse-overlayfs"` and `"features": {"containerd-snapshotter": false}`
for this Firecracker VM, and switch to `iptables-legacy`) and the Supabase CLI
(`.deb` from github.com/supabase/cli/releases).

### Startup runbook (run once per fresh VM, in order)

1. **Start the Docker daemon** (no systemd here): run `sudo dockerd` in a background
   tmux session, then `sudo chmod 666 /var/run/docker.sock` so `docker`/`supabase`
   work without sudo.
2. **Start Supabase**: `supabase start` in `maanta-app/`. It applies every migration
   in `supabase/migrations/`. The `WARN: no files matched pattern: supabase/seed.sql`
   is expected — the seed lives elsewhere (step 4).
3. **Grant `service_role` (CRITICAL, non-obvious)**: on a *local* stack `service_role`
   only has the per-table grants the migrations add explicitly, NOT the broad baseline
   that hosted Supabase provides. The app's service-client reads (`/feed`, merchant,
   admin) fail with `permission denied for table deals` until you run, against the DB
   (`docker exec supabase_db_maanta psql -U postgres -d postgres`):

   ```sql
   GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
   ```

   This mirrors the hosted platform baseline and is a local-env step only — do NOT add
   it as a migration. CI's `db-tests` job runs as the `postgres` superuser, so it never
   exercises `service_role` grants and won't catch this gap.
4. **Seed demo data**: apply `supabase/seed/node0_rehearsal_seed.sql` (e.g.
   `docker cp` it into `supabase_db_maanta` and `psql -f`). This creates the `/demo`
   accounts, three live BBS Mall deals, and the pending redemption code `431977`.
5. **Create `maanta-app/.env.local`** with the local Supabase URL/keys printed by
   `supabase start` (`SUPABASE_SERVICE_ROLE_KEY` = the SERVICE_ROLE_KEY JWT) plus a
   well-formed *placeholder* Clerk publishable key
   (`pk_test_cGxhY2Vob2xkZXIuY2xlcmsuYWNjb3VudHMuZGV2JA==`). Then `npm run dev`.

### Gotchas

- **Clerk gates the browser.** `<ClerkProvider>` wraps the whole app; with a placeholder
  publishable key the Clerk client JS fails and redirects the browser to a Clerk error
  page, so pages do not render in a real browser. Server-side rendering still works
  (verify with `curl http://localhost:3000/feed`). Any in-browser walkthrough or any
  signed-in flow (shopper `/my-deals`, all `merchant/*`, `admin/*`, `agent/*`, and the
  `/api` routes behind auth) needs a **real Clerk instance** — set real
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`. The signed-out public site,
  `/feed`, `/deals/[id]`, `/demo` work with just local Supabase + the placeholder key.
- **DB-level core loop needs no external creds.** The claim→verify→KES-30-fee loop can be
  driven directly against local Supabase via the `verify_redemption` /
  `claim_deal` RPCs (PostgREST `/rest/v1/rpc/...` with the service key, the same RPCs the
  API routes call), and via the `supabase/tests/*.sql` suites.
- `supabase/.branches/` and `supabase/.temp/` are CLI-generated local state — do not commit.
