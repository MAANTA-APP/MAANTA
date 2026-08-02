# AGENTS.md

Repo-wide guidance for coding agents. See `CLAUDE.md` for the product/ops
playbook and `maanta-app/README.md` for app basics.

## Cursor Cloud specific instructions

The only runnable product is the Next.js app in `maanta-app/` (shopper +
merchant + agent + admin surfaces in one server). There are no separate
worker processes. Standard commands are already documented — do not duplicate
them: dev/build/test/lint/typecheck live in `maanta-app/package.json`; DB
targets live in the root `Makefile`; CI is `.github/workflows/ci.yml`.

Node: CI pins Node 20; this VM ships Node 22, which builds/tests/runs fine.
Package manager is npm (`package-lock.json`). The startup update script runs
`npm --prefix maanta-app ci`, so deps are already installed each session.

### Running the app locally

1. The app needs `maanta-app/.env.local` (gitignored). Copy `.env.example` and
   fill Supabase + Clerk keys. For a self-contained local stack, point the
   Supabase vars at the local `supabase start` stack (see below) and use the
   CI placeholder Clerk keys from `.github/workflows/ci.yml`.
2. `cd maanta-app && npm run dev` serves on port 3000.

### Local database (Docker + Supabase CLI)

Docker and the Supabase CLI are preinstalled in the VM image, but the Docker
daemon is not auto-started. Start it once per session before DB work:
`sudo service docker start` (the `ubuntu` user is already in the `docker`
group). Then `cd maanta-app && supabase start` boots Postgres 17 on
`54322` and applies every migration. Run the SQL money-path suites exactly as
CI does — use the root `Makefile` `db-verify` target (or the `db-tests` CI job
in `.github/workflows/ci.yml`), which loop `supabase/tests/*.sql` through
`psql` against the fixed local-stack DB URL printed by `supabase start`.

Docker note: this VM uses the `fuse-overlayfs` storage driver, and Docker 29
requires `features.containerd-snapshotter=false` in `/etc/docker/daemon.json`
for it to work (already configured in the image).

### Non-obvious gotchas

- Local `service_role` lacks base-table SELECT. Hosted Supabase grants
  `service_role` full table access by default; the local `supabase start`
  stack does not, so the app's public browse (service client, RLS bypassed —
  e.g. `getLiveDeals`) fails with `permission denied for table deals` and the
  shopper feed renders empty. Fix the local DB once after `supabase start`:
  `psql "$DB_URL" -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;"`
  (`$DB_URL` = the local-stack URL from `supabase start` / the `Makefile`).
  This mirrors hosted defaults; it is a local-stack fixup, not a schema change.
- **In Clerk mode only**, Clerk gates every route and blocks browser UI without
  real keys. `src/middleware.ts` runs on all paths but **branches**: it calls
  `clerkMiddleware()` only when `authStrategy()` resolves to `clerk`, which needs
  **both** `MAANTA_AUTH_STRATEGY` and `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` set to
  `clerk`; otherwise it runs Supabase session refresh. `DEFAULT_AUTH_STRATEGY` is
  `supabase`, so with no auth env set none of what follows applies — and CI sets
  both vars to `supabase` for exactly that reason. In Clerk mode, on a real browser
  navigation (`Sec-Fetch-Dest: document`) it issues a 307 handshake redirect to
  the Clerk FAPI; with placeholder keys that FAPI shows an "Invalid host" error
  page, so `/feed`, `/`, etc. cannot be viewed interactively. Header-light
  requests (`curl` without `Sec-Fetch-Dest`) render signed-out SSR at HTTP 200.
  Interactive browser/E2E testing needs valid Clerk keys for the repo's
  instance (`cheerful-sailfish-3`, per `supabase/config.toml`) — publishable
  AND secret. The publishable key alone is not enough: a real-publishable +
  placeholder-secret mix makes the handshake token fail verification.
- Seeding demo deals: with the local DB up, apply
  `supabase/seed/node0_100_deals_seed.sql` (100 live BBS Mall deals). The feed
  is node-scoped via the `maanta_node` cookie (default `BBS Mall`); a stale
  cookie for another node shows an empty feed.
- **Auth strategy:** `MAANTA_AUTH_STRATEGY=supabase` enables email OTP via
  Supabase Auth for rehearsal (no Clerk SMS). Production launch uses `clerk`.
  See `docs/ops/auth-strategies.md`.
- The core money path (claim → verify → KES 30 success fee) can be exercised
  directly against the running DB via the `claim_deal(user_id, deal_id)` and
  `verify_redemption(merchant_id, otp)` RPCs under a `service_role` JWT claim —
  see `supabase/tests/golden_path_test.sql` for the exact call pattern.
