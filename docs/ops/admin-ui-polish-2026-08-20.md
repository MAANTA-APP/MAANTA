# Admin UI polish pass — 2026-08-20

Builder session, third in the series (`shopper-ui-polish-2026-08-20.md`,
`merchant-ui-polish-2026-08-20.md`). UI-UX-PRO-MAX `ux`/`chart`-domain queries
(dense tables, filtered-empty results, audit-trail feedback, silent success)
audited against the gated admin/agent/founder surfaces. The bar here is the
CLAUDE.md one: operational, dense where density helps, auditable — boring is
correct.

## Scope

`/admin/*` (approvals, merchants, deals, redemptions + detail actions, billing,
customers, agents, support, reports), `/agent/*`, `/founder`, and the shared
loading/error boundaries.

## Audit verdicts

| Guideline | Verdict |
|---|---|
| Irreversible money actions confirm + capture audit note | PASS — `ReverseFeeAction` is the model: modal, required decision note, confirm disabled until note, cancel locked while busy |
| Failures visible, never silent | **Fixed** — `FraudActions`, `ModerationActions`, `OverrideButton` swallowed fetch failures (`catch(() => null)`, no `res.ok` check): a failed approve/remove/override was indistinguishable from success |
| Errors announced, not visual-only | **Fixed** — zero `role="alert"` across admin; added to the new error paths and the existing error text on reverse-fee, release, appeal, merchant-admin, plan actions |
| Filtered/empty lists say so honestly | PASS — every list renders inline "No X" copy; `/agent/leads` even distinguishes read-failure from genuinely-empty |
| Wide tables scroll, not clip | **Fixed** — the customers table sat in `overflow-hidden`; now `overflow-x-auto` |
| Loading states announced | **Fixed** — admin/agent skeletons gained the `sr-only` `role="status"` line (same as shopper) |
| Frozen rules (single amber, ink money, dark failure) | PASS — reverse-fee is the screen's one amber and swaps into the modal, money stays ink throughout |

Deliberately unchanged: no confirmation added to `ModerationActions` "Remove
deal" — the API is a soft deactivate with an archive snapshot and
`logAdminOp` audit row, and the admin posture favours triage speed; error
surfacing was the actual gap. `FraudActions` likewise.

## Changes

1. `admin/redemptions/fraud-actions.tsx`, `admin/deals/moderation-actions.tsx`,
   `admin/support/override-button.tsx` — check the response, surface the error
   (`role="alert"`), keep the retry path; no behavioural change on success.
2. `admin/redemptions/[id]/{reverse-fee,release,appeal}-actions.tsx`,
   `admin/merchants/[id]/merchant-admin-actions.tsx`,
   `admin/billing/plan-actions.tsx` — existing error text announced.
3. `admin/customers/page.tsx` — table container `overflow-hidden` →
   `overflow-x-auto`.
4. `admin/loading.tsx`, `agent/loading.tsx` — `sr-only` loading status.
5. `src/components/__tests__/admin-ui-polish.test.ts` — ratchets: the three
   action files must check `res.ok` and carry `role="alert"` with no
   `catch(() => null)`; trust-critical actions announce errors; the customers
   table keeps its scroll container.

## Verification

`npm run lint` clean · `npm run typecheck` clean · `npm test` 116 files / 984
tests passed · `npm run build` passed, all three post-build gates clean.

## Drift

None recorded. The silent-failure pattern was unclaimed polish debt — no doc
asserted these actions surfaced errors. (The "Override (audit-trailed)" label's
claim is about the server, which does write the audit row.)

## Open decisions

None. Remaining surface family from this series: the marketing pages.
