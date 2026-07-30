# Observability and Production Verification

<!-- Paste format: bullet lines, not tables — the live Notion pages store rows
     as `- **Col:** value · **Col:** value`, and table pastes mangle. See
     docs/notion-refresh/README.md § "Paste format". Do not convert back. -->

**Status:** Canonical · **Last verified:** 2026-07-28  
**Repo:** `docs/skills/sentry-monitoring.md`, `docs/skills/launch-audit-2026-07-24.md`, `docs/skills/prod-auth-deals-recovery.md`, healthz routes

## Purpose

Separate **tests that passed** from **production that was verified**. Define how operators prove the live system.

## Current reality

- **Layer:** Unit/integration (vitest) · **What exists:** Broad API/lib coverage on `main` · **Gap:** Does not prove prod env
- **Layer:** SQL money/security suites · **What exists:** Run in CI `db-tests` against real local Supabase · **Gap:** Not a substitute for hosted apply
- **Layer:** Playwright golden path · **What exists:** Self-skipping without `E2E_BASE_URL` · **Gap:** Needs secrets to gate CI
- **Layer:** Healthz · **What exists:** `GET /api/healthz` (+ ready/probe admin detail) · **Gap:** Must be checked after deploys
- **Layer:** Sentry · **What exists:** Env reported wired on Vercel (2026-07-27) · **Gap:** Confirm issues stream for real errors
- **Layer:** PostHog · **What exists:** Env reported wired; client+server capture code · **Gap:** Confirm events (incl. `guardian_outcome`) arrive
- **Layer:** Auth logs · **What exists:** `[maanta-auth]` staged logs · **Gap:** Need log access discipline
- **Layer:** Manual device QA · **What exists:** Checklist-based · **Gap:** Still the launch gate

## Verification ladder (use in order)

1. **CI green on `main`** — necessary, not sufficient.
2. **Migrations applied** — `supabase migration list` / schema_migrations versions match repo.
3. **Healthz** — public liveness; admin probe for Supabase reasons (`missing_env`, `missing_lat_lng`, etc.).
4. **Inventory check** — SQL counts for deals/merchants; label seed UUIDs vs real.
5. **Auth path** — strategy env → login → `/app-bootstrap` → role home.
6. **Golden path on two devices** — claim on phone A, verify on phone B, confirm ledger fee/arrears.
7. **Observability spot-check** — force a benign error / event; see Sentry/PostHog.
8. **Money rail spot-check** — sandbox Stripe top-up; IntaSend only when credentials exist.

## What is working

- Clear operator runbooks in repo (`docs/ops/supabase-migrations.md`, auth skills).
- Healthz designed to avoid leaking secret values (booleans only).

## What is not yet ready

- Continuous prod verification automation (Playwright against prod still opt-in).
- Single status badge page in Notion that auto-updates (manual for now).

## Risks

- Treating Sentry “configured” as “on-call process exists.”
- Empty feed diagnosed as product failure when seed/migration missing.
- Rehearsal checklist out of date vs auth strategy.

## Dependencies

- Vercel + Supabase + Clerk dashboard access for humans.
- `DATABASE_URL` for seed scripts (not available to unattended agents by default).

## Next actions

1. After each production deploy, run steps 2–5 and paste results into Launch Readiness.
2. Schedule recurring 2-phone golden path before open launch.
3. Document who watches Sentry (founder default until ops hire).

## Related pages

- Launch Readiness
- Auth and Identity
- Current State of MAANTA
- Testing & QA (legacy — point here)
- Prod apply checklist (dated)
