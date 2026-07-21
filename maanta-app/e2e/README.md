# MAANTA — browser-visible golden-path Playwright suite

This directory holds the end-to-end tests that prove the MAANTA golden path works
through a **real browser**, against the **real app**, **real Supabase** (schema,
triggers, RLS) and **real Clerk** auth. It is the missing piece of Definition of
Done §8: the RPC-level golden path and SQL money-path tests already pass in CI;
this suite exercises the same invariants through the rendered UI.

Scope is the **golden path only** — shopper claims a live deal, merchant redeems
the code, wallet reconciles. No search, notifications, boosts, or multi-currency.
The tests **describe behaviour that already exists on `main`**; they never change
product behaviour or UI. Where a locked rule looks at risk, the test asserts the
rule and fails loudly rather than accommodating a regression.

---

## 1. Test design (written before the code)

### Seeded fixtures the tests rely on

From `supabase/seed/node0_rehearsal_seed.sql` (Node 0 · BBS Mall):

| Thing | Value | Fixed id |
|---|---|---|
| Shopper login | `aragagency+shopper@gmail.com` | user `b…005` |
| Merchant (Nuur, Elite, funded) | `aragagency+nuur@gmail.com` | merchant `c…001` |
| Merchant (Bilan, low balance) | `aragagency+bilan@gmail.com` | merchant `c…002` |
| Golden deal — Nuur "20% off abayas" | `price_kes 2400`, `compare_at 3000`, no extras → **YOU PAY KES 2,400** | deal `d…001` |
| Bilan deal — "KES 300 off gift sets" | `price_kes 1950` | deal `d…003` |
| Success fee | **KES 30** flat (frozen) | `app_config` |
| Live seeded pending code on the golden deal | `431977` | redemption `e…004` |

Account emails, the OTP code, and the deal/merchant ids are all overridable by
env var (`e2e/fixtures/accounts.ts`) so the same specs run against any seeded
Clerk test environment without edits.

### Scenario A — `golden path: shopper claims and merchant redeems a deal`
`golden-path.spec.ts`

**Pre-conditions**
- Seed applied; golden deal live and claimable (the spec's `beforeAll` resets
  `is_active`, `expires_at`, `claims_count` on the golden deal via the service
  role so re-runs never exhaust `max_claims`).
- Nuur's wallet reset to a known positive balance ≥ fee, arrears 0.
- Shopper and Nuur Clerk test users exist and are linked to the seeded
  `public.users` rows (see §3, "Linking").

**Steps**
1. Shopper context → visit `/demo`, confirm the shopper login is documented, open
   the feed.
2. Read the **YOU PAY** amount on the deal **tile** (`DealCard`).
3. Open the deal **detail**; read YOU PAY again.
4. Claim the deal (sticky "Claim deal" → bottom-sheet "Confirm").
5. Land on the **claimed-code** page (`ClaimedCode`); read YOU PAY and the code.
6. Merchant context → visit `/demo`, sign in as Nuur, open `/merchant/redeem`.
7. Type the shopper's 6 digits on the `NumericKeypad`. Entry **resolves** the code
   (preflight) and never charges.
8. On the `FeeDisclosure` screen, read the exact fee **before** confirming.
9. Click "Confirm redemption — KES 30 fee" (the only control that charges).
10. On the `RedemptionResult` success takeover, read the `ReferenceId` and balance.
11. Open `/merchant/wallet`; read the top ledger row and `WalletBalance`.

**Assertions → rules**
- YOU PAY is identical on tile, detail, claimed code, and already includes extras
  → **Rule 1 (YOU PAY consistency)**.
- The keypad screen exposes **no** verify/charge control; the fee is visible before
  the single charging action, whose label carries the fee → **Rule 2
  (fee-before-charge)**.
- Success `ReferenceId` == the `verify` response `redemptionId`; the wallet's top
  `success_fee` row references the same id (first 8 chars, upper-cased) → matching
  ReferenceId on takeover **and** ledger.
- Success `newBalance` == balanceBefore − 30; `WalletBalance` and the row's "Bal"
  show that number → wallet balance updated by the fee.
- Locked-UI subset on the claimed-code page and the success takeover: ≤1 amber
  action, money not amber, states carry a word+icon → **Rule 4**.

**Out of scope for this test:** settle-first arrears (Scenario B); admin/dispute
review; push notifications.

### Scenario B — `wallet: top-up settles arrears first, then credits remainder`
`wallet-arrears.spec.ts`

**Pre-conditions**
- Bilan reset to a deterministic arrears state via the service role:
  `account_balance = 0`, `outstanding_arrears = 60`, prior `E2E-…` ledger rows
  cleaned up.

**Steps**
1. Arrange the arrears state (service role).
2. Apply a **KES 100 top-up** through the exact production money-path RPC
   (`record_merchant_ledger_entry`, `transaction_type='topup'`) — the same call
   the IntaSend/Stripe webhooks make. (A real M-Pesa PIN entry is not
   deterministic in CI; the webhook RPC *is* the settle-first logic under test.)
3. Read the merchant row back (service role).
4. Merchant context → sign in as Bilan, open `/merchant/wallet`.

**Assertions → rules**
- Balance after = **40**, not 100 → the remainder (100 − 60) credited to balance;
  arrears settled first → **Rule 3 (settle-first)**.
- `outstanding_arrears = 0`; Σ over arrears-affecting ledger rows == 0 → ledger
  reconciles to arrears.
- Browser `WalletBalance` shows KES 40; the arrears `InlineAlert` is gone; a
  "Top-up" **+KES 100** row and an **arrears-settlement −KES 60** row are present;
  the top row's "Bal" equals the balance → ledger reconciles to balance, and the
  settle-first split is browser-visible → **Rule 3**.
- Locked-UI subset on the wallet page: ≤1 amber action (the single "Top up
  wallet"), money (balance) not amber, alert body text ink → **Rule 4**.

**Out of scope for this test:** the redeem flow (Scenario A); dispute routing;
provider webhook signature verification (asserted at the API-test layer, not here).

---

## 2. Rule → assertion map (quick reference)

| Rule | Where asserted |
|---|---|
| 1 · YOU PAY consistency (tile = detail = claimed, extras included) | `golden-path.spec.ts` |
| 2 · Fee-before-charge (exact fee before confirm; no one-tap verify+charge) | `golden-path.spec.ts` |
| 3 · Settle-first arrears (settle first, credit remainder, ledger reconciles) | `wallet-arrears.spec.ts` |
| 4 · Locked UI subset (≤1 amber action, money not amber, error text ink, states carry word+icon) | both specs, via `fixtures/locked-ui.ts` |

Each spec file repeats its own **Rule check** block in a header comment, naming
the rules it asserts and the ones it intentionally leaves out.

---

## 3. CI considerations

### Required env vars
Set as CI secrets; `e2e/.env.e2e.example` documents them.

| Var | Purpose |
|---|---|
| `E2E_BASE_URL` | URL of the deployed test app (e.g. a Vercel preview). If unset, the config boots `next start` locally on `:3000`. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | test **arrange/assert** only — reset wallets, drive the top-up RPC, read balances. Never used by the app under test. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk. Must be a **test instance**; the secret key is used both by the app and by `@clerk/testing`'s Testing Token + the "linking" step below. |
| `E2E_SHOPPER_EMAIL`, `E2E_MERCHANT_NUUR_EMAIL`, `E2E_MERCHANT_BILAN_EMAIL` | override seeded logins with Clerk **test** addresses. |
| `E2E_OTP_CODE` | fixed email OTP for the Clerk test users (Clerk's `+clerk_test` addresses accept `424242`). Default `424242`. |

### Making `/demo` reachable and seeded before the run
1. Deploy the branch to a test environment wired to the **test** Supabase + Clerk
   instances (or let the config `webServer` boot `next start` against them).
2. Apply `supabase/migrations/*` then `supabase/seed/node0_rehearsal_seed.sql` to
   the test database.
3. **Linking (the one real gap).** The seed writes `public.users` rows with
   `clerk_user_id = NULL` (it predates Clerk — see `docs/skills/clerk-auth.md`
   "Legacy user linking"). Clerk sign-in resolves identity by `clerk_user_id`, so
   each seeded row must be linked to its Clerk **test** user, or the merchant
   won't own the seeded deal/wallet. `globalSetup` does this automatically when
   `CLERK_SECRET_KEY` + `SUPABASE_SERVICE_ROLE_KEY` are present: it looks up each
   test user by email via the Clerk Backend API and sets `clerk_user_id` on the
   matching seeded row. Provisioning the Clerk test users themselves (once per
   instance) is a manual/CI-bootstrap step.
4. `globalSetup` also calls `@clerk/testing`'s `clerkSetup()` to mint a Testing
   Token so Clerk's bot protection doesn't block headless sign-in.

### Timeouts & retries (real networked app)
- `expect` timeout **10s**, per-test timeout **90s** (Clerk sign-in + two RPC
  round-trips + STK-free redeem fit inside this comfortably).
- `retries: 2` on CI, `0` locally — absorbs Clerk/Supabase cold starts without
  hiding a real regression across all three attempts.
- `workers: 1` on CI — the specs mutate shared seeded merchants (Nuur/Bilan) via
  the service role; serial execution keeps the arrange steps deterministic.
- `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`, `video:
  'retain-on-failure'` for debuggable CI artifacts.

### Wiring into the pipeline
`.github/workflows/e2e.yml` is a **separate, `workflow_dispatch` + optional**
job, not part of the required `ci.yml` gate, because it needs live Supabase +
Clerk test credentials that the unit/db jobs don't. Flip it to `pull_request`
once those secrets exist in the repo. See `docs/skills/e2e-playwright-golden-path.md`.

---

## 4. Running locally

```bash
cd maanta-app
npm ci
npx playwright install --with-deps chromium   # browsers only; container already has Chromium
cp e2e/.env.e2e.example .env.e2e               # fill in test Supabase + Clerk
npm run test:e2e            # boots `next start` unless E2E_BASE_URL is set
npm run test:e2e -- --ui    # watch mode
```

The suite is **red until a seeded Supabase + Clerk test environment exists** — by
design (Definition of Done §8 defers the live env). Nothing here is a shim; every
selector and assertion targets the real rendered product.
