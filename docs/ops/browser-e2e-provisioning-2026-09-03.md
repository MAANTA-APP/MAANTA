# Browser E2E provisioning — the exact operational procedure

**Why this document exists.** `e2e.yml` has recorded **200 runs. Every sampled
one concluded `skipped`.** The repository variable `E2E_BASE_URL` has never been
set, so MAANTA has never observed its own golden path in a browser. The suite is
written, guarded against false greens, and has never executed once.

This is an **operational** task. Nothing in it is engineering, and none of it can
be done from an engineering session without fabricating credentials.

**Time: about an hour.** One person with repo admin and Vercel/Supabase access.

---

## Before you start — the one rule

**The suite performs a REAL claim and a REAL verified redemption, which charges
the KES 30 success fee.** It must never run against production.

`e2e.yml` already refuses a `maanta.app` host *before* checkout, and refuses to
run on any branch other than `main`. Do not weaken either guard to make setup
easier.

---

## Step 1 — a non-production target

Create a deployment that is **not** production and **not** pointed at the
production Supabase project (`axrrslqssmbngbataejg`).

1. A Supabase project for testing, with the migration chain applied. After the
   three 2026-09-03 migrations land this must be at **110** migrations, or the
   suite tests a different product from the one you are about to ship.
2. A Vercel preview/staging deployment bound to that project, with its own Clerk
   instance or Clerk test keys.
3. Note its origin, e.g. `https://maanta-e2e.vercel.app`.

**Check:** open the origin in a browser and confirm the feed renders. If it
shows a read-failure state, the migrations are not applied — fix that first.

---

## Step 2 — seed exactly what the suite needs

On the **test** project only:

- one active, unpaused, unexpired deal at an active, visible merchant;
- `max_claims` comfortably above 1 — **the D236 allocation now binds**, and a
  deal with a spent allocation makes the suite fail for the right reason at the
  wrong moment;
- a merchant wallet balance above KES 30 so the fee can be charged rather than
  recorded as arrears;
- three signed-in accounts: shopper, merchant (with `can_verify`), admin.

---

## Step 3 — capture the three storage states

A `storageState` is a Playwright JSON blob of cookies and local storage for an
already-signed-in browser context. Capture one per role, **against the test
deployment**, never production:

```bash
cd maanta-app
npm i -D @playwright/test && npx playwright install chromium

# Repeat for each role. Sign in by hand in the window that opens, then close it.
npx playwright open --save-storage=shopper.json  https://<test-origin>/login
npx playwright open --save-storage=merchant.json https://<test-origin>/login
npx playwright open --save-storage=admin.json    https://<test-origin>/login
```

**These are live session credentials.** Do not commit them, do not paste them
into a chat, and do not reuse a production session. They go straight into GitHub
secrets in the next step and should be deleted from disk afterwards.

---

## Step 4 — a protected environment

Repo → **Settings → Environments → New environment** → name it `e2e`.

Add **required reviewers**. `e2e.yml` binds the secret-bearing job to this
environment specifically so a run that can spend money needs a human approval.

---

## Step 5 — variables and secrets

Repo → **Settings → Secrets and variables → Actions**.

**Repository variables** (not secrets — the workflow reads them before checkout):

| Name | Value |
|---|---|
| `E2E_BASE_URL` | the test origin from step 1 |
| `E2E_ALLOWED_HOST` | that host. Optional but recommended: it turns the production guard from a denylist into an allowlist |

**Environment secrets, on the `e2e` environment:**

| Name | Value |
|---|---|
| `E2E_SHOPPER_STORAGE` | contents of `shopper.json` |
| `E2E_MERCHANT_STORAGE` | contents of `merchant.json` |
| `E2E_ADMIN_STORAGE` | contents of `admin.json` |

**All three are required.** The workflow fails with an explicit error if
`E2E_BASE_URL` is set and any storage state is missing, rather than letting the
suite self-skip to a green zero-coverage run. That is deliberate — do not set
the variable until you have all three secrets ready.

---

## Step 6 — run it

Actions → **E2E (golden path)** → **Run workflow** on `main`. Approve the
environment when prompted.

It also runs automatically on every push to `main` once configured.

---

## Step 7 — read the result honestly

The job asserts, from the Playwright JSON report, that **no spec silently
skipped** and that at least one dashboard spec ran. So:

- **Green** = the golden path executed in a browser. This is the first time.
- **Red** = either a real defect or a setup problem. Read the failure; do not
  re-run it until you know which.
- **Skipped** = the configuration is incomplete. **This is not a pass.** It is
  the state MAANTA has been in for 200 runs.

Record the run number and its conclusion in
`docs/maanta-launch-readiness-tracker.md`, and close **D172** with it.

---

## Interim — the Admin/Founder acceptance suite on a PR preview (D234)

`e2e/admin-founder-redesign.spec.ts` differs from the golden path in the one
way that matters here: **it is read-only** — it presses no button that writes
— so it may run against a preview deployment that shares production's Supabase
project and Clerk instance. That is exactly what closes **D234**: the identity
branch production actually takes (`clerkMiddleware()`, `ensureAppUserFromClerk`)
exercised in a browser at iPhone size. Founder ruling 2026-09-03: this
automated run is the canonical evidence; a manual iPhone walk supplements it and
replaces it only if preview execution is genuinely blocked.

**What ran and what could not, 2026-09-03.** Locally, 12 of 12 on the Supabase
strategy (skills doc §11). From the engineering session the preview run was
blocked twice over: the sandbox's egress policy refuses connections to
`*.vercel.app`, and Clerk storage states for an admin and a co-founder cannot
be minted there — a Clerk session is a human signing in.

**Steps** — a machine with a browser and network access; the founder or ops:

1. **Find the preview.** Vercel project `maanta-nuia` builds a preview on every
   push of the PR branch; take the URL of the deployment whose commit is the PR
   head (`vercel ls` or the PR's Vercel check). Never `maanta.app`.
2. **Capture two storage states**, signing in as an **admin** and as a
   **co-founder**. Without the second the co-founder test skips and says so; no
   production user currently holds `cofounder`, and assigning it is founder-held
   (Q14). The project has Vercel Authentication (SSO) enabled on every preview
   (`all_except_custom_domains`, read 2026-09-03), so the window opens on
   Vercel's sign-in first: sign in with the MAANTA Vercel account — that cookie
   lands in the storage state and the headless run reuses it. A person without
   Vercel access can be handed a 23-hour share link instead (Vercel's
   "share" on the deployment, or the MCP `get_access_to_vercel_url`), which
   sets the same cookie.
   ```bash
   cd maanta-app && npm i -D --no-save @playwright/test && npx playwright install chromium
   npx playwright open --save-storage=admin.json     https://<preview>/login
   npx playwright open --save-storage=cofounder.json https://<preview>/login
   ```
3. **Run it.** The spec applies the iPhone 13 device itself.
   ```bash
   E2E_BASE_URL=https://<preview> E2E_ADMIN_STORAGE=admin.json E2E_COFOUNDER_STORAGE=cofounder.json \
     npx playwright test e2e/admin-founder-redesign.spec.ts
   ```
4. **Read it honestly.** 12 passed closes D234 — record the preview URL, the
   commit and the count in the register row. Skipped is not a pass. A failure
   is a defect or a setup problem; name which before re-running. (If the Action
   Queue is empty on the preview the drill-down test annotates that and passes;
   Merchant 360 needs one merchant record in the directory, which production
   has.)
5. **Delete `admin.json` and `cofounder.json`.** They are live sessions on
   production identities.

---

## What this unblocks

| Row | Closes on |
|---|---|
| **D172** | One green golden-path run |
| **D235** | A green `npm run test:e2e -- offline-ticket` with `E2E_SHOPPER_STORAGE` **and a shopper holding a real active claim** — only meaningful once PR #317 is merged. A service-worker harness run does **not** close it |

---

## Interim — what was run locally on 2026-09-03, and what it is worth

`e2e/admin-founder-redesign.spec.ts` (the admin / founder redesign's
acceptance list) has been executed once, **12 of 12 passing at iPhone 13
size, against a local stack** rather than a deployment: the fresh migration
chain on native PostgreSQL, PostgREST with live RLS, this branch on the
development server, and the **Supabase** auth strategy with two
offline-minted sessions. The record is
`docs/skills/admin-founder-command-centre-2026-09-03.md` §11; the open row is
**D234**.

That run is evidence about the pages, the role guards and the data reads. It
is **not** the run this document provisions: production takes the Clerk
identity branch, and no Vercel build was involved. Steps 1–6 above still
apply to the redesign spec exactly as they do to the golden path — the same
non-production target, the same storage-state capture (an `admin` state, and a
`cofounder` state for the boundary test), the same protected environment.
D234 closes on that run, or on the founder's own iPhone walk of the deployed
console against the same list.

---

## What it does not unblock

Nothing about Merchant 01's own evidence. This proves the software works in a
browser; it says nothing about whether a real merchant wants it. Those are the
two counters the Node 0 protocol keeps apart, and this is firmly the first one.
