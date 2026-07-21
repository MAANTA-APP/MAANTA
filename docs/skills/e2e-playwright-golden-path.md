# Skill — Browser-visible golden-path E2E (Playwright)

**Status:** suite authored and wired; **red until a live TEST Supabase + Clerk
instance is provisioned and seeded** (Definition of Done §8 defers the live env).
**Owner surface:** `maanta-app`. **Added:** 2026-07-21.

## What this is

The last missing piece of Definition of Done §8. The RPC-level golden path, the
SQL money-path suites, and the frozen-UI static ratchets already run in CI; this
proves the same invariants **through the rendered browser** against the **real
app, real Supabase (schema/triggers/RLS), real Clerk**. No shim.

Two specs, named for the behaviour they prove:

- `e2e/golden-path.spec.ts` — *"golden path: shopper claims and merchant redeems
  a deal"*
- `e2e/wallet-arrears.spec.ts` — *"wallet: top-up settles arrears first, then
  credits remainder"*

Scope is the golden path only. No search / notifications / boosts / multi-currency.
The tests **describe behaviour that exists on `main`** and never change product UI.

## Files

| Path | Role |
|---|---|
| `maanta-app/playwright.config.ts` | timeouts (90s test / 10s expect), CI retries×2, serial workers, `webServer` boots `next start` unless `E2E_BASE_URL` is set |
| `maanta-app/e2e/global-setup.ts` | `clerkSetup()` (Testing Token) + Clerk↔Supabase user linking |
| `maanta-app/e2e/fixtures/accounts.ts` | seeded accounts/deal/fee, all env-overridable |
| `maanta-app/e2e/fixtures/clerk-auth.ts` | real `<SignIn>` email-OTP sign-in via `@clerk/testing` |
| `maanta-app/e2e/fixtures/supabase.ts` | service-role **arrange/assert**: reset wallets, drive the top-up RPC, read ledger |
| `maanta-app/e2e/fixtures/link-clerk.ts` | stamp `clerk_user_id` onto seeded rows (Clerk Backend API lookup) |
| `maanta-app/e2e/fixtures/selectors.ts` | component-vocabulary selectors (DealTile, ClaimedCode, FeeDisclosure, WalletBalance, InlineAlert…) |
| `maanta-app/e2e/fixtures/locked-ui.ts` | computed-style checks for the locked-UI subset |
| `maanta-app/e2e/README.md` | full test design + rule→assertion map + CI notes |
| `maanta-app/e2e/.env.e2e.example` | required env vars |
| `.github/workflows/e2e.yml` | `workflow_dispatch`, gated on `vars.E2E_ENABLED == 'true'` |

## Rules the suite guards

1. **YOU PAY consistency** — identical amount on tile, deal detail, claimed code,
   extras already included (`golden-path`).
2. **Fee-before-charge** — code entry only *resolves* (preflight, no charge);
   `FeeDisclosure` shows the exact KES 30 before the single `Confirm redemption —
   KES 30 fee` action; the keypad exposes no one-tap verify+charge (`golden-path`).
3. **Settle-first arrears** — arrears 60 + top-up 100 → balance 40, arrears 0;
   ledger reconciles to both balance (running "Bal") and arrears (Σ
   arrears-affecting rows); the +100 and −60 rows are browser-visible
   (`wallet-arrears`).
4. **Locked-UI subset** — ≤1 amber action/screen, money is ink (#111) not amber,
   alert body text ink, states carried by a word+icon (both specs, via
   `fixtures/locked-ui.ts`).

Also cross-checked: success `ReferenceId` == `verify` `redemptionId` == the
wallet's `success_fee` ledger row; balance drops by exactly the fee.

## The one real environment gap — Clerk↔Supabase linking

The Node 0 seed predates Clerk, so seeded `public.users` rows have
`clerk_user_id = NULL` (see `clerk-auth.md` → "Legacy user linking"). Clerk
sign-in resolves identity by `clerk_user_id`; without linking, a signed-in
merchant provisions a *fresh* row and does **not** own the seeded deal/wallet, so
the golden path can't line up. `global-setup.ts` closes this automatically when
`CLERK_SECRET_KEY` + `SUPABASE_SERVICE_ROLE_KEY` are present: it looks up each
test user by email via the Clerk Backend API and stamps `clerk_user_id` onto the
matching seeded row. Provisioning the Clerk **test** users (once per instance) is
a manual/bootstrap step.

## To turn it green (runbook)

1. Provision a **TEST** Clerk instance; create test users for the shopper + both
   merchants (use `+clerk_test` addresses so OTP is the fixed `424242`).
2. Point a **TEST** Supabase project at that Clerk instance (third-party auth),
   apply `supabase/migrations/*` then `supabase/seed/node0_rehearsal_seed.sql`.
3. Set repo **secrets** (`E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`,
   `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_CLERK_PUBLISHABLE_KEY`,
   `E2E_CLERK_SECRET_KEY`, `E2E_OTP_CODE`) and **vars** (`E2E_ENABLED=true`,
   `E2E_*_EMAIL`, optional `E2E_BASE_URL`).
4. Run the `E2E (Playwright golden path)` workflow (`workflow_dispatch`), or
   locally: `cp e2e/.env.e2e.example .env.e2e && npm run test:e2e`.
5. Once green and stable, flip `e2e.yml`'s `on:` to `pull_request` to gate PRs.

## Guardrails honoured

- No product behaviour or UI changed. Selectors use roles/structure/stable copy;
  **no `data-testid`s were added** (that would be a separate, reviewed change —
  and if added, only `fixtures/selectors.ts` would change, not the specs).
- Service-role Supabase is used only for test arrange/assert, never by the app.
- The top-up is driven through the real `record_merchant_ledger_entry` RPC (the
  webhook's own settle-first path), not a re-implementation.
- Deps added: `@playwright/test`, `@clerk/testing`, `dotenv` (devDeps; lockfile
  updated). `typecheck`, `lint`, and the vitest suite still pass.
