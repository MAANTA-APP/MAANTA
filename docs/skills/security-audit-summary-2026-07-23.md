# MAANTA Security Audit — Session Summary

**Date:** 2026-07-23  
**Scope:** Follow-up on the security re-audit of `main` after PRs #48–#58  
**Outcome:** 3 PRs merged (#59, #60, #61), 4 new migrations, 3 new SQL regression suites, app hardening across 8 routes

---

## Critical findings closed (C-1 / C-2 / C-3) — PR #59

**Risk:** Supabase default grants gave `authenticated` `INSERT`/`UPDATE`/`DELETE` on `merchants`, `deals`, and `redemptions`. RLS policies were unrestricted `FOR ALL`, so a stolen merchant JWT could PATCH privileged fields directly via PostgREST.

| ID | Abuse path | Fix |
|---|---|---|
| **C-1** | Set `tier`, `account_balance`, `status`, `is_shadow_banned` on own merchant row | Revoke writes on `merchants` |
| **C-2** | Set `redemptions.status = 'success'` → bypass `verify_redemption` + KES 30 fee | Revoke writes on `redemptions` |
| **C-3** | Set `boost_active`, reset `claims_count`, remove caps on deals | Revoke writes on `deals` |

**Why this is safe:** All legitimate mutations already go through `service_role` API routes or SECURITY DEFINER RPCs (`claim_deal`, `verify_redemption`, `onboard_merchant`, boost RPCs). `SELECT` is retained for RLS-governed reads.

- **Migration:** `maanta-app/supabase/migrations/20260723120000_revoke_authenticated_writes_core_tables.sql`
- **Tests:** `maanta-app/supabase/tests/revoke_authenticated_writes_core_tables_test.sql` (scenarios A–E)
- **PR:** https://github.com/MAANTA-APP/MAANTA/pull/59

---

## High / medium findings closed — PR #60

| ID | Issue | Fix |
|---|---|---|
| **H-1** | Anon browse views broken (`security_invoker = true` + base-table SELECT revoked) | Set `security_invoker = false` on `merchants_public_browse` / `deals_public_browse` |
| **H-2** | Stripe checkout defaulted to `http://localhost:3000` when `NEXT_PUBLIC_APP_URL` unset | `getAppOrigin()` fails closed in production; route returns 503 |
| **H-3** | IntaSend webhook unguarded `request.json()` | Try/catch + typed payload access |
| **M-1** | Waitlist endpoint had no rate limit | 5 signups/hour per client IP |
| **M-2** | W3W validate had no rate limit | 30 requests/min per signed-in user |

- **Migration:** `maanta-app/supabase/migrations/20260723130000_fix_browse_views_security_invoker.sql`
- **Tests:** `maanta-app/supabase/tests/browse_views_test.sql`, `maanta-app/src/lib/__tests__/app-url.test.ts`
- **PR:** https://github.com/MAANTA-APP/MAANTA/pull/60

---

## Admin audit gap closed (M-3) — PR #61

**Risk:** Admin panel routes (`/api/admin/*`) mutated merchants, deals, fraud state, and redemptions with no durable audit trail.

**Fix:**

- New `admin_ops_log` table
- `logAdminOp()` helper (`maanta-app/src/lib/admin-audit.ts`) wired into all 9 admin mutation routes
- Each row records: admin user, action, target type/id, JSON details, timestamp

**Routes covered:** merchant ops/approve, plans, deal deactivate, fraud resolution, Guardian release/appeal, fee reversal, support override.

- **Migration:** `maanta-app/supabase/migrations/20260723140000_admin_ops_log.sql`
- **Tests:** `maanta-app/supabase/tests/admin_ops_log_test.sql`
- **PR:** https://github.com/MAANTA-APP/MAANTA/pull/61

---

## CI / validation

- All 3 PRs passed full CI: `db-tests` (12 SQL suites) + unit tests + typecheck + Vercel preview
- Docs updated: `docs/skills/security-hardening.md` (findings, ops checklist, test inventory)

---

## Prod apply checklist (`vcrfqsevompqjazbwzyh`)

Apply before deploy (if not already on remote):

| # | Migration | Source |
|---|---|---|
| 1 | `20260722180000_lock_down_internal_money_rpcs.sql` | PR #48 |
| 2 | `20260722190000_capture_lead_atomic.sql` | PR #48 |
| 3 | `20260722200000_fix_capture_lead_column_ambiguity.sql` | PR #48 hotfix |
| 4 | `20260723120000_revoke_authenticated_writes_core_tables.sql` | PR #59 |
| 5 | `20260723130000_fix_browse_views_security_invoker.sql` | PR #60 |
| 6 | `20260723140000_admin_ops_log.sql` | PR #61 |

After apply, run all `maanta-app/supabase/tests/*.sql` against prod to confirm parity.

---

## What was already solid (not changed this session)

- Normal app flows were safe before these fixes — risk was direct PostgREST abuse with a stolen JWT, not the happy-path UI
- RPC money paths (`claim_deal`, `verify_redemption`, fee debit) were already hardened in PR #48
- Guardian v1, fee reversals, and frozen business rules (KES 30 fee, verify-anyway) untouched

---

## Still open (not in scope this session)

| Item | Notes |
|---|---|
| **E10** | Production env-vars audit on Vercel + Supabase (`STRIPE_ENV` guard, etc.) |
| **Playwright E2E** | Browser golden path not yet gated in CI |
| **Pre-existing advisor items** | Broad `pg_graphql_*` exposure to `authenticated`, other legacy SECURITY DEFINER RPCs |

---

## Bottom line

The audit's critical PostgREST write-abuse paths are closed, anon browse is restored, three input/rate-limit gaps are patched, and every admin panel mutation now leaves a queryable audit row. Six migrations are queued for prod apply.

**Related docs:** `docs/skills/security-hardening.md`
