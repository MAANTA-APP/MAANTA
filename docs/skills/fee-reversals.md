# Skills: fee reversals (admin success-fee wallet credit)

Last updated: 2026-07-25 · How an admin reverses a KES 30 success fee.
Update this file after any change to the reversal path.

## The frozen policy (Decisions Log 2026-07-22)

MAANTA may reverse a success fee when the merchant is **clearly in the right**,
**including cases where the shopper already redeemed the deal**. Every case is
**reviewed by an admin**. An approved reversal is applied **only** by
**crediting the merchant's top-up wallet**. The original redemption row and the
original success-fee ledger row are left **intact**. **No direct balance edits,
no silent offsets** — the credit always writes a ledger row.

Mirrored in: MoU / Term Sheet ("Merchant Incentives; Fees and Reversals"),
`MAANTA_BBS_Pilot_Pack.docx`, the Notion Decisions Log, and the manual
`MAANTA-Fee-Reversal-Log.xlsx` pilot log.

This is **purely additive** — it does not change the KES 30 fee, the fee pin,
verify-anyway, or the `{charged, owed, unknown}` fee-status model.

## End to end

1. Admin opens **`/admin/redemptions`** and clicks a redemption row →
   **`/admin/redemptions/[id]`** (the detail + decision surface). It shows the
   code, merchant, deal, the success fee, the merchant's wallet/arrears, the
   timestamps, and the fee ledger rows linked to that redemption.
2. If the fee is reversible (redemption is `success`, a fee row is linked, and
   it has not already been reversed), the one **amber** primary action
   **"Credit fee to merchant wallet"** is shown. It opens a confirm modal that
   captures an optional **incident number** and a **required decision note**
   (Decisions Log 2026-07-23). The modal's confirm stays disabled until a
   non-empty note is entered; the route and the RPC enforce the same rule.
3. Confirm → `POST /api/admin/redemptions/[id]/reverse-fee` →
   `requireAdminApi` gate → RPC `reverse_success_fee(redemption, admin_id,
   incident_ref, note)` via the service client.
4. The RPC, in one transaction:
   - re-checks the caller is service_role/admin **and** the recorded approver is
     a real admin;
   - requires the redemption to be `success` and a `success_fee` /
     `success_fee_arrears` row to be linked to it (blocks crediting an
     unknown/never-applied fee);
   - blocks a second reversal of the same redemption (`UNIQUE(redemption_id)`
     + an explicit `already_reversed` check);
   - credits the wallet **settle-arrears-first** (frozen top-up semantics):
     writes a **`fee_reversal`** `+fee` ledger row (`reference_id` = redemption
     id) and, if arrears were standing, a `−settled` `arrears_settlement` leg;
   - writes the **`fee_reversals`** audit row.
5. The detail page refreshes and shows a "Fee already reversed" notice with the
   amount, approver, incident and note.

## What gets written, and where

| Where | Row |
|---|---|
| `merchant_transactions` | `fee_reversal` **+KES fee**, `reference_id` = redemption id, provider `manual`, description `Fee reversal - redemption <code>, incident #<n>` |
| `merchant_transactions` | (only if arrears existed) `arrears_settlement` **−settled**, same `reference_id` |
| `merchants` | `outstanding_arrears −= settled`, `account_balance += fee − settled` |
| `fee_reversals` | audit: redemption id, merchant id, wallet_transaction_id, redemption code snapshot, amount, incident_ref, note, approver_user_id, created_at |

Reconciliation is preserved (same invariant as top-ups): `account_balance` =
Σ balance-affecting rows; `outstanding_arrears` = Σ over
(`success_fee_arrears`, `arrears_settlement`).

**Charged case:** merchant paid the fee → +fee lands on the balance (made
whole). **Arrears case:** merchant owed the fee as arrears → the credit clears
the arrears instead (relieved of it). Both are "credit the top-up wallet".

## Export to MAANTA-Fee-Reversal-Log.xlsx

The view **`public.admin_fee_reversal_log`** projects the xlsx columns directly:
`reversal_date` (date), `merchant`, `redemption_code`, `issue` (incident_ref),
`decision` (note), `credit_amount`, `wallet_credit_note` (the ledger row's
description), `approver`, `running_total` (cumulative sum). Admin-only
(`security_invoker` + the `fee_reversals` RLS admin policy).

## Guard rails / gotchas

- **A decision note is required.** Enforced in three runtime layers plus a
  database backstop (UI confirm disabled until a note is entered → route 400 on
  empty/whitespace → `reverse_success_fee` raises `note_required` → the
  `fee_reversals.note` column is `NOT NULL` + trimmed-length CHECK). The
  incident number stays optional. Frozen 2026-07-23 (see the note-required and
  note-NOT-NULL migrations).
- **One reversal per redemption.** Enforced in the DB, not just the UI.
- **The approver must be a real admin.** The service client carries no identity,
  so the route passes the authenticated admin's `users.id` as `p_admin_user_id`;
  the RPC verifies its role.
- **Never** reverse by editing `merchants.account_balance` or by a manual ledger
  row — always the RPC, so the audit row and idempotency come with it.
- The RPC is the **one sanctioned exception** to "all money via
  `recordMerchantTransaction`" (that helper's RPC is service_role-only and can't
  serve an admin JWT). See `docs/skills/payments-rails.md`.

## Code map

- migration `maanta-app/supabase/migrations/20260722120000_admin_fee_reversal_wallet_credit.sql`
- migration `maanta-app/supabase/migrations/20260723150000_reverse_success_fee_note_required.sql` (decision note made mandatory)
- migration `maanta-app/supabase/migrations/20260724130000_fee_reversals_note_not_null.sql` (note column `NOT NULL` + trimmed-length CHECK — the 4th enforcement layer)
- RPC `public.reverse_success_fee`, table `public.fee_reversals`, view `public.admin_fee_reversal_log`
- route `maanta-app/src/app/api/admin/redemptions/[id]/reverse-fee/route.ts`
- UI `maanta-app/src/app/admin/redemptions/[id]/page.tsx` + `reverse-fee-action.tsx`
- tests `maanta-app/supabase/tests/fee_reversal_test.sql`
