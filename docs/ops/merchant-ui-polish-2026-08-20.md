# Merchant UI polish pass — 2026-08-20

Builder session, follow-up to `shopper-ui-polish-2026-08-20.md`. Same method:
UI-UX-PRO-MAX `ux`-domain queries (forms/validation, destructive confirmation,
submit feedback, wizard progress, numeric inputs) audited against the gated
merchant surfaces, frozen UI + money rules overriding.

## Scope

`frames.json` gated merchant surfaces: `/merchant/redeem`, `/merchant/deals`
(+ `new`, `[id]`, `archived`), `/merchant/wallet`, `/merchant/topup`,
`/merchant/staff`, `/merchant/alerts`, and the shared inputs in
`src/components/ui/inputs.tsx`. `/merchant/onboard` was left out deliberately —
it is merchant-authored with a rendered agent-attribution step and deserves its
own session.

## Audit verdicts

| Guideline | Verdict |
|---|---|
| Fee before action, no surprise debit | PASS — resolve-then-charge keypad, fee on the Confirm label, verify-anyway honest |
| Destructive actions confirm first | Archive deal PASS; **fixed** staff removal (one tap fired the DELETE) |
| Errors announced, not visual-only | `InlineAlert` PASS (`role="alert"`); **fixed** the raw error `<p>`s in topup, deal sheets, staff, wizard |
| Submit shows loading then outcome | PASS (`Button loading`, success/failed screens); **fixed** silent "Checking…"/"Confirming…"/STK-waiting states |
| Wizard shows progress | **Fixed** — five steps had no position marker; header now shows "Step N of 5" |
| Numeric/tel `inputmode` | PASS (`AmountField`, `PhoneField`, keypad) |
| Dropdown dismissal | **Fixed** `PhoneField` country list (closed only on selection); same contract as the shopper `FilterDropdown` fix |
| Switches accessibly named | **Fixed** — `Toggle` (`role="switch"`) had no programmatic name |
| Frozen rules on money surfaces | One violation found and fixed (**D148**, below); everything else PASS |

## Changes

1. **`staff/[id]/manage-staff.tsx`** — staff removal now opens a confirmation
   sheet (destructive button + cancel, archive-deal pattern) instead of firing
   the DELETE on first tap; error text gained `role="alert"`.
2. **`deals/[id]/deal-actions.tsx`** — boost sheet's "Pay from wallet" chip
   moved off the amber fill to `bg-cream` with `formatKes` (**D148**: two amber
   fills on one money sheet, wallet amount on brand); sheet errors and the
   partial-save notice now announce (`role="alert"` / `role="status"`).
3. **`deals/new/new-deal-wizard.tsx`** — "Step N of 5" indicator in every step
   header; publish-error card announces.
4. **`topup/topup-flow.tsx`** — error announces; "Waiting for M-Pesa
   confirmation…" is a `role="status"` live region.
5. **`redeem/redeem-keypad.tsx`** — "Checking…" and "Confirming…" announce.
   No other change to the till: the resolve-then-charge structure, fee
   disclosure and dark failure screen audit clean.
6. **`src/components/ui/inputs.tsx`** — `Toggle` takes `aria-label` from its
   label; `PhoneField` country dropdown closes on outside tap and Escape.
7. **`src/components/__tests__/merchant-ui-polish.test.ts`** — ratchets: Toggle
   accessible name, staff-removal confirmation, boost chip off brand fill,
   wizard step indicator.

## Verification

`npm run lint` clean · `npm run typecheck` clean · `npm test` 115 files / 979
tests passed (frozen-ui-rules + drift-register suites included) ·
`npm run build` passed, all three post-build gates clean.

## Drift

**D148** opened and closed in this change (register rule 3): the frozen-UI
audit's R1 "single amber primary" claim vs the boost sheet's two amber fills.
R1 remains manual-only for its general case — the new test guards this one
instance, not the rule.

## Open decisions

None. Remaining surface families: admin/agent/founder, `/merchant/onboard`,
marketing pages.
