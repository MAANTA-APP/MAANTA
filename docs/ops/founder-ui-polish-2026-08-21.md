# Founder screens polish — 2026-08-21

Final family in the polish series. Scope: `/founder` (executive dashboard),
`/founder/reports` (alias → `/admin/reports`, verified as a real redirect),
and `/admin/reports` as the founder-facing charts surface.

## Findings

| Guideline | Verdict |
|---|---|
| Money figures computed where the ledger is | **Fixed — drift D149.** "Fee revenue (7d)" summed `merchant_transactions.amount` rows in JS; `/admin/reports` states the rule ("SQL SUM — never pull fee rows into JS, PostgREST 1000-row cap under-reports") and `admin_success_fee_revenue` exists precisely for this. Latent today (rehearsal volumes), silently wrong at the first 1,000 fee rows — on the executive money figure. Now uses the RPC |
| Read failure ≠ zeroed metrics | **Fixed** — all ten dashboard reads degraded to `?? 0`, so a failed query rendered "Total users: 0 · Fee revenue: KES 0" as fact. Now gates on the errors and renders a read-error state (`LeadsReadError`, given a `sub` prop so founder copy doesn't borrow "pipeline" wording) |
| Chart values perceivable | **Fixed** — the redemptions-per-day bars carried values via hover `title` only; the container now exposes the series as a `role="img"` aria-label, bars aria-hidden |
| Role honesty | PASS — the admin-console link and Operations cards gate on `canAccessAdminConsole`, decided by the same role read that admitted the user |
| Amber discipline | PASS — A6 range pills are ink; chart bars are brand fill (data, not money text, not an action) |
| Stable alias | PASS — `/founder/reports` is a real `redirect()` |

## Changes

- `src/app/founder/page.tsx` — revenue via `admin_success_fee_revenue` RPC;
  read-failure state instead of zeroed KPIs.
- `src/components/agent/lead-row-list.tsx` — `LeadsReadError` gains an
  overridable `sub` line (default unchanged; agent screens render
  byte-identical copy).
- `src/app/admin/reports/page.tsx` — accessible series summary on the bar
  chart.
- `src/components/__tests__/admin-ui-polish.test.ts` — ratchets: founder page
  uses the RPC with no `.select("amount")`; read-failure handling present.
- `docs/maanta-drift-register.md` — **D149** opened and closed (register
  rule 3), guard named.

## Verification

From `maanta-app/`: `npm run lint` clean · `npm run typecheck` clean ·
`npm test` 116 files / 991 tests passed (drift-register schema suite
included) · `npm run build` passed with all three post-build gates clean.
No SQL touched — the RPC already exists and is production-applied
(`20260726200000_architecture_now_fixes.sql`).

## Open decisions

None. The polish series is complete across every surface family: shopper,
merchant (app + onboard), admin, agent, founder, marketing.
