# Admin redemption-detail merge train (2026-07-22)

Handoff for how four open PRs were sequenced and merged into `main`, and how the
three-way collision on `/admin/redemptions/[id]` was resolved. Written so a
future session can understand the single detail page's provenance.

## What merged, in order

Collision-safe order (each validated with typecheck + lint + `npm test` + build
before the next):

1. **#41** `polish(ui)` — shared primitives + de-ambered list pills. No detail
   page. Landed first so everything else rebased onto the final tokens.
2. **#40** `feat(admin,agent): A2/A3/G4` — created the canonical
   `/admin/redemptions/[id]/page.tsx` (A3 read-only snapshot), `/admin/customers`
   (A2), agent lead↔merchant link (G4).
3. **#37** `feat(admin): Guardian recommendations UI` — folded **into** #40's
   detail page (not recreated): Guardian recommendation chip, `guardian_events`
   timeline, and the held-row Release/Reject override. Also added the "Held for
   review" queue to the list page. Its base was stale, so it was a genuine merge.
4. **#42** `Admin success-fee reversal wallet-credit flow` — folded **on top**:
   fee ledger for the redemption, merchant-wallet facts, and the amber
   "Credit fee to merchant wallet" action. Carries the only migration
   (`20260722120000_…`, sorts last — no renumber) + `fee_reversal_test.sql`.

All four were merged with `git merge --no-ff origin/<branch>` on `main`; each PR
head is an ancestor of `main`, so GitHub marked them merged on push.

## The collision & how it was resolved

`/admin/redemptions/[id]/page.tsx` was created **fresh by #40, #37, and #42**
(three-way add/add). The final page is a **superset**, not a pick-one:

- **Data:** the `redemptions` row (authoritative for the money figures —
  `amount_kes` YOU PAY, `success_fee_charged`, plus merchant wallet + arrears and
  the fee ledger via `merchant_transactions.reference_id`) **and** the
  `admin_redemption_detail` RPC (best-effort: Guardian recommendation + events).
  The RPC is best-effort so pre-Guardian redemptions still render their full A3
  snapshot.
- **Amber budget (frozen R1 — ≤1 amber action/screen):** the held **Release**
  action (`status='flagged'`) and the **Credit-fee** action
  (`status='success'` + linked fee + no prior reversal) are **mutually exclusive
  by status**, so the two amber controls never appear together.
- The A3 guard (`src/lib/__tests__/feature-gaps-a2-a3-g4.test.ts`) still passes:
  the page keeps `amount_kes`, `success_fee_charged`, `tnum`, and no `text-brand`.

`/admin/redemptions/page.tsx` (list) took all four edits: neutral filter pills
(#41), row deep-links (#40/#42, `-mx-4 px-4 hover:bg-cream`), and the Guardian
"Held for review" queue (#37). `chips.tsx` auto-merged (FraudChip restyle from
#41 + GuardianChip/GuardianSeverityChip from #37).

## Before-merge test status (local)

typecheck ✓ · lint ✓ · vitest **51/51** ✓ · `next build` compiled ✓ (77/77 pages;
the public/shopper prerender errors are the pre-existing missing-Clerk-key
condition — the `force-dynamic` admin route is unaffected). The 8 pgTAP suites
need a live Postgres and run in CI `db-tests`; they were not run headless.

## Still worth doing manually before relying on the pilot

- Seed a held (`flagged`) redemption → confirm the list "Held for review" queue,
  the detail Guardian timeline, and Release → `admin_release_redemption(id,true)`
  moves the KES 30 fee.
- On a `success` redemption with a linked fee → "Credit fee to merchant wallet"
  → verify the `fee_reversal` +30 ledger row, wallet up by 30 (arrears settle
  first), action hides behind "Fee already reversed", 2nd attempt 409,
  non-admin 403, no-fee 422.
- Run the pgTAP `db-tests` job (incl. `fee_reversal_test.sql`) against live PG.

## Companion docs patch (same session)

Repo/Notion drift corrected (docs-only, on `claude/maanta-repo-audit-plan-bmb2kz`):
Elite price-review date Oct 2026 → **Feb 2027**; migration count 33 → **52**;
the pgTAP suites listed in the technical-handoff test section; the archived
`/api/waitlist` spec marked never-built. Guardian was already "implemented" in
`decisions-log`/`maanta-guardian-v1.md` — the only residual is Notion.
