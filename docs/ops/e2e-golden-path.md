# Ops — Browser golden-path E2E (Playwright, tracker E14 / PR #35)

**Status:** suite authored in repo (`maanta-app/e2e/golden-path.spec.ts`,
`maanta-app/playwright.config.ts`, opt-in `.github/workflows/e2e.yml`). It is
**inert until a human provisions a live test env** — the specs self-skip and the
CI job is gated off — so it is honest coverage when enabled and never a false
green before then.

## Why it can't just run in CI today

The golden path needs a **deployed app** plus **Clerk-authenticated** shopper
and merchant sessions against a **live Supabase** with the rehearsal seed. Clerk
browser sign-in can't be scripted headlessly without test credentials, and there
is no dedicated test Supabase/Clerk env yet (tracker E14, decisions log). This is
the human/ops gate.

## What Claude Code did (repo)

- `e2e/golden-path.spec.ts` — shopper browse→claim→ticket, merchant verify
  (fee disclosed → **Collect from shopper** (P12) + **Verified**), and a
  negative invalid-code case. Self-skips unless the env below is set.
- `playwright.config.ts` — `baseURL` from `E2E_BASE_URL`, GitHub reporter, CI
  retries.
- `.github/workflows/e2e.yml` — opt-in job gated on the `E2E_BASE_URL` repo
  variable; installs Playwright on demand (kept out of `package.json` so the
  main `npm ci` lockfile stays valid).
- `npm run test:e2e` script.

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
     paths).
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
KES 30 fee", success "Verified" + "Collect from shopper", failure "Code not
valid" / "No fee was charged"); update them here if that copy changes.

---

## The service-worker offline suite (D235) — a second, credential-free config

`playwright.sw.config.ts` + `e2e-sw/` is a **separate** Playwright config from
the golden path above, and the separation is the point.

The golden-path suite needs a deployed app, Clerk storage states and a live
Supabase, and **self-skips without them** — correctly, so it is never a false
green. That means it could not prove D235, the offline claimed-code screen,
which is a browser-only behaviour: worker install/activate/claim, real
navigation requests, real Cache Storage, a real offline condition.

So the offline suite brings its own origin. `e2e-sw/harness/server.mjs` is a
short static server that serves the **real `public/sw.js`** with stand-in
pages. No credentials, no database, nothing to provision — it runs anywhere,
and it never skips.

```bash
cd maanta-app
npm i --no-save @playwright/test          # deliberately not a dependency
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e:sw
```

`PW_CHROMIUM_PATH` is optional and exists for images that ship one Chromium
whose build number will not match whatever `@playwright/test` version the
on-demand install resolves. Omit it on a machine where
`npx playwright install chromium` has run.

**What it proves** (5 tests, all passing 2026-09-03 in Chromium 1194):

| Test | Guards |
|---|---|
| Cached code screen after the network drops | The counter scenario itself — D235 |
| Feed shows the offline page, not a stale one | The D92 promise, one layer down |
| Live page still wins when the network is up | Cache-first would strand a shopper who *has* signal |
| `/api/` never served from cache | A stale wallet balance is worse than an error |
| Sign-out purge empties the page cache | Cache Storage is origin-scoped, not user-scoped |

Each was confirmed to bite by inducing the regression it guards: removing the
cache fallback failed 3 of the 5; adding `/feed` to `CACHEABLE_PAGES` failed
exactly the feed test.

**What it does NOT prove, and must not be cited as proving:** that the real
Next.js `/my-deals` document renders a usable code offline for a signed-in
shopper. The harness serves stand-in HTML. Only the golden-path suite, against
a deployed app with a session, can close that — and it is still gated on the
same ops task as everything else in this document.
