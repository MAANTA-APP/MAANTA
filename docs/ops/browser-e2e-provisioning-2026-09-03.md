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
