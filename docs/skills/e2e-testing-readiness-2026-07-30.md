# Skills: E2E testing readiness (inventory run) — 2026-07-30

**Mode:** Builder · **Branch:** `cursor/e2e-testing-readiness-2020`  
**Baseline:** `main` @ `a1cd5b2` (trial-honesty #144 already landed)

## One-line verdict

Critical pilot path is code-ready. This run closed remaining **honesty / alias /
pause-gate** gaps so a founder walkthrough is not misled by STK-first top-up,
wrong inventory paths, or paused deals that still accepted claims.

## Inventory drift classified (not guessed)

| Prompt item | Classification | Code truth |
|---|---|---|
| Verify-anyway vs hard reject | **D resolved → document** | Confirm = success + fee + dispute; Reject = no fee |
| No `design/current-reality/` | C / known | Routes win |
| Third feed section naming | D (rename only) | Locked = All Active Deals; UI = Deals near me |
| See-all Flash/Priority screens | C | `/search?type=` links exist |
| Archive/repost/delete frames | C | Partial code; not first E2E |
| Elite 2 active deals | Held | `enforce_deal_limit` |
| Staff permission granularity | C | `can_verify` / owner gates enough for E2E |
| M-Pesa listed first | **A fixed** | Stripe primary; STK gated |
| Admin support / pricing clickable | Held | Prototype non-click ≠ code |

## What we shipped

- Stripe-first `/merchant/topup` + `isIntasendConfigured()`
- Aliases: `/merchant/onboarding`, `/tickets` → canonical routes
- `claim_deal` pause gate restore + API mapping + SQL test
- Support FAQ verify-anyway clarification
- Route readiness table + inventory report + checklist update

## How to continue

1. Founder runs updated `docs/ops/founder-e2e-checklist-2026-07-30.md`.
2. Apply `20260730180000_restore_claim_deal_pause_gate.sql` on target DB.
3. Leave Bucket C design-ahead work alone until after first E2E.

## Artifacts

| Doc | Path |
|---|---|
| Inventory readiness report | `docs/ops/e2e-readiness-report-inventory-2026-07-30.md` |
| Route table | `docs/ops/e2e-route-readiness-2026-07-30.md` |
| Founder checklist | `docs/ops/founder-e2e-checklist-2026-07-30.md` |
| Prior trial-honesty report | `docs/ops/e2e-readiness-report-2026-07-30.md` |
| Surface matrix | `docs/skills/e2e-surface-matrix-2026-07-30.md` |
