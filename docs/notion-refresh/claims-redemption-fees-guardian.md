# Claims, Redemption, Fees, and Guardian

**Status:** Canonical · **Last verified:** 2026-07-28  
**Repo:** `docs/skills/payments-rails.md`, `docs/skills/redemption-disputes.md`, `docs/skills/fee-reversals.md`, `docs/maanta-guardian-v1.md`

## Purpose

Single page for the money-and-trust loop: claim, verify, KES 30 fee, arrears, disputes, Guardian.

## Current reality

### Claim

- `claim_deal(user_id, deal_id)` creates a pending redemption + OTP.
- Ticket expiry = deal `expires_at` + 15 minutes.
- Snapshots `amount_kes` (YOU PAY) at claim for cashier display later.
- Under Clerk launch strategy: verified phone required or typed `phone_required` → `/verify-phone`.

### Redeem / verify

- Merchant/staff enters OTP → `verify_redemption`.
- Shopper experience is preserved whenever fee path is charged/owed/unknown (**verify-anyway**).
- Shopper pays merchant **cash off-app**; MAANTA never charges the shopper in-app.
- UI shows “Collect from shopper KES N” as **display-only**.

### Fees & wallet

- Success fee **KES 30** (frozen, all plans) via `deduct_success_fee_or_record_arrears`.
- Outcomes: `charged` | `owed` (arrears) | `unknown` (fraud task; shopper still succeeds).
- All merchant ledger movements through `record_merchant_ledger_entry` (idempotent by provider reference), with documented exceptions (`reverse_success_fee`, Node 0 opening credit path).
- Top-ups **settle arrears first**, then credit remainder.
- Zero-balance gate blocks **new deals**, not verification.

### Guardian v1 (verify-time)

Runs after OTP match, before money finalise:

| Recommendation | Effect |
|---|---|
| `clear` | Normal success + fee path |
| `flag` | Success + fee; suspicious event logged (verify-anyway preserved) |
| `soft_block` | Held (`flagged`); **no fee**; admin `admin_release_redemption` |
| `hard_block` | Declined (`failed`); **no fee**; admin appeal path can approve→complete with fee or uphold |

Thresholds live in `app_config.guardian_thresholds` with fail-safe defaults. Scope: Node 0 redemption-time checks — **not** a global risk engine.

### Disputes & reversals

- 72h admin dispute SLA (founder ruling).
- Uphold path can reverse success fee into wallet credit (`fee_reversal`) with **required decision note**; original fee row untouched.
- On-ground agents escalate; WhatsApp support.

## What is working

- SQL suites covering golden path, money path, arrears settle-first, Guardian, fee reversal, security hardening.
- Admin UI panels for hold/release/appeal/reverse.

## What is not yet ready

- Live processor proof (Stripe live / IntaSend).
- Calibrating Guardian thresholds from real BBS traffic (planned after live data).
- Fully staffed dispute desk beyond founder/admin.

## Risks

- Confusing YOU PAY (shopper→merchant) with KES 30 (merchant→MAANTA).
- Describing Guardian blocks as the default path — they are conservative exceptions.
- Manual balance edits (forbidden).

## Dependencies

- Wallet top-up rails for healthy merchant balances.
- Admin coverage within 72h.
- PostHog `guardian_outcome` events (env-dependent).

## Next actions

1. Keep frozen fee language identical across Notion + deck + mall drafts.
2. After first live week, review Guardian rates on PostHog and tune via `app_config` only.
3. Train agents on held vs declined language (non-accusatory at counter).

## Related pages

- Revenue & Business Model
- Product Flows
- Launch Readiness
- Observability and Production Verification
- Decisions Log
