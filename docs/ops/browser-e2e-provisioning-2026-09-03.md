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

## Interim — the Admin/Founder acceptance suite on a PR preview (D240)

`e2e/admin-founder-redesign.spec.ts` differs from the golden path in the one
way that matters here: **it is read-only** — it presses no button that writes
— so it may run against a preview deployment that shares production's Supabase
project and Clerk instance. That is exactly what closes **D240**: the identity
branch production actually takes (`clerkMiddleware()`, `ensureAppUserFromClerk`)
exercised in a browser at iPhone size. Founder ruling 2026-09-03: this
automated run is the canonical evidence; a manual iPhone walk supplements it and
replaces it only if preview execution is genuinely blocked.

**What ran and what could not, 2026-09-03.** Locally, 12 of 12 on the Supabase
strategy (skills doc §11). From the engineering session the preview run was
blocked twice over: the sandbox's egress policy refuses connections to
`*.vercel.app`, and Clerk storage states for an admin and a co-founder cannot
be minted there — a Clerk session is a human signing in.

**Re-tested and confirmed, 2026-09-03, so nobody spends another session on it.**
The block is the environment's network policy, not a transient failure: the
agent proxy's own log records `connect_rejected — gateway answered 403 to
CONNECT` for the preview host, reproduced on every attempt, with `curl` exiting
56 each time. **No Playwright run against any `*.vercel.app` origin is possible
from an engineering session under any credential**, so the share links and
protection-bypass tokens Vercel offers do not help — there is no transport to
use them on. There is also no browser shared between the founder and the
session: an agent cannot be handed a signed-in window, and a Clerk session
cannot be transferred by describing it.

**One partial observation worth keeping.** The Vercel MCP fetches a URL
server-side, and one such fetch of `/founder` on the branch preview returned the
application rather than Vercel's SSO redirect. Its headers are real evidence
about the identity branch:

```
x-clerk-auth-status: signed-out
x-clerk-auth-reason: session-token-and-uat-missing
x-matched-path:      /login/[[...sign-in]]
```

with the RSC payload carrying `login?next=%2Ffounder` and the page loading
`clerk.maanta.app` under a `pk_live_…` key. So on the real deployment, under
**production Clerk**, a signed-out visitor to `/founder` is sent to the sign-in
page with the return path preserved — one of the five boundary assertions,
confirmed through the Clerk middleware the local proof could not reach.

Its limits are the point: it is **one route of five**, at **HTTP level rather
than in a browser**, and it was **not reproducible** — `/admin`, `/admin/queue`
and a repeat of the same URL all returned Vercel's SSO redirect, so the one
success was a race with a protection-bypass creation, not a channel. It does
not shift D240, which needs the suite in a browser; it is recorded because it is
the only Clerk-branch evidence that exists, and because the next session should
not re-derive the transport dead end.

### The CI path (preferred) — `E2E (admin + founder acceptance, read-only)`

Founder ruling 2026-09-03: wire the spec into CI rather than depend on a laptop.
`.github/workflows/e2e-admin-founder.yml` runs the suite on a GitHub runner,
where the egress block above does not apply, so the only thing a human supplies
is the sign-in — once, as secrets — instead of a run per PR.

**One-time setup**

1. **Capture the storage states** on a machine with a browser, against the PR
   preview. One command per role, from `maanta-app/`:

   ```bash
   npm i -D --no-save @playwright/test && npx playwright install chromium   # once per machine
   npm run e2e:capture -- admin https://<preview>.vercel.app
   npm run e2e:capture -- cofounder https://<preview>.vercel.app             # when an identity holds the role
   ```

   A browser window opens on the preview's sign-in (Vercel's own sign-in
   first — previews are protected — then MAANTA's). Sign in, wait for the
   dashboard, close the window. The script writes the session to a
   permission-restricted temporary file *outside* the repository, puts it on
   the clipboard, and prints exactly which GitHub secret to paste it into;
   when you press Enter it wipes the file and the clipboard. It refuses a
   `maanta.app` host and refuses to save a state that contains no Clerk
   session. Nothing needs to be pasted into any chat, and the file names are
   git-ignored so a stray `--save-storage` run cannot be committed either. No
   production user holds `cofounder` yet — Q14 is founder-held — so the
   second command waits on that decision.
2. **Settings → Environments → `e2e-readonly`**, and add **required
   reviewers**. This is not optional. The environment already exists — the
   first dispatch on 2026-09-04 (run 33823638502) started without an approval
   prompt, which is how we know it has no reviewers yet. Add them before the
   secrets in step 3. The repository is public and
   these states are live Clerk sessions on production identities; the reviewer
   prompt, which names the ref being run, is what stands between a branch and
   those secrets.
3. On that environment add secret `E2E_ADMIN_STORAGE`, and `E2E_COFOUNDER_STORAGE`
   when you have one. Optionally set repository variable
   `E2E_ADMIN_FOUNDER_ALLOWED_HOST` (e.g. `.vercel.app`) to turn the production
   refusal into a positive allowlist.
4. **Add `VERCEL_AUTOMATION_BYPASS_SECRET` to the same environment.** Every
   preview of `maanta-nuia` is behind Vercel Authentication
   (`all_except_custom_domains`, read again 2026-09-04), so a browser with no
   session lands on Vercel's sign-in wall rather than MAANTA's `/login`, and the
   five signed-out boundary tests would fail for the wrong reason. Vercel's
   standard answer is the project's *Protection Bypass for Automation* secret:
   Vercel → `maanta-nuia` → Settings → Deployment Protection → Protection Bypass
   for Automation → generate, copy, paste into the secret. The spec then sends
   it as the `x-vercel-protection-bypass` header on every request, for the
   signed-out and signed-in contexts alike. This does not weaken the
   protection — the wall stays up for anyone without the secret — and it is
   rotatable from the same page.
5. The capture command has already wiped its file. If you captured by hand
   with `playwright open --save-storage` instead, **delete the JSON files
   now** — they are live sessions.

**Per run:** Actions → *E2E (admin + founder acceptance, read-only)* → **Run
workflow**, selecting the **PR's branch** and pasting the preview origin.
Approve the environment when prompted.

**Why this workflow is separate from `e2e.yml`, and what that costs.** The
golden path is pinned to `main` precisely so a dispatch cannot run branch code
with its secrets; that gate is untouched. This suite is read-only and its whole
purpose is to test a PR's preview *before* merge, so it must run on the PR's
ref — the spec under test is often not on `main` yet. Four things carry that
trade: dispatch-only (never `pull_request`, so a fork cannot start it), the
separate `e2e-readonly` environment (a run here cannot read the money-path
secrets), the production refusal before checkout, and secrets scoped to the two
steps that need them. The residual risk is the approver's: **read the ref before
approving**, and treat the states as rotatable — sign those sessions out and
recapture if a run is ever approved by mistake. `e2e-workflow-guards.test.ts`
pins each of these properties, and the money suite's, so removing one fails CI.

**Reading the result.** The job fails if `E2E_ADMIN_STORAGE` is missing, rather
than letting the suite self-skip to a green job that tested nothing. It fails if
any spec skipped, with one exception: the co-founder boundary may skip when its
secret is absent, and the job then prints an explicit warning. **That is an
11 of 12 and must be recorded as such** — D240 closes on 12. Since **D256** the
drill-down test also *fails* on an empty Action Queue rather than annotating and
passing, so a recorded 12 means all twelve were exercised.

**Screenshots.** The always-on artifact is the JSON report only. Failure
screenshots are behind the `upload_failure_screenshots` input (default off):
the preview shares production's Supabase project and this repository is public,
so a capture of an admin page is a real shop's record in a downloadable
artifact. Turn it on only to diagnose a failure, and delete the artifact after.

**Why sign-out is not in this suite.** The browser run proves the way in and
the shells. Pressing *Sign out* would revoke the stored Clerk session and kill
the secret after a single run, so the explicit exit (D258) and its honest
failure state (D260) are proved in the DOM under both auth strategies by
`maanta-app/src/components/__tests__/session-entry-and-exit.test.ts` instead.

---

**Steps for a manual run** — a machine with a browser and network access; the
founder or ops. Use these to capture the states above, or to run the suite
by hand when CI is not set up:

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
4. **Read it honestly.** 12 passed closes D240 — record the preview URL, the
   commit and the count in the register row. Skipped is not a pass. A failure
   is a defect or a setup problem; name which before re-running. (If the Action
   Queue is empty on the preview the drill-down test annotates that and passes;
   Merchant 360 needs one merchant record in the directory, which production
   has.)
5. **Delete `admin.json` and `cofounder.json`.** They are live sessions on
   production identities. (Prefer `npm run e2e:capture` above, which does
   this for you.)

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
**D240**.

That run is evidence about the pages, the role guards and the data reads. It
is **not** the run this document provisions: production takes the Clerk
identity branch, and no Vercel build was involved. Steps 1–6 above still
apply to the redesign spec exactly as they do to the golden path — the same
non-production target, the same storage-state capture (an `admin` state, and a
`cofounder` state for the boundary test), the same protected environment.
D240 closes on that run, or on the founder's own iPhone walk of the deployed
console against the same list.

---

## What it does not unblock

Nothing about Merchant 01's own evidence. This proves the software works in a
browser; it says nothing about whether a real merchant wants it. Those are the
two counters the Node 0 protocol keeps apart, and this is firmly the first one.
