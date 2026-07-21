# Skills: Frozen UI — Locked Rules audit

Last updated: 2026-07-21 · Audit of the shipped surfaces against the frozen
"Hard Rules" (design handoff README §"Hard Rules"; ENGINEERING_NOTES §8.5).
Baseline: the repo is treated as the mature implementation — this audit finds
and records deviations rather than rebuilding. Re-run after any UI change.

Static rules are now enforced in CI by
`maanta-app/src/lib/__tests__/frozen-ui-rules.test.ts`; the money-path/golden
rules by `maanta-app/supabase/tests/*.sql` (db-tests job).

## Result summary

| # | Locked rule | Verdict | Enforced by |
|---|---|---|---|
| 1 | ≤1 amber action per screen (disabled → grey; amber moves, never two) | PASS (manual spot-check) | not statically checkable — see note |
| 2 | Never amber text on light backgrounds (exceptions: active-tab, code pulse, logo) | PASS | `frozen-ui-rules` (money case) + manual: remaining `text-brand` are on dark surfaces / logo |
| 3 | Money never coloured, never in toasts, no celebration/sound on money surfaces | PASS | `frozen-ui-rules` (money-never-amber) + grep: no confetti/sound/money-toast |
| 4 | Status = icon + word (greyscale-readable); failures dark #141414, never red; error is borders/icons only, text #111 | PASS | `frozen-ui-rules` (failure-dark **and** error-text-not-red) |
| 5 | Closed vocabulary (claim/redeem/deal/wallet/top up/success fee) | PASS | `frozen-ui-rules` (vocabulary) |
| 6 | 6-digit code is the only bare numeral; price never inside the pulsing code card | PASS | manual: `tickets/[id]/claimed-code.tsx` card holds only label+code+countdown |
| 7 | YOU PAY total identical on tile/detail/code; itemised breakdown only on detail | PASS | single source `src/lib/pricing.ts` (+ `pricing.test.ts`) |

## Fixed this session

- **R3 / R2 — money in amber.** `plan/upgrade` and `pricing` rendered
  `KES 3,500` in `text-brand` on their dark cards → changed to `text-white`
  (uncoloured money, legible on dark). Now guarded by the `frozen-ui-rules`
  money-never-amber check.

## Resolved — R4: error message text moved off red to #111 (enforced)

Decision (2026-07-21): enforce the spec rather than carve out an exception —
"state is never colour alone." Error **message** text now renders in `text-ink`
(#111) across the surfaces that had used `text-flame`; the red token stays on
semantic **borders and icons** only (e.g. `InlineAlert` error variant keeps its
flame border + `!` icon with #111 body; `Button` destructive-outline and the
`flagged` status chip keep their flame border/label; icon glyphs keep flame).
Files changed: `inputs.tsx`, `new-deal-wizard.tsx`, `deal-actions.tsx`,
`archived-actions.tsx`, `topup-flow.tsx`, `staff/new`, `staff/[id]`,
`onboard-wizard.tsx`, `admin/billing/plan-actions.tsx`,
`admin/merchants/[id]/merchant-admin-actions.tsx`, `agent/leads/new`.

Now ratcheted by `frozen-ui-rules` ("never renders error body text in red"):
`text-flame` is allowed only on a `border-flame` line, an `Icon*` line, or the
two status-indicator glyph/label cases — any other `text-flame` fails CI.

## Follow-up — R1 and the browser golden path (own tickets)

- **R1 (≤1 amber per screen)** is not statically enforceable (needs render-time
  state); keep it as a manual PASS-2 review item per screen. Spot-checks of the
  money-critical screens pass — a single amber primary (or zero on the M3/M4/M5
  outcome/takeover surfaces), disabled controls greyed (`button.tsx` forces
  `!bg-cream-dark !text-faint` when disabled).
- **Browser golden path (Playwright).** The RPC-level golden path
  (`supabase/tests/golden_path_test.sql`) proves the money invariants
  (claim → verify → ledger, one reference, wallet math) but **not** that the
  browser-visible flow matches that chain. Deliberately **not** scaffolded here —
  an unrunnable suite would be false coverage. **Follow-up (needs infra):** when
  a live Supabase + Clerk test environment exists, add a Playwright golden path
  `/demo → claim → verify → wallet` and gate CI on it. Track as its own ticket,
  dependent on the test environment; not a blocker for this branch.

