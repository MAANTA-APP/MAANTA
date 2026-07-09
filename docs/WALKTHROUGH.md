# WALKTHROUGH.md (repo-native export)

> **Provenance**: The original `WALKTHROUGH.md` lives in Notion and its full
> wording is **not** in this repository. Migrations pin only two step numbers:
> **Step 5 = shopper claim** and **Step 6 = merchant verify** (cited in
> `20260702092952`, `20260702093134`, `20260702093258`). Those two steps below
> are canonical. All other step numbers are **reconstructed** from actual
> product flow order and marked as such — reconcile them against the Notion
> original before citing them anywhere new.

Last updated: 2026-07-09 · End-to-end walkthrough of the MAANTA commerce loop
at BBS Mall (Node 0), with code anchors.

## Step 1 — Merchant onboarding _(reconstructed numbering)_

A merchant submits via `/merchant/onboard` → `POST /api/merchants/onboard` →
`onboard_merchant` RPC. Three explicit paths: `self_serve`, `agent_assisted`
(merchant is still the authenticated submitter; agent recorded as
`assisted_by_agent_id`, attribution only), `admin_assisted`.
Captured: name, phone/email/WhatsApp, node, what3words address, floor/unit,
entrance notes. _Anchors: `20260702083812`, `20260702085628`._

## Step 2 — Admin approval / activation _(reconstructed numbering)_

Admin reviews in `/admin` → `POST /api/admin/merchants/[id]/approve` →
`activate_merchant` RPC. Activation stamps `onboarded_by` / `onboarded_at` —
a separate lifecycle moment from onboarding attribution.
_Anchor: `20260701125016_activate_merchant_rpc.sql`._

## Step 3 — Wallet top-up _(reconstructed numbering)_

Merchant funds the prepaid wallet at `/merchant/topup`:
- **Stripe Checkout** (card, KES/USD/EUR/GBP, live FX → KES) — sandbox during testing.
- **M-Pesa STK via IntaSend** (KES) — prepared, availability not assumed.
Both credit through the idempotent `record_merchant_ledger_entry` RPC via their
webhooks. Full detail: `docs/skills/payments-rails.md`.

## Step 4 — Deal creation _(reconstructed numbering)_

Merchant creates a deal with a cover image (public `deal-images` bucket, path
`{merchant_id}/{filename}`, 5MB app-side limit). **Zero-balance gate**: deal
INSERTs are blocked while `account_balance` ≤ 0.
_Anchors: `20260701125545`, `20260703190627`._

## Step 5 — Shopper claim ✅ _(canonical step number)_

Shopper browses `/deals`, opens `/deals/[id]`, and claims → `claim_deal` RPC
(SECURITY DEFINER; caller must equal `p_user_id` unless service role).

Guards, in order: deal exists → deal active → deal unexpired → merchant active →
`max_claims` not reached → no existing pending claim for this shopper+deal.
On success: creates a pending redemption with a 6-digit OTP (DB-unique among a
merchant's pending tickets; up to 5 collision retries) and returns the ticket
(deal, merchant, what3words location, floor/unit).

**Frozen rule**: `redemption.expires_at = deal.expires_at + 15 minutes`
(DECISIONS_LOG 2026-06-30 supersession).
_Anchors: `20260702092952`, fix `20260702093134`._

## Step 6 — Merchant verify ✅ _(canonical step number)_

At the counter, merchant enters the shopper's OTP at `/merchant/redeem` →
`POST /api/redemptions/verify` → `verify_redemption` RPC (self-authorizing:
merchant owner or admin, or service role).

Atomically: locks the pending redemption `FOR UPDATE` → checks not-expired /
not-already-verified → flips to success → increments the deal's `claims_count`
→ calls `deduct_success_fee_or_record_arrears` for the KES 30 fee.

**Frozen rules**:
- `feeChargeStatus ∈ {charged, owed, unknown}` — strict 3-state
  (DECISIONS_LOG 2026-06-30). `unknown` = the fee step itself errored and must
  never collapse into `owed`.
- Redemption success is never rolled back by a fee-step failure.
- Does **not** call `guardian_check` (separately scoped, frozen decision).
- **D-003**: `unknown` creates a high-priority `fraud_review` task in
  `agent_tasks`; even a failed task write never blocks the shopper.
_Anchors: `20260702092952`, fixes `20260702093258`, `20260702094145`, `20260703235152`._

## Step 7 — Aftermath and lifecycle _(reconstructed numbering)_

- **Arrears** (`owed`): fee recorded against the merchant; new deal creation is
  gated at zero balance until they top up.
- **Fraud review** (`unknown`): admin reconciles against the
  `merchant_transactions` ledger and closes the task
  (SOP: `docs/skills/redemption-disputes.md`).
- **Trust metric**: recalculated from redemption behavior; pending claims are
  excluded. _Anchors: `20260703235350`, `20260704000722`._
- **Trial lifecycle**: Elite trial expiry → 7-day grace + agent task → auto-
  downgrade. _Anchors: `20260701110443`, `20260701111223`._
- **Card refunds/disputes** on top-ups: handled in the Stripe webhook with
  `payment_intent`-keyed idempotency (`docs/skills/payments-rails.md`).

## ⚠️ Reconciliation checklist (next Notion documentation session)

1. Confirm the original's step numbering for Steps 1–4 and 7 (only 5–6 are
   pinned by migrations).
2. Export any steps the original has that this repo cannot evidence (e.g. a
   guardian_check step, boost purchase, mall-operator reporting).
3. Update this header once reconciled and log it in `docs/maanta-decisions-log.md`.
