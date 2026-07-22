# Skills: redemption and disputes

Last updated: 2026-07-21 · The core loop (claim → verify → fee) and what happens
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

## Guardian v1 — verify-time fraud checks (2026-07-21)

Full design: `docs/maanta-guardian-v1.md`. `verify_redemption` now runs
`guardian_evaluate(redemption_id, now)` **after** the OTP matches but **before**
status/money finalise, and maps one recommendation to behaviour:

| Recommendation | Redemption status | Fee | Notes |
|---|---|---|---|
| `clear` | `success` | applied as today | nothing tripped |
| `flag` | `success` | **applied unchanged** | verify-anyway preserved; suspicious event + dispute logged, `disputed=true` |
| `soft_block` | `flagged` (held) | **none** | held for admin; release with `admin_release_redemption(id, true/false)` |
| `hard_block` | `failed` (declined) | **none** | non-accusatory in-ink error; terminal in v1 |

Key money invariant: the KES 30 fee and the 3-state `feeChargeStatus` only move
on the success path (clear/flag) — **byte-for-byte the old logic**. Held/blocked
move no money, so `fee_charge_status` comes back `NULL` (not one of the 3
states). Blocks are for the egregious tail; thresholds sit above plausible
legitimate repeat activity (see the design note's table). Merchant-velocity
never blocks; a redemption with no GPS is never geofence-penalised.

Audit surfaces: granular per-redemption rows in **`guardian_events`** (keyed by
`redemption_id`), plus the existing `fraud_events` + `agent_tasks.dispute_review`
routing for warn+ hits. `admin_redemption_detail(id)` returns the redemption with
its `guardian_events` and overall recommendation — the entry point for future
Guardian admin UI.

Admin override SOP for a **held** redemption: read `admin_redemption_detail`,
then `admin_release_redemption(id, true)` to complete it (applies the fee through
the normal money path) or `(id, false)` to fail it (no fee). Hard-blocks have no
release path in v1.

**Admin UI (2026-07-22):** `/admin/redemptions` leads with a **Held for review**
queue; each redemption links to `/admin/redemptions/[id]`, which renders the
Guardian recommendation, the `guardian_events` timeline, and (for held rows) the
Release / Reject actions via `POST /api/admin/redemptions/[id]/release`. That is
the surface to use for the SOP above — no raw SQL needed.

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
  (+ fixes `20260702093134`, `20260702093258`), fee hardening `20260702094145`.
- Route: `maanta-app/src/app/api/redemptions/verify/route.ts` (also `POST /api/redemptions` for claims).
- Trust metric: migrations `20260703235350`, `20260704000722`.
- Guardian v1: migration `20260721140000_guardian_v1.sql` (`guardian_events`,
  `guardian_evaluate`, verify-time wiring, `admin_release_redemption`,
  `admin_redemption_detail`); tests `supabase/tests/guardian_v1_test.sql`;
  design note `docs/maanta-guardian-v1.md`.
