# Skills: redemption and disputes

Last updated: 2026-07-22 · The core loop (claim → verify → fee) and what happens
when it goes wrong. Update after any meaningful change to these flows.

## The core loop

1. **Claim** — shopper claims a deal via the `claim_deal` RPC (SECURITY DEFINER,
   caller must equal the shopper unless service role). Creates a pending
   redemption with an OTP code. Ticket expiry = deal `expires_at` **+ 15 minutes**
   (frozen, decisions log 2026-06-30). Pending claims are excluded from the
   merchant trust metric. **Paused deals:** new claims raise `deal_paused`
   (mapped to HTTP 409 + `code: "deal_paused"`). Tickets claimed while the deal
   was active stay valid — see `docs/skills/paused-deal-semantics.md`.
2. **Verify** — merchant enters the OTP at `/merchant/redeem` →
   `POST /api/redemptions/verify` → the **`verify_redemption` RPC**. This is
   self-authorizing and atomic: locks the pending redemption `FOR UPDATE`, flips
   it to success, increments the deal's `claims_count`, and calls
   `deduct_success_fee_or_record_arrears` to debit the KES 30 fee (or record
   arrears). ⚠️ A previous hand-rolled version never debited the fee — do not
   bypass the RPC. Pause does **not** block verification of already-claimed
   tickets.
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
| `hard_block` | `failed` (declined) | **none** | non-accusatory in-ink error; appealable by admin (`admin_appeal_hard_block`) |

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

Admin override SOP for a **held** (soft-blocked) redemption: read
`admin_redemption_detail`, then `admin_release_redemption(id, true)` to complete
it (applies the fee through the normal money path) or `(id, false)` to fail it
(no fee).

Admin SOP for a **declined** (hard-blocked) redemption — a false positive can be
overturned after the fact: `admin_appeal_hard_block(id, true)` completes it
(`failed→success` + the KES 30 fee) or `(id, false)` upholds the block. Only a
`failed` redemption flagged `guardian_hard_block` and not already appeal-rejected
is appealable, and it's a one-time decision (see design note §3).

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
3. Resolve through the ledger (charge, waive, refund, or **success-fee reversal**
   — see the next section) — never a manual balance edit — and close the task
   with a note.
4. Merchant-behavior patterns (repeated unknowns, expired-code retries) feed the
   trust metric (`recalculate_trust_metric`) and the weekly ops review.

## The trust metric, as it actually runs

Stated here because no repo document carried the formula, and a rule nobody can
read is a rule that gets re-guessed. Read back from production
`axrrslqssmbngbataejg` on 2026-08-19 via `pg_get_functiondef`, so this is the
shipped behaviour, not a proposal:

```
trust = clamp( (0.5 × R) + (0.3 × A) − (0.2 × F), 0.0, 1.0 )
```

- **R** — success ratio over the last 30 days: `success ÷ total`, counting
  **terminal states only** (`success`, `failed`, `flagged`). `pending` is
  excluded by the function's own filter, which is why the never-swept expired
  claims in drift **D134** are invisible to it. No redemptions in the window → R
  is 1.0.
- **A** — mean `audit_logs.composite_score` over the last 90 days; no audits →
  1.0.
- **F** — flagged ratio over the same 30-day window; no redemptions → 0.0.

Two thresholds are applied on every recalculation, unconditionally:

- `trust < 0.50` → `is_visible = false` (the merchant leaves shopper discovery).
- `trust > 0.90` → `is_featured = true`, otherwise `is_featured = false`.

The **first** crossing below 0.50 also inserts a high-priority `retraining` row
in `agent_tasks` ("Trust fell to *x*. Merchant hidden."); subsequent
recalculations while already below do not re-open one.

Recalculation is reached from `update_kpi_counters` (redemption outcomes) and
`recalculate_trust_after_audit`. Because the `is_featured` write is
unconditional, it also overwrites an admin's Feature action from
`/admin/merchants/[id]` — tracked as drift **D133**, founder to rule.

## Dispute SLA + success-fee reversal (2026-07-22)

**SLA (founder ruling 2026-07-22): admin resolves a disputed / flagged redemption
within 72 hours.** Uphold (merchant clearly right) → the redemption is reversed and
the KES 30 success fee is credited back to the merchant wallet; reject → the fee
stands. Shopper-facing copy on the flagged-ticket screen states **72 hours**
(`src/app/(shopper)/tickets/[id]`).

**Success-fee reversal** — the mechanism for "uphold". MAANTA may reverse a KES 30
success fee when the merchant is clearly in the right (MAANTA-caused mispricing /
wrong fee, duplicate charge on the same code, or a system/UX error), **including
after the shopper has redeemed**. It is admin-reviewed (only the founder or a named
admin approves; staff/agents escalate only) and applied **only** by crediting the
merchant top-up wallet via the admin-gated `reverse_success_fee` RPC — never a
manual balance edit. The credit writes a `fee_reversal` ledger row (settle-arrears
-first), **one reversal per redemption**; the original redemption row and original
fee ledger row are never modified. No ranking / trust-metric impact during the
pilot. Every case is logged in `MAANTA-Fee-Reversal-Log.xlsx` and the
`admin_fee_reversal_log` export view.

- Migration `20260722120000_admin_fee_reversal_wallet_credit.sql`; route
  `POST /api/admin/redemptions/[id]/reverse-fee`; UI action on
  `/admin/redemptions/[id]`; test `supabase/tests/fee_reversal_test.sql`.
- Policy of record: Decisions Log 2026-07-22 (fee-reversal policy + 72h dispute SLA).

## Where things live

- RPCs: `maanta-app/supabase/migrations/20260702092952_core_loop_claim_and_verify_redemption.sql`
  (+ fixes `20260702093134`, `20260702093258`), fee hardening `20260702094145`.
- Route: `maanta-app/src/app/api/redemptions/verify/route.ts` (also `POST /api/redemptions` for claims).
- Trust metric: migrations `20260703235350`, `20260704000722`.
- Guardian hard-block appeals: migration `20260722160000_guardian_hard_block_appeal.sql`
  (`admin_appeal_hard_block`); route `POST /api/admin/redemptions/[id]/appeal`;
  UI `appeal-actions.tsx`; test `supabase/tests/guardian_hard_block_appeal_test.sql`.
- Guardian v1: migration `20260721140000_guardian_v1.sql` (`guardian_events`,
  `guardian_evaluate`, verify-time wiring, `admin_release_redemption`,
  `admin_redemption_detail`); tests `supabase/tests/guardian_v1_test.sql`;
  design note `docs/maanta-guardian-v1.md`.
