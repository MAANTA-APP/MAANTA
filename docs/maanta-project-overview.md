# MAANTA project overview

Last updated: 2026-07-09 · Owner: founder · Repo mirror of the Notion overview.

## What MAANTA is

MAANTA is an in-mall deals platform. Merchants publish time-limited deals;
shoppers claim a deal in the app and receive an OTP redemption ticket; the
merchant verifies the code at the counter and MAANTA charges a **KES 30 success
fee** from the merchant's prepaid wallet. Launch is at **BBS Mall, Nairobi
(Node 0)**, which stays the sole proving ground until product-market fit is clear.

## Actors and surfaces

| Actor | Surface | Key actions |
|---|---|---|
| Shopper | `/`, `/deals`, `/deals/[id]` | Browse deals → claim → get OTP ticket → redeem in person |
| Merchant | `/merchant/onboard`, `/merchant/topup`, `/merchant/redeem` | Onboard → top up wallet → create deals → verify redemption codes |
| Admin | `/admin` | Approve merchants, fraud/dispute review tasks |
| Public/waitlist | External site (not in this repo) | Segmented waitlist signup: shopper / merchant / mall operator |

## Commercial model

- KES 30 success fee per verified redemption, charged on all plans at the point
  of merchant verification. If the wallet can't cover it, the fee is recorded as
  **arrears** rather than blocking the shopper's redemption (verify-anyway).
- Prepaid merchant wallet, topped up via Stripe Checkout (card, multi-currency:
  KES/USD/EUR/GBP with live FX conversion to KES) or M-Pesa STK via IntaSend
  (KES). Stripe is in sandbox during testing; IntaSend availability is not assumed.
- **Elite tier**: 30-day free trial → 7-day grace period → auto-downgrade to
  Standard if not converted. Paid Elite: KES 3,500/month (price review Oct 2026).
- Zero-balance merchants cannot create new deals.

## Technical state (as of this update)

- **Stack**: Next.js App Router + Supabase (Postgres, Auth, RLS, storage),
  deployed target Vercel-style; Supabase project currently in AWS `eu-west-1`.
- **Money movements** all flow through the `record_merchant_ledger_entry` RPC —
  atomic, idempotent by provider reference. Redemption verification is the
  self-authorizing `verify_redemption` RPC. See `docs/skills/payments-rails.md`
  and `docs/skills/redemption-disputes.md`.
- **Auth**: phone and email sign-in; role self-escalation blocked at DB level.
- **Notifications**: Web Push to merchants (top-up received, trial expiry tasks).
- **Testing/CI**: vitest suite + GitHub Actions.
- **Legal**: draft ToS, privacy, refund/wallet, KYC/AML docs in
  `maanta-app/legal/` — internal drafts only, pending lawyer review and Kenya
  incorporation (November 2026 Nairobi trip decision).

## What is NOT in this repo

- The public waitlist site and its three segmented landing paths.
- The email platform, segments, and automations.
- Notion operating docs (this `docs/` tree mirrors approved exports).

## Current phase

Pre-launch. Priorities: keep launch-critical flows stable, build the segmented
waitlist, prepare the one-month agency campaign, and keep documentation portable
per `docs/maanta-claude-operating-system.md`.
