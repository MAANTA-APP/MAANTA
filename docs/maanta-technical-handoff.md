# MAANTA — Technical Handoff

Audience: the software engineer taking the product to launch.

**Accuracy note (corrected 2026-08-02 — drift D60).** This document used to
promise that "where the doc says something does not exist yet, it genuinely does
not exist in the code", with no date attached. That guarantee outlived its
accuracy: by 2026-08-02 five of its claims were contradicted by the tree,
including a "public waitlist does not exist" that had been shipped three weeks
earlier. The corrections are inline below. Read the guarantee as scoped: this
doc is accurate **as of 2026-08-02**, and the standing authorities are
`docs/maanta-decisions-log.md` for intent, the migrations and RPCs for behaviour,
and `docs/maanta-launch-readiness-tracker.md` for gate status. If this file and
one of those disagree, they win — and the gap belongs in
`docs/maanta-drift-register.md`.

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

`.github/workflows/ci.yml` runs **five** blocking gates on every PR and push to
`main`, Node 20, with build-time placeholder env vars (the CI build never talks
to real services):

1. `lint` — `next lint`
2. `typecheck` — `tsc --noEmit`
3. `test` — vitest
4. `build` — `next build`, which itself chains `check:tokens`,
   `check:canonicals` and `check:forms`
5. **`db-tests`** — a separate job that boots Supabase, applies every migration
   and runs `maanta-app/supabase/tests/*.sql`

The `db-tests` job is the one this section used to omit (drift **D47**, and again
here as **D60**). It matters most for SQL work: **a change that only passes
`npm test` is not verified.** If you touch anything under
`supabase/migrations/`, the check is `make db-verify` from the repo root — which
mirrors that job locally — not vitest. CI also sets
`MAANTA_AUTH_STRATEGY=supabase`, so CI never exercises the Clerk path.

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
(**83** migrations from the v3 baseline forward, as of 2026-08-02 — count with
`ls maanta-app/supabase/migrations/*.sql | wc -l` rather than trusting this
number; it read 57 until it was corrected). Apply order is the filename
timestamp order. Key tables:

| Table | Role |
|---|---|
| `users` | App users; roles `customer`, `merchant_admin`, `merchant_staff`, `agent`, `admin`; self-role-escalation is blocked by trigger |
| `organizations` | Malls/brands/franchises |
| `merchants` | Shop profile: tier (`standard`/`elite`), status, `node` (default `BBS Mall`), what3words address, wallet `account_balance` (non-negative), `trust_metric` |
| `deals` | Deals with `success_fee` default 30.00, boost flag, flash type, claim caps |
| `redemptions` | OTP code, GPS + device capture, distance-from-shop, status (`pending`/`success`/`failed`/`flagged`), fraud flags |
| `merchant_transactions` | Wallet ledger: `topup`/`success_fee`/`boost_fee`/`subscription`/`refund`; providers include `intasend`, `daraja`, `manual`, `stripe`; `provider_reference` is unique (idempotent webhooks) |
| `leads` | **Agent-sourced merchant leads** with 48-hour lock — this is the on-ground sales pipeline, *not* the public waitlist. The two are still separate, but for a different reason than this row used to give (corrected 2026-08-02): the public waitlist **does** exist, it simply has no table — contacts live in a Resend audience and `POST /api/waitlist` stores nothing. See `maanta-waitlist-data-schema.md`. `leads` must not be reused for it: different audience, lifecycle and access rules |
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
- `record_merchant_ledger_entry` — the **app-layer** entry point for wallet
  ledger writes: every top-up and webhook reaches the ledger through it, via
  `recordMerchantTransaction`. It is **not** the only writer, and this line
  said "single entry point" until 2026-08-02 (drift **D58**, whose first pass
  corrected the same claim in `docs/maanta-project-overview.md` and missed this
  copy). Four more RPCs write `merchant_transactions` in-database by design,
  because they cannot call a `service_role`-only RPC from their own caller
  context: `deduct_success_fee_or_record_arrears` (the KES 30 fee, via
  `verify_redemption`), `purchase_boost`, `activate_merchant` (the Node 0
  opening credit) and `reverse_success_fee` (admin fee reversal). None of them
  edits a balance directly — each writes a ledger row. Full rule:
  `docs/skills/payments-rails.md`.
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
| `/` | Marketing homepage, one of 17 `page.tsx` files under the `(marketing)` route group (six core marketing pages, four legal routes, plus `/pricing`, `/faq`, `/help`, `/download`, `/waitlist`, `/merchants/join`, `/malls/bbs-mall`) |
| `/waitlist` | Segmented waitlist capture → `POST /api/waitlist` → Resend. Stateless: the route stores nothing |
| `/login` | Phone-OTP auth, with email sign-in also supported |
| `/deals`, `/deals/[id]` | Shopper browse + claim |
| `/merchant/onboard`, `/merchant/topup`, `/merchant/redeem` | Merchant journeys |
| `/admin` | Admin panel (merchant approval etc.) |
| `/api/redemptions`, `/api/redemptions/verify` | Claim + verify endpoints (RPC wrappers) |
| `/api/topup`, `/api/topup/stripe`, `/api/webhooks/*` | Payments |
| `/api/merchants/onboard`, `/api/admin/merchants/[id]/approve` | Merchant lifecycle |
| `/api/push/subscribe` | Web Push subscription storage |

## Known deferred / open items

1. **Public waitlist — built, not yet configured.** Corrected 2026-08-02: this
   item read "does not exist — no table, form, or API" long after it shipped.
   `/waitlist` (`src/app/(marketing)/waitlist/`) and `POST /api/waitlist` landed
   2026-07-10 and are recorded in the decisions log that day. There is still
   **no Supabase waitlist table** — deliberately: contacts live in a Resend
   audience and the route is a stateless proxy. What is actually outstanding is
   tracker **E7/E8** — Resend env config (`RESEND_API_KEY`,
   `RESEND_AUDIENCE_ID`, `RESEND_FROM_EMAIL`), and confirming the first
   production signup lands in the Waitlist segment. Spec:
   `maanta-waitlist-data-schema.md`.
2. **IntaSend credentials pending** — M-Pesa STK untestable until granted.
3. **FX provider** is a free keyless API — replace before live non-KES charges.
4. **Legal documents are unreviewed drafts, and they are live.** Corrected
   2026-08-02: this item said they "must not be linked from the live app yet",
   which stopped being true when the marketing site shipped. The four routes
   `/privacy`, `/terms`, `/merchant-terms` and `/cookies` render
   `src/content/legal/*.md` and are linked from every marketing footer
   (`src/lib/marketing/nav.ts`). They are protected instead by a `noindex,
   nofollow` meta tag on each page while `DEMO_MODE` holds, a visible
   draft banner, and exclusion from `sitemap.xml` — a founder ruling on
   2026-08-01 deliberately made them publicly crawlable but unindexed, because
   app-store and payment-provider reviews require a fetchable privacy policy.
   Still not lawyer-reviewed and still carrying entity placeholders; tracker
   **O5** is the gate. `maanta-app/legal/` holds older working drafts, not what
   renders.
5. **Cross-border data**: Supabase in `eu-west-1` vs. Kenya DPA 2019 —
   needs a lawful transfer basis or region decision.
6. ~~**Frozen UI** pending preview review.~~ **Done** — the frozen wireframe UI
   was reviewed and merged 2026-07-09 (PR #11, tracker E1), and the frozen rules
   are now a CI ratchet in `src/lib/__tests__/frozen-ui-rules.test.ts`. What is
   still owed is device-level QA (tracker E2–E4).

## Test suite

Two layers, both in CI:

**Vitest** (`npm test`) covers the merchant ledger, currency validation/FX
handling, pricing, the Stripe webhook route, and the static frozen-UI /
feature-gap ratchets (`src/lib/__tests__/`,
`src/app/api/webhooks/stripe/__tests__/`). **70 files / 533 tests green on
`main`, run 2026-08-02.** The waitlist API is built; its coverage lives with the
marketing guards under `src/lib/__tests__/`.

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
