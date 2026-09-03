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

## The gate, as the founder defined it (2026-09-03)

**The browser gate is FIVE separately reported proofs. A composite "E2E PASS"
is prohibited until all five are genuinely proven.**

| # | Proof | Status today |
|---|---|---|
| 1 | Shopper claim / ticket | **pending ops** |
| 2 | Merchant deal / allocation | **BLOCKED — coverage does not yet exist** |
| 3 | Staff verification / redemption | **pending ops**, and only counts as *staff* proof if the verifier state is captured from a genuine **merchant staff-seat** login |
| 4 | Admin access | **pending ops** |
| 5 | Founder surface | **pending ops** |

Report them separately. Never average them, never roll them into one line, and
never let four greens and one blank read as a pass.

### Two standing prohibitions

**1. Never weaken a product invariant to make E2E green.** In particular, the
predicted `active_claim_already_exists` collision (see below) must **not** be
"fixed" by changing that rule. It is a real product invariant — one shopper may
not hold two live claims on the same deal. If the suite trips over it, that is
the suite's isolation to repair, not the product's rule to relax.

**2. A skipped spec is BLOCKED, never PASS.** This is the failure mode that
produced 200 green-looking workflow runs proving nothing.

### The one authorised addition, and when it activates

The founder has authorised **one** small addition — browser coverage for the
merchant D236 surface, proving the merchant sees correct
allocation / issued / remaining values and that those values reflect
authoritative occupancy semantics.

**It is authorised for once the operational environment exists, not before**
("do not spend another engineering cycle before the operational environment
exists"). Keep it narrow when the time comes: this is **missing acceptance
coverage, not permission for more product work.** No new merchant features, no
redesign of the allocation UI, no second scenario smuggled in alongside it.

---

## What the suite proves — and what it does not

Read this before provisioning. A green run is only worth what it covers, and
the coverage was audited on 2026-09-03 against the five roles the founder named.

| Role the founder named | Covered? | By what |
|---|---|---|
| **Shopper claim / ticket flow** | **YES** | `golden-path.spec.ts` — claims a deal from the feed, asserts a formatted 6-digit code |
| **Staff verification / redemption** | **PARTIAL** | The verify test drives `/merchant/redeem`, asserts the KES 30 fee disclosure, the *Collect from shopper* amount and *Redeemed*. But it authenticates from `E2E_MERCHANT_STORAGE`, and **whether that session is the owner or a staff seat is a property of the storage state, not of the spec.** It proves *a verifier*, not specifically a staff seat. Capture that state from a **staff** login if you want the staff path proven |
| **Admin access** | **YES** | `dashboards.spec.ts` — `/admin` renders real operations KPIs |
| **Founder surface** | **YES** | `dashboards.spec.ts` — `/founder` renders real KPIs, plus the honest "cannot cover 7 days" case |
| **Merchant deal state / allocation** | **NO — NOT COVERED** | No spec creates a deal, reads *Claims left*, pauses or resumes, or meets the claim-limit refusal. **This is the D236 surface deployed today, and the browser suite does not touch it.** A green run says nothing about it |

**So a fully green run means:** a shopper can claim and get a code, someone
authorised can verify it and the fee is disclosed and charged, an invalid code
is refused with no fee, and the admin and founder dashboards render real
numbers. **It does not mean the merchant allocation UI works.**

That gap is recorded here rather than closed, because the founder's instruction
was to provision and run rather than write more tests first. It is the obvious
first candidate if a second E2E scenario is ever authorised.

---

## D236 changes what "a seeded deal" has to mean

Two consequences of today's deploy that the suite has never had to satisfy.
Get these wrong and the run fails for reasons that have nothing to do with the
product.

**1. Every successful run permanently consumes one allocation slot.** A
redeemed claim holds its slot forever — that is the point, the unit was sold.
So a seeded deal with `max_claims = N` supports exactly **N golden-path runs**,
and run N+1 fails with `deal_claim_limit_reached`. That failure will look like
a product defect and will not be one.

> Seed the E2E deal with `max_claims` in the **hundreds**, or raise it before
> each campaign of runs. "Comfortably above 1" is not enough guidance; the
> number you need is *how many times you intend to run this suite*.

**2. Pin the deal, or the suite picks one at random.** With `E2E_DEAL_PATH`
unset, `claimFirstDeal` opens `/deals` and clicks the **first** "You pay" link.
With demo mode on that is an arbitrary synthetic deal whose allocation nobody
controls. **Set `E2E_DEAL_PATH` to the seeded deal's path** so the headroom you
provisioned is the headroom the suite actually consumes.

---

## A failure to expect on the first run, and what it is

`golden-path.spec.ts` has two tests that each claim as the **same** shopper.
The first test claims and leaves its ticket **pending** — it never redeems it.
The second test then claims again. If both land on the same deal (which they
will, unless `E2E_DEAL_PATH` points them apart), `claim_deal` raises
`active_claim_already_exists`, the code never renders, and the second test
fails.

This is a **suite** defect, not a product defect, and it predates D236 — it has
simply never been observable because the suite has never run. It is called out
here so the first red run is diagnosed in a minute instead of an afternoon.

The minimal fixes, in preference order: give the two tests different seeded
deals via distinct paths; or run the file serially (`workers: 1`) and have the
first test redeem or expire its claim; or use two shopper storage states.

**No code was changed for this, and none should be until the real run trips
over it.** Founder ruling: run the real environment first; if it fails exactly
here, that is a bounded test-harness defect — repair the isolation or setup,
rerun, and record both the failure and the repair.

**Whatever the repair is, it is not touching `active_claim_already_exists.`**
That rule is a product invariant, not an obstacle. See the standing
prohibitions above.

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
| `E2E_BASE_URL` | the non-production origin from step 1 |
| `E2E_DEAL_PATH` | **explicitly set** to the provisioned test deal's path. Do not leave this unset — see the D236 section. Unset means the suite claims whatever happens to be first on the feed, and the allocation headroom you provisioned is not the headroom it consumes |
| `E2E_ALLOWED_HOST` | that host. Optional but recommended: turns the production guard from a denylist into an allowlist |

**Environment secrets, on the `e2e` environment:**

| Name | Captured from |
|---|---|
| `E2E_SHOPPER_STORAGE` | an authenticated shopper |
| `E2E_MERCHANT_STORAGE` | **a genuine merchant STAFF-SEAT login** if proof 3 is to count as staff proof. An owner session proves "a verifier" and nothing more — record which one you captured |
| `E2E_ADMIN_STORAGE` | an admin (covers `/admin` **and** `/founder`) |

**All three are required.** The workflow fails with an explicit error if
`E2E_BASE_URL` is set and any storage state is missing, rather than letting the
suite self-skip to a green zero-coverage run. Do not set the variable until you
have all three secrets ready.

> **Storage states are live session credentials.** They are secrets. They go
> into GitHub environment secrets and **never into Git** — not the repo, not a
> gist, not a commit message, not a chat. Delete the local `.json` files after
> uploading them.

**Allocation sizing, restated because it is the easiest thing to get wrong:**
seed the test deal with `max_claims` at least as large as **the number of
successful executions you plan**, not merely greater than 1. Each successful
run permanently consumes a slot.

---

## Step 6 — run it

Actions → **E2E (golden path)** → **Run workflow** on `main`. Approve the
environment when prompted.

It also runs automatically on every push to `main` once configured.

---

## Step 7 — record the result as PASS / FAIL / BLOCKED

Founder instruction, 2026-09-03: record three states rather than trying to get
everything green. Fill this in verbatim, per role, and do not average them.

| Role | State | Evidence |
|---|---|---|
| Shopper claim → ticket | PASS / FAIL / BLOCKED | run #, spec, screenshot on failure |
| Staff verification → redemption → KES 30 | PASS / FAIL / BLOCKED | note whether the storage state was an **owner** or a **staff seat** |
| Admin access | PASS / FAIL / BLOCKED | |
| Founder surface | PASS / FAIL / BLOCKED | |
| Merchant deal state / allocation | **BLOCKED — not covered by any spec** | see the coverage matrix above |

Definitions, so the three states stay honest:

- **PASS** — the spec ran in a browser against the deployed app and asserted
  its subject. Not "the job was green".
- **FAIL** — it ran and the assertion failed. **This is valuable.** It is
  something 1,819 unit and integration tests and 42 SQL suites could not tell
  us. Diagnose it before re-running; check the predicted collision above first.
- **BLOCKED** — it did not run: missing configuration, missing credential, or
  no spec exists for that role. **A skipped spec is BLOCKED, never PASS.**

The job already asserts from the Playwright JSON report that no spec silently
skipped, so a partially-configured run fails loudly rather than reporting green.

Record the run number and its per-role states in
`docs/maanta-launch-readiness-tracker.md`.

**D172 does not close on this run.** It closes only when **all five** proofs are
PASS — which requires the merchant deal/allocation coverage to be written first
(the one authorised addition above). Four greens and one BLOCKED is four
greens and one BLOCKED.

## What this unblocks

| Row | Closes on |
|---|---|
| **D172** | **All five** proofs PASS — not one green golden-path run. See the gate definition above |
| **D235** | A green `npm run test:e2e -- offline-ticket` with `E2E_SHOPPER_STORAGE` **and a shopper holding a real active claim** — only meaningful once PR #317 is merged. A service-worker harness run does **not** close it |

---

## What it does not unblock

Nothing about Merchant 01's own evidence. This proves the software works in a
browser; it says nothing about whether a real merchant wants it. Those are the
two counters the Node 0 protocol keeps apart, and this is firmly the first one.
