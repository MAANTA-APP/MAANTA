# Architecture audit — now-fixes (2026-07-26)

**Mode:** Reviewer → Builder · **Branch:** `cursor/architecture-now-fixes-7edd`

## Verdict

Money path remains solid (RPC-isolated, tested). Browse/reporting correctness
under growth was the weak layer: PostgREST’s silent **1000-row cap** could
under-count verified badges and admin fee revenue; browse views projected
safe *columns* but not safe *rows*.

This session implemented **now** fixes only. Multi-mall, IntaSend credentials,
legal/DPA, CDN caching, and dispute automation stay deferred.

## Shipped now

| ID | Fix | Where |
|---|---|---|
| P0-1 | `verified_counts_by_merchant(uuid[])` RPC + `getVerifiedCounts` uses it | migration `20260726200000_*`, `src/lib/data.ts` |
| P0-2 | Browse views filter to public merchants / live deals | same migration; `browse_views_test.sql` scenario C |
| P0-3 | Admin fee revenue + daily redemption chart via SQL RPCs | `admin/reports/page.tsx` |
| P1-1 | Feed loads flash/boosted/standard in separate bucket queries | `getLiveDeals` |
| P1-2 | Indexes `(merchant_id, status)` and live deals by node/created | migration |
| P1-3 | Analytics `node` is pass-through (default `BBS Mall`) | `analytics.ts` + call sites |
| P1-4 | Service-role client reused per process | `supabase/service.ts` |
| P1-9 | Public `GET /api/healthz?ready=1` (503 if core env missing) | `health.ts` + route |

SQL regression: `supabase/tests/architecture_now_fixes_test.sql`.

## Explicitly later (do not implement here)

Multi-mall live flags · IntaSend account · lawyer/DPA · cursor pagination ·
denormalized verified counter trigger · full HTML CDN cache · SLA FX ·
automated dispute routing · search engine · Elite auto-billing.

## Deploy notes

1. Apply migration `20260726200000_architecture_now_fixes.sql` to prod before
   (or with) the app deploy — otherwise `getVerifiedCounts` / admin reports RPC
   calls will 500.
2. `GET /api/healthz?ready=1` is safe for uptime probes (booleans only).
