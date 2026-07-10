# Skills: redemption and disputes

Last updated: 2026-07-10 · The core loop (claim → verify → fee) and what happens
when it goes wrong. Update after any meaningful change to these flows.

## The core loop

1. **Claim** — shopper claims a deal via the `claim_deal` RPC (SECURITY DEFINER,
   caller must equal the shopper unless service role). Creates a pending
   redemption with an OTP code. Ticket expiry = deal `expires_at` **+ 15 minutes**
   (frozen, decisions log 2026-06-30). Pending claims are excluded from the
   merchant trust metric.
2. **Verify** — merchant enters the OTP at `/merchant/redeem` →
   `POST /api/redemptions/verify` → the **`verify_redemption` RPC**. This is
   self-authorizing and atomic: locks the pending redemption `FOR UPDATE`, flips
   it to success, increments the deal's `claims_count`, and calls
   `deduct_success_fee_or_record_arrears` to debit the KES 30 fee (or record
   arrears). ⚠️ A previous hand-rolled version never debited the fee — do not
   bypass the RPC.
3. **Fee outcome** — the RPC returns `fee_charge_status`:
   - `charged` — wallet debited.
   - `owed` — insufficient balance; arrears recorded. Redemption still succeeds.
   - `unknown` — something unexpected; redemption still succeeds (**verify-anyway**)
     and a **fraud-review task** is auto-created for admin (migration
     `20260703235152`).

## Verify-anyway (frozen ops decision)

The shopper never waits on a billing problem at the counter. Fee uncertainty and
disputes route to admin / on-ground agent handling **after the fact**, and must
stay auditable: ledger entries + admin tasks + webhook failure log are the audit
trail. Don't add a pre-verification balance gate to the redeem flow; the gate is
on **deal creation** (zero-balance merchants can't create new deals).

### Override + dispute escalation (wired 2026-07-10)

- `verify_redemption` takes `p_override` / `p_override_reason` (defaulted —
  old 3-arg callers keep working) and returns a `disputed` boolean
  (migration `20260709191750`, applied live 2026-07-09 and back-ported to
  the repo 2026-07-10).
- Flagged redemptions (`review_required` or `fraud_flags`) **still verify** —
  atomically marked `review_required=true`; an override appends
  `merchant_override` to `fraud_flags`. A `fraud_events` row and a
  high-priority `dispute_review` `agent_tasks` row are written best-effort
  (never block the shopper).
- The merchant "Verify anyway" button on the 9t location-mismatch screen
  passes `override: true` + a reason (with distance) through
  `POST /api/redemptions/verify` to the RPC.
- Admin reviews disputes in **`/admin/support`** (the `agent_tasks` queue);
  the Override button completes a task with an audit line appended.

## Error mapping in `/api/redemptions/verify`

RPC error strings → user-facing responses:

| RPC error | HTTP | Message |
|---|---|---|
| `redemption_not_found_or_already_used` | 404 | Invalid or already-used code |
| `redemption_expired` | 410 | This code has expired |
| `redemption_already_verified` | 409 | This code has already been redeemed |
| `unauthorized` | 403 | Not authorized |
| anything else | 500 | Could not complete redemption (logged) |

Keep new error cases in this string-match style — the RPC raises, the route maps.

## Card-payment disputes (merchant top-ups)

Handled in the Stripe webhook, not here in spirit but linked for triage:
dispute created → hold debit; dispute closed → release/keep; refunds skip if an
unresolved dispute hold already covers the money. Idempotency by
`payment_intent`. Full detail in `docs/skills/payments-rails.md`.

## Dispute/fraud triage SOP (admin)

1. Open the fraud-review task; pull the redemption row and its ledger entries.
2. Determine fee state: charged / owed (arrears) / never charged.
3. Resolve through the ledger (charge, waive, or refund entry) — never a manual
   balance edit — and close the task with a note.
4. Merchant-behavior patterns (repeated unknowns, expired-code retries) feed the
   trust metric (`recalculate_trust_metric`) and the weekly ops review.

## Where things live

- RPCs: `maanta-app/supabase/migrations/20260702092952_core_loop_claim_and_verify_redemption.sql`
  (+ fixes `20260702093134`, `20260702093258`), fee hardening `20260702094145`,
  override + dispute escalation `20260709191750`.
- Route: `maanta-app/src/app/api/redemptions/verify/route.ts` (also `POST /api/redemptions` for claims,
  `/preflight` for the pre-charge flag check, `/reject` for merchant rejection).
- Merchant UI: `maanta-app/src/app/merchant/(app)/redeem/redeem-keypad.tsx`.
- Admin queue: `maanta-app/src/app/admin/support/` over `agent_tasks`.
- Trust metric: migrations `20260703235350`, `20260704000722`.
