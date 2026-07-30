# Production sync checklist — schema, env, monitoring, smoke

**Date:** 2026-07-28  
**Audience:** Founder / engineer with Vercel + Supabase prod credentials  
**Nature:** HUMAN-RUN. Cursor cannot apply prod migrations or set Vercel secrets.

**Companions:**
- `docs/ops/supabase-migrations.md` — exact CLI + verification SQL
- `docs/ops/vercel-production-env-checklist.md` — env vars by environment
- `docs/ops/monitoring-launch-checklist.md` — Sentry / PostHog
- `docs/ops/production-smoke-test.md` — post-sync smoke
- `docs/ops/launch-runbook-2026-07.md` — launch-day sequence
- `docs/maanta-production-rollout-plan.md` — historical drift context

**Evidence legend:** **Confirmed** in repo · **Needs manual verification** on prod

---

## 0. Hard rule

**Database first, then frontend.** Shipping Next.js code that depends on RPCs /
tables that are not yet on prod (`fee_reversals`, Guardian-aware
`verify_redemption`, `admin_ops_log`, etc.) causes production 500s.

Migrations are **version-controlled** in `maanta-app/supabase/migrations/`.
Never edit production schema in the Supabase SQL Editor without a matching
migration file.

---

## 1. Schema sync

| # | Step | Command / check | Status |
|---|---|---|---|
| 1.1 | Confirm Vercel Production `NEXT_PUBLIC_SUPABASE_URL` contains `axrrslqssmbngbataejg` | Vercel dashboard | ⬜ Needs manual verification |
| 1.2 | Link CLI | `make db-link` | ⬜ |
| 1.3 | List local vs remote | `make db-list` | ⬜ |
| 1.4 | Dry-run push | `make db-push-dry` | ⬜ |
| 1.5 | Backup / PITR comfort | Supabase dashboard | ⬜ |
| 1.6 | Apply migrations | `make db-push` | ⬜ |
| 1.7 | Verification SQL §5 | `docs/ops/supabase-migrations.md` | ⬜ |
| 1.8 | Confirm latest migrations present | See local file list via `make db-migration-checklist` | ⬜ |

**Confirmed in repo (2026-07-28 hardening + main merge):** migration files live in
`maanta-app/supabase/migrations/`. Main's ops status note (2026-07-28) reports
prod was **fully aligned** with the then-current 67 local files — **but new
migrations have landed on `main` since** (demo mode, trial cron, etc.). Always
re-check with `make db-list` before assuming sync. Do not trust stale counts.

**Dashboard-made drift:** If `supabase migration list` shows a REMOTE version
with no LOCAL file, capture it into the repo (back-fill) before further pushes —
see rollout plan Phase A. Do not leave prod-only schema as undocumented.

---

## 2. Environment sync

| # | Step | Detail | Status |
|---|---|---|---|
| 2.1 | Set Production env from `vercel-production-env-checklist.md` | All critical rails for `clerk` strategy | ⬜ |
| 2.2 | Set both auth strategy vars to `clerk` | `MAANTA_AUTH_STRATEGY` + `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` | ⬜ |
| 2.3 | Clerk publishable + secret from **same** Production instance | Not `cheerful-sailfish-3` dev if launching | ⬜ |
| 2.4 | Redeploy after any `NEXT_PUBLIC_*` change | Build-time inlining | ⬜ |
| 2.5 | `GET /api/healthz?ready=1` → `"status":"ready"` | Public | ⬜ |

---

## 3. Monitoring sync

| # | Step | Detail | Status |
|---|---|---|---|
| 3.1 | Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | See monitoring checklist | ⬜ |
| 3.2 | Set PostHog tokens (4 vars) | EU project 211805 | ⬜ |
| 3.3 | Redeploy | Required for public vars | ⬜ |
| 3.4 | Trigger `/sentry-example-page` sample error | Confirm issue in Sentry | ⬜ |
| 3.5 | Trigger a PostHog event (pageview / claim) | Confirm in PostHog Live | ⬜ |

---

## 4. Seed (optional — demo / rehearsal only)

| # | Step | Status |
|---|---|---|
| 4.1 | Decide whether prod should show 100 seeded BBS deals | ⬜ |
| 4.2 | If yes: apply `node0_100_deals_seed.sql` via `psql` or SQL Editor (SQL only) | ⬜ |
| 4.3 | Verify counts (`c1000000-%` merchants, `d1000000-%` deals) | ⬜ |

Do **not** run assertion SQL suites (`supabase/tests/*.sql`) against production.

---

## 5. Smoke alignment

After schema + env + redeploy:

1. Run `docs/ops/production-smoke-test.md` (minimum: landing, login, feed, claim, verify).
2. Confirm `maanta_node` cookie = `BBS Mall` (or expected node).
3. Confirm empty feed is not caused by wrong node or missing seed/migrations.

---

## 6. Done when

- [ ] `make db-list` shows no pending LOCAL-only migrations you intend to ship
- [ ] `/api/healthz?ready=1` is ready with `strategy: clerk`
- [ ] Sentry receives a test event
- [ ] PostHog receives a pageview (or is explicitly deferred with a date)
- [ ] Smoke checklist signed for shopper + merchant golden path

**Production remains unsafe until the human steps above are done.** Repo hardening alone does not sync prod.
