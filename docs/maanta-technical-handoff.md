# MAANTA — Technical Handoff

Audience: the software engineer taking the product to launch. Everything
here is grounded in the repository state as of this handoff; where the doc
says something does not exist yet, it genuinely does not exist in the code.

## Repository

- **Repo:** `maanta-app/maanta` on GitHub. The application lives in the
  `maanta-app/` subdirectory; CI and docs live at the repo root.
- **Default branch:** `main`. Feature work goes through PRs into `main`;
  CI must pass before merge.
- **App stack:** Next.js 14.2 (App Router, TypeScript), Tailwind CSS,
  Supabase (`@supabase/supabase-js` + `@supabase/ssr`), Stripe SDK,
  `web-push` for notifications, Vitest for tests.

### Commands (run inside `maanta-app/`)

```bash
npm ci            # install
npm run dev       # local dev server (turbo)
npm run lint      # eslint
npm run typecheck # tsc --noEmit
npm run test      # vitest run
npm run build     # production build
```

### CI

`.github/workflows/ci.yml` runs lint → typecheck → test → build on every PR
and push to `main`, Node 20, with build-time placeholder env vars (the CI
build never talks to real services).

## Environments and configuration

Environment variables the app reads:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (browser + server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service client (`src/lib/supabase/service.ts`) — never exposed to the browser |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ENV` | Stripe top-ups. `STRIPE_ENV` must be explicitly `"live"` to accept a live key; `src/lib/stripe.ts` refuses mismatched key/env combinations to prevent accidental real charges |
| `INTASEND_API_KEY`, `INTASEND_SECRET`, `INTASEND_WEBHOOK_SECRET`, `INTASEND_ENV` | IntaSend M-Pesa STK push — **credentials not yet available**; code degrades gracefully when unset |
| `W3W_API_KEY` | what3words geofencing on redemption |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push notifications |
| `NEXT_PUBLIC_APP_URL` | Absolute URL for redirects/links |

Deployment target is Vercel; Supabase project runs in AWS `eu-west-1`
(Ireland) — note the Kenya DPA 2019 cross-border transfer question flagged
in `maanta-app/legal/README.md`.

## Database (Supabase / Postgres)

Schema is fully version-controlled in `maanta-app/supabase/migrations/`
(52 migrations from the v3 baseline forward). Apply order is the filename
timestamp order. Key tables:

| Table | Role |
|---|---|
| `users` | App users; roles `customer`, `merchant_admin`, `merchant_staff`, `agent`, `admin`; self-role-escalation is blocked by trigger |
| `organizations` | Malls/brands/franchises |
| `merchants` | Shop profile: tier (`standard`/`elite`), status, `node` (default `BBS Mall`), what3words address, wallet `account_balance` (non-negative), `trust_metric` |
| `deals` | Deals with `success_fee` default 30.00, boost flag, flash type, claim caps |
| `redemptions` | OTP code, GPS + device capture, distance-from-shop, status (`pending`/`success`/`failed`/`flagged`), fraud flags |
| `merchant_transactions` | Wallet ledger: `topup`/`success_fee`/`boost_fee`/`subscription`/`refund`; providers include `intasend`, `daraja`, `manual`, `stripe`; `provider_reference` is unique (idempotent webhooks) |
| `leads` | **Agent-sourced merchant leads** with 48-hour lock — this is the on-ground sales pipeline, *not* the public waitlist (which doesn't exist yet; see `maanta-waitlist-data-schema.md`) |
| `fraud_events`, `audit_logs`, `payment_webhook_failures` | Fraud review, audit trail, webhook failure log |
| `agents`, `agent_tasks`, `kpi_counters`, `boost_flags`, `tier_flags`, `app_config`, `reporting_aggregates`, `archive_history`, `merchant_favourites` | Supporting tables |

### Business logic lives in RPCs, not routes

The money-touching and state-machine logic is implemented as atomic,
self-authorizing Postgres functions; API routes are thin wrappers. Do not
reimplement this logic in TypeScript:

- `claim_deal` / `verify_redemption` — the core loop. `verify_redemption`
  locks the redemption row, flips it to success, increments claim count,
  and debits the KES 30 success fee (or records **arrears** if the wallet
  can't cover it, returning `fee_charge_status: charged | owed | unknown`).
  An `unknown` fee status automatically opens a fraud-review task.
- `onboard_merchant` / `activate_merchant` — merchant lifecycle, with agent
  attribution.
- `record_merchant_ledger_entry` — single entry point for wallet ledger
  writes.
- Hardening migrations pin `search_path`, revoke anon execute on all
  functions, and lock down grants — preserve this pattern in new RPCs.

### Merchant lifecycle rules already enforced in the DB

- 30-day Elite trial with a grace period, and a phase-2 expiry handler.
- Zero-balance gate: merchants with an empty wallet (or arrears) have deals
  gated.
- Trust metric recalculation excludes pending claims.

## Payments

### Stripe (working, sandbox)

- Top-up flow: `src/app/api/topup/stripe/route.ts` → Stripe Checkout →
  webhook `src/app/api/webhooks/stripe/route.ts` credits the wallet via
  the ledger RPC. Webhook signature verified with `STRIPE_WEBHOOK_SECRET`;
  webhook processing failures are recorded in `payment_webhook_failures`.
- Multi-currency: KES, USD, EUR, GBP accepted; converted to KES with a live
  FX rate (open.er-api.com, 6-hour cache, 5s timeout, hardcoded fallback
  rates). **Before charging real non-KES money**, replace the keyless FX
  provider with a paid/SLA-backed one and disclose the rate source in
  `legal/refund-and-wallet-policy.md` (noted inline in `src/lib/currency.ts`).
- Top-up amounts are validated server-side (bounds in `src/lib/currency.ts`).

### M-Pesa STK (launch requirement, blocked on credentials)

- `src/lib/intasend.ts` implements STK push via IntaSend
  (sandbox/live base URL switched by `INTASEND_ENV`), and
  `src/app/api/webhooks/intasend/route.ts` handles the callback.
- **IntaSend API access has not been granted yet.** The code returns null
  and logs when keys are unset. Launch gating: obtain credentials, run the
  sandbox flow end-to-end, then a live KES 10 top-up test.
- The processor decision is not final — see
  `maanta-app/legal/payment-processor-comparison.md` for the
  Stripe/IntaSend vs. Paystack/Flutterwave/Pesapal/DPO/Cellulant analysis
  feeding the November decision. If the provider changes, the STK client is
  isolated in `src/lib/intasend.ts` and the webhook route.

## Application surfaces

| Route | What it is |
|---|---|
| `/` | Minimal homepage (browse deals / sign in / list your shop) — **no waitlist capture yet** |
| `/login` | Phone-OTP auth, with email sign-in also supported |
| `/deals`, `/deals/[id]` | Shopper browse + claim |
| `/merchant/onboard`, `/merchant/topup`, `/merchant/redeem` | Merchant journeys |
| `/admin` | Admin panel (merchant approval etc.) |
| `/api/redemptions`, `/api/redemptions/verify` | Claim + verify endpoints (RPC wrappers) |
| `/api/topup`, `/api/topup/stripe`, `/api/webhooks/*` | Payments |
| `/api/merchants/onboard`, `/api/admin/merchants/[id]/approve` | Merchant lifecycle |
| `/api/push/subscribe` | Web Push subscription storage |

## Known deferred / open items

1. **Public waitlist does not exist** — no table, form, or API. Spec is in
   `maanta-waitlist-data-schema.md`; this is launch-gating for marketing.
2. **IntaSend credentials pending** — M-Pesa STK untestable until granted.
3. **FX provider** is a free keyless API — replace before live non-KES charges.
4. **Legal docs are drafts** (`maanta-app/legal/`) — not lawyer-reviewed,
   entity placeholders unfilled, must not be linked from the live app yet.
5. **Cross-border data**: Supabase in `eu-west-1` vs. Kenya DPA 2019 —
   needs a lawful transfer basis or region decision.
6. **Frozen UI**: the current UI is intentionally minimal/frozen pending
   preview review; merge the reviewed UI work before launch polish.

## Test suite

Two layers, both in CI:

**Vitest** (`npm test`) covers the merchant ledger, currency validation/FX
handling, pricing, the Stripe webhook route, and the static frozen-UI /
feature-gap ratchets (`src/lib/__tests__/`,
`src/app/api/webhooks/stripe/__tests__/`). Extend it for the waitlist API
when built.

**pgTAP SQL suites** (`maanta-app/supabase/tests/*.sql`, run in the CI
`db-tests` job against a live Postgres) cover the money path and Guardian:

- `golden_path_test.sql`
- `verify_redemption_money_path_test.sql`
- `topup_settles_arrears_test.sql`
- `success_fee_reference_link_test.sql`
- `node0_opening_credit_test.sql`
- `security_hardening_test.sql`
- `guardian_v1_test.sql`
- `fee_reversal_test.sql`
