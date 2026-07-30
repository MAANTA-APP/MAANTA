# Ops — Browser golden-path + role-access E2E (Playwright, tracker E14 / PR #35)

**Status:** suite authored in repo (`maanta-app/e2e/golden-path.spec.ts`,
`maanta-app/e2e/role-access.spec.ts`, `maanta-app/e2e/helpers/roles.ts`,
`maanta-app/playwright.config.ts`, opt-in `.github/workflows/e2e.yml`). It is
**inert until a human provisions a live test env** — the specs self-skip and the
CI job is gated off — so it is honest coverage when enabled and never a false
green before then.

Three spec files:

- **`golden-path.spec.ts`** — the money path: shopper feed/browse/map → claim →
  OTP ticket → merchant verify → fee disclosure → "Collect from shopper", plus
  an invalid-code negative. Needs the shopper + owner storage states.
- **`role-access.spec.ts`** — permission coverage across the personas: merchant
  bottom-nav visibility per staff permission, permission notices on deep links,
  and route-guard negatives (agent/shopper/staff cannot reach `/admin`,
  `/founder`). Each persona's block skips independently.
- **`design-truth-smoke.spec.ts`** — generated from the `smoke` blocks in
  `maanta-app/design/current-reality/frames.json`: for each contracted frame,
  the intended role lands on the route, the page shows the promised heading,
  denied roles are bounced, and legacy redirects arrive at the documented
  target. Adding coverage means editing `frames.json`, not this spec.

## Why it can't just run in CI today

The golden path needs a **deployed app** plus **Clerk-authenticated** shopper
and merchant sessions against a **live Supabase** with the rehearsal seed. Clerk
browser sign-in can't be scripted headlessly without test credentials, and there
is no dedicated test Supabase/Clerk env yet (tracker E14, decisions log). This is
the human/ops gate.

## What Claude Code did (repo)

- `e2e/golden-path.spec.ts` — shopper feed/browse/map, claim→ticket, merchant
  verify (fee disclosed → **Collect from shopper** (P12) + **Redeemed**), and a
  negative invalid-code case. Self-skips unless the env below is set.
- `e2e/role-access.spec.ts` — per-persona permission and route-guard coverage.
- `e2e/helpers/roles.ts` — reusable Clerk-session helpers: `asRole(browser,
  role, fn)`, `expectMerchantNav(page, tabs)`, `claimFirstDeal`, `enterCode`,
  plus `roleAvailable`/`skipReason` so an unprovisioned role skips with a
  message naming the exact env var to set.
- `playwright.config.ts` — `baseURL` from `E2E_BASE_URL`, GitHub reporter, CI
  retries.
- `.github/workflows/e2e.yml` — opt-in job gated on the `E2E_BASE_URL` repo
  variable; installs Playwright on demand (kept out of `package.json` so the
  main `npm ci` lockfile stays valid).
- `npm run test:e2e` script.

## Role storage states (fixtures)

One Playwright `storageState` per persona, supplied by env var. Only the first
two are required; the rest each unlock one more block of `role-access.spec.ts`.

| Env var | Persona | Seeded account must satisfy |
|---|---|---|
| `E2E_SHOPPER_STORAGE` **(required)** | Shopper | `users.role = 'customer'`, verified phone, can claim |
| `E2E_MERCHANT_STORAGE` **(required)** | Merchant owner | `merchants.user_id` = this user (owner holds all four permissions). `E2E_OWNER_STORAGE` is accepted as an alias. |
| `E2E_STAFF_VERIFY_STORAGE` | Verify-only staff | `merchant_staff`: `can_verify = true`, `can_deals`/`can_topup`/`can_purchase` = false |
| `E2E_STAFF_DEALS_STORAGE` | Staff + deals | `merchant_staff`: `can_verify`, `can_deals` = true; `can_topup`, `can_purchase` = false |
| `E2E_AGENT_STORAGE` | Field agent | `users.role = 'agent'` with an active `agents` row |
| `E2E_ADMIN_STORAGE` | Admin / founder | `users.role = 'admin'` (also serves `/founder` today) |

The two staff personas need **merchant_staff rows against the same test
merchant as the owner account**, each linked to its own Clerk test user (the
row links on first sign-in by `user_id`, or by matching `phone`). The rehearsal
seeds in `docs/ops/test-accounts.md` cover shopper / owner / agent / admin; the
two staff rows are the only new fixtures this suite adds — create them with the
owner's own "Add staff" flow against the test merchant, then capture each
session.

**No secrets live in the repo.** Storage states are CI environment secrets or
local gitignored files; the specs read paths or inline JSON, never both hardcoded.

## ⚠️ This suite charges real money — use a dedicated non-prod env

Every successful run **claims and verifies a real redemption**, which writes
ledger/audit rows and debits the **KES 30 success fee** from the merchant
wallet. Static storage-state sessions + the rehearsal seed mean this state
**accumulates across CI runs**. Therefore:

- **Never point `E2E_BASE_URL` at production** (`axrrslqssmbngbataejg` / the
  Vercel prod URL). Use a **dedicated non-production Supabase + Clerk project**
  with **test-only** merchant/deal records.
- Have an **audited reset** between runs (re-seed / truncate the test
  redemptions + reset the test merchant wallet & arrears) so fees and audit rows
  don't pile up. The `if` gate + `retries: 0` reduce, but don't eliminate, this.

## Human steps to enable

1. **Provision a dedicated test env:** a deployed MAANTA build pointed at a
   **non-production** Supabase project (with the rehearsal seed) and a Clerk
   test instance with a shopper + a verifying-merchant test user. Do **not**
   reuse production for this.
2. **Capture storage states** (signed-in sessions) locally:
   ```bash
   cd maanta-app
   npm i -D @playwright/test && npx playwright install chromium
   # sign each role in once and save its session:
   npx playwright codegen --save-storage=shopper.json  <app-url>/login
   npx playwright codegen --save-storage=merchant.json <app-url>/login
   ```
3. **Create a protected Environment:** repo Settings → Environments → new
   environment `e2e`, with **required reviewers**. The workflow binds the
   secret-bearing job to this environment, so a run needs approval and the
   storage secrets aren't exposed to unapproved runs.
4. **Wire CI:** repo Settings → Secrets and variables → Actions:
   - Variable `E2E_BASE_URL = https://<deployed NON-PROD app>`
   - Optional variable `E2E_ALLOWED_HOST` — a substring the target host must
     contain (e.g. `staging`); the workflow fails closed if `E2E_BASE_URL`
     doesn't match it. The job **always** refuses a `maanta.app` (production)
     target regardless, since the suite charges real KES 30 fees.
   - On the **`e2e` environment**, secrets `E2E_SHOPPER_STORAGE`,
     `E2E_MERCHANT_STORAGE` = the JSON contents (or adapt the spec to read file
     paths), plus any of the optional role secrets in the fixtures table above.
5. **Trigger posture:** the workflow runs **post-merge on `main`** and on-demand
   via **`workflow_dispatch`** — never on `pull_request`, and the job only runs
   when `github.ref == refs/heads/main`, so a manual dispatch can't run
   arbitrary branch code with the E2E secrets. Flip tracker E14 → done once the
   env is stable.

## Local run

```bash
cd maanta-app
npm i -D @playwright/test && npx playwright install chromium
E2E_BASE_URL=https://<app> \
E2E_SHOPPER_STORAGE=./shopper.json \
E2E_MERCHANT_STORAGE=./merchant.json \
npm run test:e2e
```

Selectors match the current frozen UI (redeem keypad "Confirm redemption —
KES 30 fee", success "Redeemed" + "Collect from shopper", failure "Code not
valid" / "No fee was charged"); update them here if that copy changes.

The bottom bars are addressed by accessible name —
`getByRole("navigation", { name: "Merchant" | "Shopper" })` — so tab assertions
survive styling changes. Keep those `aria-label`s on
`src/components/nav/bottom-bars.tsx` if the nav is reworked.

## Cost note for role-access.spec.ts

`role-access.spec.ts` charges **nothing**: it never completes a redemption. The
verify-only staff test deliberately enters an invalid code (`000000`) to prove
the keypad renders. Only `golden-path.spec.ts` performs a real, fee-charging
redemption.
