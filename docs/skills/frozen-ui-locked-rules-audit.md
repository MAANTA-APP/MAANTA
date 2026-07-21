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
| 4 | Status = icon + word (greyscale-readable); failures dark #141414, never red | PASS for the failure takeover; **FLAG** on error *text* colour | `frozen-ui-rules` (failure-dark) |
| 5 | Closed vocabulary (claim/redeem/deal/wallet/top up/success fee) | PASS | `frozen-ui-rules` (vocabulary) |
| 6 | 6-digit code is the only bare numeral; price never inside the pulsing code card | PASS | manual: `tickets/[id]/claimed-code.tsx` card holds only label+code+countdown |
| 7 | YOU PAY total identical on tile/detail/code; itemised breakdown only on detail | PASS | single source `src/lib/pricing.ts` (+ `pricing.test.ts`) |

## Fixed this session

- **R3 / R2 — money in amber.** `plan/upgrade` and `pricing` rendered
  `KES 3,500` in `text-brand` on their dark cards → changed to `text-white`
  (uncoloured money, legible on dark). Now guarded by the `frozen-ui-rules`
  money-never-amber check.

## Open FLAG — R4: error message text uses `text-flame` (red)

The token spec is explicit: `status-error #8C1D18` is for **borders/icons only;
error text stays #111**, and every status must be **icon + word, readable in
greyscale**. Several surfaces signal validation/action errors with red text
alone (colour as the sole signal), which is not greyscale-readable:

- `src/components/ui/inputs.tsx:223` — "Required to continue"
- `src/components/ui/cards.tsx:330`
- `src/app/merchant/(app)/deals/new/new-deal-wizard.tsx:275,535`
- `src/app/merchant/(app)/deals/[id]/deal-actions.tsx:86`
- `src/app/admin/billing/plan-actions.tsx:40`
- `src/app/admin/merchants/[id]/merchant-admin-actions.tsx:74,143`
- `src/app/agent/leads/new/page.tsx:112`

(`src/components/ui/states.tsx:55` uses flame for an **icon** glyph — allowed.)

**Recommendation (not applied — a cross-surface design change, left for a
decision to avoid regressing a mature UI):** render error message text in
`text-ink` (#111) and carry the error signal with the existing red border/icon,
so it reads in greyscale. The change is mechanical (swap `text-flame` → `text-ink`
on the message spans; keep red on borders/icons). If the team decides red error
text is acceptable, record it as a deliberate exception in the decisions log and
tighten `frozen-ui-rules` accordingly. Either way the rule should stop being
ambiguous.

## Note — R1 (≤1 amber per screen) is not statically enforceable

Counting "amber actions per rendered screen" needs render-time knowledge (which
CTA is amber after state/branching, sticky bars, tab bars). Spot-checks of the
money-critical screens pass: the merchant keypad, wallet, top-up, deal detail
and claimed-code each present a single amber primary (or zero on the M3/M4/M5
outcome/takeover surfaces), with disabled controls greyed (`Button` forces
`!bg-cream-dark !text-faint` when disabled, `button.tsx`). Treat R1 as a manual
PASS-2 review item per screen, not a CI gate.
