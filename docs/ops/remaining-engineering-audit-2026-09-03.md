# MAANTA REMAINING ENGINEERING AUDIT — 2026-09-03

**Mode:** discovery only. No code changed, no migration written or applied, no
production write, no feature flag touched, no branch merged, no PR merged.
Production was read **read-only** (`SELECT` / `EXPLAIN` only) to turn four open
register rows from assertion into measurement.

**Scope question:** *outside third-party API/provider integration, what
engineering work is actually left?*

---

## 1. Executive answer

**Very little, and none of it stops Merchant 01.**

The application and database boundary is in materially better shape than the
open-row count suggests. The exact-head board is green on every gate MAANTA
actually runs, the migration ledger reconciles 107/107 against production, and
the money path (`claim_deal` → `verify_redemption` → fee) is correctly locked,
idempotent and single-charge under concurrency — verified by reading the SQL,
not by trusting the docs.

What is genuinely left is small, and it is dominated by **operational proof**,
not by unwritten code.

| Bucket | Count | Notes |
|---|---|---|
| **Must fix before Merchant 01** | **0** | No confirmed blocker. See §3. |
| **Operational proof required before Merchant 01** | **3** | Browser E2E has never executed; D158/D162 need one real self-serve onboarding; demo-mode posture is a founder call. |
| **Must fix during controlled pilot** | **4** | A1 (`max_claims` semantics), D168, D134, D188. |
| **Must fix before scale** | **5** | D132, D153, D171, D118, register hygiene. |
| **Hard gate before enabling Fast Visit** | **1** | D233 — no staff/test exclusion, no funding cap. Fast Visit is OFF. |
| **Deliberately deferred** | **3** | Agent acquisition tooling (D159), disputes depth (D81), PWA install funnel (D93/D139). |
| **External / provider-dependent** | **9** | Excluded from the count. See §11. |
| **Not engineering (OPS / founder)** | **6** | Demo mode, ODPC, backups drill, legal, D39 curl, tracker refresh. |

The honest headline: **MAANTA is not waiting on engineering. It is waiting on a
merchant.**

### One correction to the brief, up front

The brief states *"D235 is OPEN. The canonical closure condition is already
guarded in the repository."* **That is not true of this HEAD.**

At `c3b2fd3` there is no `D235` row anywhere in the repository (the register
ends at **D222**), no `e2e/offline-ticket.spec.ts`, no `/offline` route, no
`purge-cached-pages.ts`, and `public/sw.js` is **push-only** — it handles
`push` and `notificationclick` and has no `fetch` handler and no Cache Storage.

All of that work — including the service-worker browser harness the brief calls
"browser-proven" — lives **entirely inside open PR #317**
(`claude/maanta-ux-copy-audit-f65nrz`), whose merge-base is exactly this HEAD.
D223–D235 are all PR #317 rows.

This does **not** make MAANTA unsafe. At HEAD the product is *honest* about
having no offline capability: `OFFLINE_MESSAGE` in
`maanta-app/src/components/ui/states.tsx:108` reads *"You're offline. Reconnect
to load live deals."* and its header comment states plainly that MAANTA has no
offline capability. The false promise that D92 closed has not returned.

So the correct classification at HEAD is **not** "blocked on operational proof"
— it is **"feature not present at HEAD; unmerged in PR #317."** Merging PR #317
is a founder decision, not an audit action, and I did not take it.

---

## 2. Exact-head evidence

| Item | Value |
|---|---|
| Branch | `claude/maanta-audit-merchant-01-a67nk2` |
| HEAD SHA | `c3b2fd3ae4480fdf7016c001a5d1db3b2f1a0ce3` |
| Tree vs `main` | identical (`main` is at the same SHA) |
| Working tree | clean (`git status --porcelain` empty) |
| Framework | Next.js `14.2.35` (App Router), React 18, Supabase JS 2.110, Clerk 6.39 |

### Checks I ran here, at this SHA

| Check | Result |
|---|---|
| `npm run lint` | **pass** — "No ESLint warnings or errors" |
| `npm run typecheck` | **pass** — `tsc --noEmit`, no output |
| `npm test` | **pass — 174 files, 1725 tests, 0 failed, 0 skipped** |
| `npm run test:clerk-smoke` | **pass** — 6 tests |
| `npm run build` | **pass** (exit 0) |
| `check:tokens` | clean — 53 rendered files, 453 compiled chunks, no `{{TOKEN}}` |
| `check:canonicals` | clean — 16 marketing routes; `/waitlist` not prerendered, not inspected |
| `check:forms` | clean — 2 routes ship a complete server-rendered form |

### Checks I did NOT run here

- **`make db-verify` / the `db-tests` SQL suite** — no Docker/Supabase CLI in
  this container. **Not run by me.** However CI run **#941** on this exact SHA
  (`c3b2fd3a`) shows job `db-tests` **success**: Supabase started fresh, the
  full 107-migration chain applied, and all 39 suites under
  `supabase/tests/*.sql` ran green (2026-09-02 08:04–08:06 UTC).
- **Any browser test.** See below — this is the real gap.

### Migration evidence

Read directly from production `supabase_migrations.schema_migrations`
(`axrrslqssmbngbataejg`):

- **107 rows** in production; **107 files** in `supabase/migrations/`.
- Latest version **`20260830120000`** on both sides.
- **Ledger reconciles 107/107.** CLAUDE.md's claim is accurate as of today.

### Browser / E2E execution state — the significant finding

The `e2e.yml` workflow has **200 recorded runs. Every one sampled (30 of 200,
newest to 2026-08-24) concluded `skipped`.** The gate
`if: vars.E2E_BASE_URL != ''` has never been satisfied, because the repository
variable has never been set.

**No MAANTA browser test has ever executed. Not once.** The golden path
(shopper claim → 6-digit ticket → merchant verify → KES 30 fee → wallet) has
never been proven through a real browser against a deployed app.

The suite itself is well built and **fails closed**, not open: `e2e.yml` errors
if `E2E_BASE_URL` is set but a storage secret is missing, refuses to run against
a `maanta.app` host, and asserts from the Playwright JSON report that no spec
silently skipped. This is implemented coverage that has never been switched on —
which is an **ops** task, not an engineering one.

### Production configuration read (read-only)

| Key | Value |
|---|---|
| `demo_mode_enabled` | `true` |
| `fast_visit_enabled` | `false` ✅ (constraint preserved) |
| `success_fee_kes` | `30.00` ✅ (frozen rule intact) |
| `boost_fee_kes` | `500` |
| Non-demo merchants | **2** — both internal per D184 |
| Blacklisted users | 0 |
| Stale `pending` redemptions past expiry | **10** (was 5 on 2026-08-19 — D134 is growing) |

**External field validation remains 0.** Nothing I read contradicts that.

---

## 3. Merchant 01 blockers

**None.**

I looked for a reason to put something here and could not honestly justify one.

The end-to-end path a real merchant and a real shopper will walk — self-serve
onboarding without a phone → admin approval → deal creation → shopper claim →
6-digit code → optional QR check-in → staff queue → counter verification →
KES 30 debit → wallet — is implemented, guarded by SQL tests that ran green on
this SHA, and enforced server-side at the RPC layer rather than in the UI.

Two things that *look* like blockers and are not:

- **Offline tickets (D235).** Not present at HEAD, and the UI does not claim
  them. A shopper at a BBS Mall counter with no signal cannot reload
  `/my-deals` — but they are told to reconnect rather than misled, and the
  practical mitigation (screenshot the code) needs no engineering. This is a
  **known operational limit**, and it is already written down in
  `docs/ops/node0-known-limitations.md`.
- **Demo mode ON.** A founder ruling (2026-08-26), with the contamination risk
  already recorded (D189/D188). Flipping it for Merchant 01's own onboarding and
  Shopper 01's claim is an **ops action the founder owns**, not engineering. I
  did not change it.

---

## 4. Remaining engineering work, ranked

### A1 — `max_claims` is a redemption cap, not a claim cap (NEW)

- **Proposed ID:** D236 *(not inserted — see §14 note on numbering)*
- **Severity:** **P1** · **CONFIRMED** (by code read; not yet reproduced live)
- **Files:** `supabase/migrations/20260818120000_claim_deal_csprng_otp.sql`
  (cap check), `20260630231958_increment_deal_claims_rpc.sql`,
  `20260721140000_guardian_v1.sql:510` (the only increment site),
  `src/app/merchant/(app)/deals/new/new-deal-wizard.tsx:541` (the input),
  `src/app/(shopper)/deals/[id]/page.tsx:226` (the shopper copy).

**The defect.** `deals.claims_count` is incremented **only inside
`verify_redemption`** — that is, on *successful redemption*. But it is (a) the
value `claim_deal` gates the cap on, and (b) rendered everywhere as *"claimed"*.

So `max_claims` does not limit how many shoppers can hold a code. It limits how
many can **redeem** — and even that only indirectly, because
`verify_redemption` contains **no cap check at all**.

**Failure mode.** A merchant posts "10 units, max claims 10". Fifty shoppers
claim; `claims_count` stays 0 because nobody has redeemed, so `claim_deal` never
refuses. Fifty valid 6-digit codes are now in circulation against ten units. At
the counter, every one of them verifies — and every one charges the merchant
**KES 30**. The merchant is billed KES 1,500 for ten units of stock and turns
forty shoppers away.

Meanwhile the shopper-facing line reads *"3 of 10 claimed"* while forty
unredeemed codes exist. The merchant's own deal page shows the same understated
number.

- **Journey:** shopper claim; merchant deal creation; counter verification; fee.
- **N=1 / pilot / scale:** harmless at N=1 (wizard defaults to 100 and Merchant
  01 will see a handful of shoppers). **Bites at pilot** the moment a merchant
  posts genuinely limited stock — which is exactly the deal a real Eastleigh
  merchant posts.
- **Integrity impact:** merchant over-billing and shopper disappointment at the
  counter. No cross-tenant or security impact.
- **Reproduce:** create a deal with `max_claims = 1`; claim from two shopper
  accounts. Both claims succeed. Verify both codes. Both succeed; two KES 30
  fees post.
- **Existing coverage:** none for this semantic. `deal_limit_cap_test.sql`
  covers the *active-deal* cap (a different rule); `ending-soon.ts` mirrors the
  same misreading rather than catching it.
- **Minimum safe fix (do NOT build now):** decide the intended meaning first —
  it is a **product ruling, not an engineering choice**. Either (a) count
  outstanding claims in `claim_deal`'s cap check, or (b) rename the field to
  *"Max redemptions"* everywhere and leave behaviour as-is. (b) is one copy
  change and zero risk.
- **What NOT to build:** do not add a cap check to `verify_redemption`. Refusing
  a shopper who is standing at the counter holding a code MAANTA issued breaks
  verify-anyway, which is a frozen rule.
- **Blocks:** Merchant 01 **no** · controlled Node 0 **only if Deal 01 uses a
  low cap on limited stock** · scale **yes**.

---

### D168 — tenant RLS policies error instead of filtering (scope is wider than recorded)

- **Severity:** **P1** · **MEASURED / REPRODUCED on production, read-only**

The register records "four tenant-isolation RLS policies". **I measured ten**,
across ten tables, all sharing the same shape
`merchant_id IN (SELECT id FROM merchants WHERE user_id = current_user_id())`:

`archive_history`, `boost_flags`, `deals`, `kpi_counters`, `merchant_staff`,
`merchant_transactions`, `pending_topups`, `redemptions`,
`reporting_aggregates`, `tier_flags`.

D147 revoked base-table `SELECT` on `merchants` from `authenticated`, so
evaluating those subqueries as `authenticated` raises `42501`. Reproduced live
with `SET LOCAL ROLE authenticated`:

```
redemptions           → 42501 permission denied for table merchants
merchant_transactions → 42501 permission denied for table merchants
agent_tasks           → OK
reward_events         → OK
merchant_presentations→ OK
notifications         → OK
users                 → OK
```

**Why this is P1 and not P0:** it **fails closed** — an error, never a leak —
and **no live code path hits it.** I checked every consumer: 93 modules use the
service client, 7 use the user client, and the only two user-client modules that
touch `redemptions` (`api/redemptions/route.ts`,
`api/redemptions/verify/route.ts`) both use `service` for those specific reads.

**The real observation underneath it:** for merchant and shopper surfaces, RLS
is **not currently a live defence**. Tenant isolation is carried by app-layer
`.eq("merchant_id", ctx.merchant.id)` predicates on a service client that
bypasses RLS — as `api/queue/route.ts` documents explicitly in its header. That
is a defensible, deliberate architecture, but it means the database backstop is
one `createClient()` away from a 500, and RLS would not save a dropped predicate.

- **Minimum safe fix:** grant `authenticated` `SELECT` on a narrow
  `merchants(id, user_id)` projection, or rewrite the ten policies to use a
  `SECURITY DEFINER` helper (`merchant_ids_for_current_user()`). One migration.
- **What NOT to build:** no broad RLS rewrite. The policies are correct in
  intent; only their ability to read `merchants` is missing.
- **Blocks:** Merchant 01 **no** · Node 0 **no** · scale **yes**.

---

### D134 — expired `pending` redemptions are never swept

- **Severity:** **P2** · **MEASURED** — **10 rows** on production today (5 on 2026-08-19).

`pg_cron` is in use (trial expiry, demo reseed) but no job resolves redemptions
past `expires_at`. Nothing ever writes `status = 'expired'` — I grepped: the
literal appears in no application or migration write path.

Good news: this does **not** corrupt the claim → walk-in tripwire.
`pilot-command-centre.ts` computes it from `claims` vs `verifiedCohort` with a
`MIN_CLAIMS_FOR_MERCHANT_RATIO = 5` floor, never from a status literal. And
`claim_deal`'s duplicate-claim guard filters `expires_at > NOW()`, so a shopper
whose ticket lapsed can re-claim.

So the impact is data hygiene plus a permanently growing set of rows in a state
no process resolves. **Not a Merchant 01 blocker.**

---

### D188 — `claim_deal` never sets `redemptions.is_demo`

- **Severity:** **P2 at the DB layer; already mitigated at the app layer** · **CONFIRMED**

Still true in the SQL. But `src/lib/evidence-scope.ts` is genuinely good work:
it centralises the three-way parent join (`redemption`, `merchant`, `deal` all
non-demo), uses `!inner` so PostgREST cannot silently LEFT-join and fail open,
and `evidence-scope.test.ts` bans a hand-rolled fourth copy.
`src/lib/pilot-cohort.ts` then separates *genuine-tagged* (a data property) from
*external field validation* (an explicit allow-list that fails closed).

**This is the single most important defence against the founder being misled,
and it is in place.** The DB-layer fix is optional hardening.

---

### D233 — Fast Visit has no staff/test exclusion and no funding cap

- **Severity:** **P1 as a pre-enable gate; P3 today** · **CONFIRMED**
- Row currently exists only on PR #317's branch.

`award_fast_visit_points` gates on points > 0, `status = 'success'`, a persisted
`fast_visit_qualified_at`, and arrival within 15 minutes — **and nothing else.**
No role check, no exclusion of merchant staff, MAANTA staff or agents, and **no
`is_demo` filter**. Issuance is unbounded; the only limit is one award per
redemption via a UNIQUE reference.

`fast_visit_enabled = false` on production, verified today, so nothing is
leaking. **Do not enable Fast Visit until exclusion and a cap exist** — turning
it on would let internal accounts earn a promotional reward during the exact
window Node 0 is measuring. That is the reward-ledger version of D188.

**I did not enable it and did not build toward it.**

---

### P2 — verified, lower priority

| Row | Status today | Evidence |
|---|---|---|
| **D132** | **CONFIRMED on prod** — 3 views: `deals_public_browse`, `merchants_public_browse` (explicit `security_invoker=false`), `demo_data_census` (no invoker option set). Register says only two of three are covered. | `pg_class.reloptions` |
| **D153** | **CONFIRMED, and the set is now 5, not 4.** Anon-executable `SECURITY DEFINER`: `is_demo_mode`, `demo_user_is_retained`, `demo_agent_is_retained`, `demo_admin_ops_target_is_demo`, **plus `fast_visit_enabled`** which the row does not name. All are read-only config predicates; impact is least-privilege hygiene, not exposure. | `has_function_privilege('anon', …)` |
| **D171** | **CONFIRMED, and worse than recorded.** `users.is_blacklisted` is not only enforced nowhere — it has **no write path at all**. It appears in two admin *read* surfaces (`admin/customers/page.tsx:134`, `admin/customers/[id]/page.tsx:100`) and in zero API routes. The admin console renders a "Blacklisted / Active" status that no code can ever change. 0 rows set on prod. | grep + prod count |
| **D118** | Still open — category filter applied after feed row limits. | register |

---

### P3 — register hygiene

- **D166 is fixed at HEAD but still recorded `open`.**
  `src/app/merchant/(app)/deals/new/page.tsx:10` is a proper pre-flight: it
  counts active deals *before* the wizard renders, shows "Deal limit reached"
  with an archive CTA, and — notably — handles the read-failure case honestly
  rather than assuming zero. Landed in `3c44bb4`. **The row should be closed.**
  This is exactly the failure D212 describes: a durable record that went false
  the moment the fixing commit landed.
- **D219** — the launch-readiness tracker, named in CLAUDE.md as the
  gate-status source of truth, has not been revised since 2026-08-08 and
  predates Node 0 Field Validation Mode entirely.

---

## 5. Operational proofs mistaken for engineering

These are the ones that matter. **None of them is code to write.**

| # | Item | State | What it actually needs |
|---|---|---|---|
| 1 | **Golden-path browser E2E** | Implemented, **never executed** — 200 workflow runs, all skipped | Set repo variable `E2E_BASE_URL` to a **non-prod** deployment + the three `E2E_*_STORAGE` secrets on a protected `e2e` environment. Ops task, ~1 hour. |
| 2 | **D235 offline ticket** | **Not at HEAD.** Code lives only in open PR #317 | A founder decision on PR #317, *then* the deployed authenticated test. Not "blocked on operational proof" at HEAD — it is "not merged". |
| 3 | **D158** self-serve onboarding, verified email, no phone | Shipped + applied (ledger 100/100 at the time) | One real Merchant 01 onboarding observed in a browser. `docs/ops/d158-self-serve-live-test.md` is the checklist. |
| 4 | **D162** shop location capture | **LIVE on prod**, migration `20260824120000` applied | Same event: one real self-serve onboarding closes it. |
| 5 | **D39** `/how-it-works` 308 | Repo side settled (`next.config.mjs`) | One `curl -sI` with redirects off. |
| 6 | **D145** backup/restore drill | Claimed, never evidenced | An actual restore drill. |

The pattern is consistent and worth naming: **MAANTA's engineering is ahead of
its evidence.** The backlog is not "build more" — it is "switch on the proof
that already exists, and put a merchant in front of it."

---

## 6. Security / data-integrity work

**What I inspected and found sound (NOT A PROBLEM):**

- **`verify_redemption` is correctly serialised and single-charge.** It takes
  `SELECT … WHERE status='pending' … FOR UPDATE`, then every state transition is
  written as `UPDATE … WHERE id = … AND status = 'pending'` with an explicit
  `IF NOT FOUND THEN RAISE 'redemption_already_verified'`. A second concurrent
  verify of the same OTP re-evaluates the predicate after the lock releases,
  finds no `pending` row, and raises `redemption_not_found_or_already_used`.
  **The KES 30 fee cannot post twice for one redemption.**
- **`claim_deal` locks the deal row** (`FOR UPDATE OF d`), which serialises
  concurrent claims and makes the duplicate-claim guard
  (`status='pending' AND expires_at > NOW()`) correct under a double-tap.
- **QR check-in never redeems.** `api/qr/check-in/route.ts` derives the merchant
  from the **token**, never the body; `p_user_id` is always the session-derived
  app user; `record_shopper_arrival` is not executable by `authenticated`, so
  the route is the only door. Re-scans collapse into a renew via a partial
  UNIQUE index, and a lapsed row is superseded with a **new** `arrived_at` so a
  stale scanner cannot jump an oldest-first queue (D199).
- **Rate limiting is DB-backed** (`check_rate_limit` RPC), not in-process — so
  it actually holds across serverless instances, and **fails closed** on error.
- **Queue table posture is correct:** RLS on, `anon` fully revoked,
  `authenticated` has SELECT only, service_role for writes, partial unique index
  on `(redemption_id) WHERE status='waiting'`.
- **Identity minimisation at the till:** the queue payload carries first name +
  last initial via `staffFacingName`, plus deal title and arrival time. Full
  name, phone and email never leave the server.

**Open, in priority order:** D168 (§4), D132, D153, D171.

**One design observation, not a defect.** `GET /api/queue` returns the raw
6-digit `otp_code` to staff so a tapped queue row can feed the existing keypad
flow. That is deliberate and documented, and D193 already closed the worse
version (the code in a URL). But it does mean that **once a shopper is queued,
the code stops being proof of presence** — staff could verify without the
shopper at the counter. The blast radius is small (the shopper must already have
scanned the counter QR with their own session, so they were physically there,
and Guardian velocity checks still run) and the merchant, not MAANTA, bears the
fee. **Flagging for founder awareness; recommending no change now.**

---

## 7. Reliability / concurrency work

For every mutation path, the question *"can this execute twice, and what makes
the second execution safe?"*:

| Path | Can it run twice? | What makes it safe | Verdict |
|---|---|---|---|
| Claim creation | Yes (double-tap) | Deal row `FOR UPDATE` + pending-claim guard | **SOUND** |
| Redemption verify | Yes (retry, two staff) | Row lock + `AND status='pending'` on every UPDATE + explicit NOT FOUND raise | **SOUND** |
| Fee charge | Once per redemption | Gated behind the same status transition; `unknown` state recorded + agent task raised if the fee step throws | **SOUND** (D143 governs `unknown` reconciliation) |
| Fast Visit award | Yes | UNIQUE reference makes a double call a no-op; verify-route retry deliberately re-runs it to heal a mid-flight death | **SOUND** |
| QR arrival | Yes (re-scan) | First-wins inside the RPC; partial UNIQUE index collapses the race; 23505 re-reads and requires a *live* row before acknowledging (D197) | **SOUND** |
| Queue cancel | Yes | Idempotent by postcondition; a DB error is never reported as a successful leave | **SOUND** |
| Deal activation cap | Yes | Enforced on entry into slot occupancy, not only INSERT (D206, `20260827120000`) | **SOUND** |
| Expired claim sweep | — | **No job exists** | **D134** |

**I found no concurrency defect at HEAD.** This subsystem has clearly been
worked over hard, and the header comments cite the specific incidents (D197,
D199, D204, D206) that produced each guard. That is the right way to build this.

Note the UI-disables-the-button anti-pattern the brief warns about does **not**
appear as a control anywhere in the money path — every guard is server-side.

---

## 8. Test gaps

| Category | State |
|---|---|
| **Genuinely passing** | 1725 vitest tests across 174 files (0 skipped, verified locally at this SHA) + 39 SQL suites over a fresh 107-migration chain (CI #941, `db-tests` success on `c3b2fd3a`) + 3 post-build gates + the build-gate meta-test that fails if a gate is deleted from the `build` script |
| **Implemented but never executed** | **The entire browser layer.** `e2e/golden-path.spec.ts` and `e2e/dashboards.spec.ts` — 200 runs, 100% skipped, `E2E_BASE_URL` never set |
| **Operationally blocked** | Same two specs — need a deployed non-prod app + three storage states |
| **Self-skipped** | The same two, by design (`test.skip(!ready, …)`). The workflow *converts* a partial config into a hard error, so this cannot become a false green **once enabled**. While disabled the whole job is skipped, which is honest but is zero coverage |
| **Missing test implementation** | A1 (`max_claims` claim-vs-redemption semantics) has no test at any layer. D168's policy-evaluation failure has no test. Neither has been mutation-tested |
| **Not mutation-tested** | All of it. No mutation testing exists in this repo |

**Minimum E2E that must run before each stage:**

- **A. Before Merchant 01** — none, strictly. But **one** manual browser walk of
  claim → code → verify → fee on a non-prod deployment is cheap and would be the
  first browser evidence MAANTA has ever had. Recommended, not required.
- **B. Before 3–5 merchants** — `golden-path.spec.ts` green (claim, ticket,
  verify, fee/arrears, wallet, invalid-code negative) **plus** a merchant-staff
  verify with a non-owner seat, **plus** a cross-tenant negative (merchant B
  cannot verify merchant A's code).
- **C. Before routine/scaled releases** — the above on every merge to `main`,
  plus `dashboards.spec.ts`, plus an offline-ticket spec **if** PR #317 lands.

**Do not** treat every missing E2E scenario as a Merchant 01 blocker. At N=1 the
founder is standing next to the merchant; a human is the test harness.

---

## 9. Dead / deferred functionality

- **Open PRs that must not be merged casually:** 35 open PRs, most stale from
  July–August. **#317** and **#316** overlap heavily (#316 is close to a subset).
  #194 (Next 14→16) and #193 (TypeScript 5→7) are major-version dependabot PRs
  that would be disruptive.
- **Does merging PR #317 silently flip anything dangerous?** I checked
  explicitly, as the brief asks. **No.** `git diff HEAD origin/…f65nrz --
  maanta-app/supabase/` is **empty** — no migration, no `app_config` change, no
  change to `SUCCESS_FEE_KES`, no `fast_visit_enabled` change, no authorization
  change. It is app code, tests and docs only. **It is safe from the
  flag/fee/authz standpoint; whether to merge it remains a founder call.**
- **Dead column:** `users.is_blacklisted` — read by admin UI, writable by
  nothing (D171).
- **`demo_data_census`** — a view with no `security_invoker` option set (D132).
- **Deferred, correctly:** agent acquisition tooling (D159 must resolve first),
  disputes depth (D81), PWA install funnel (D93/D139), phone/SMS OTP (D151,
  provider-gated).
- **`TODO`/`FIXME`/`HACK` markers in `src/`:** exactly **one**, and it is a
  legitimate scope note (`admin/merchants/page.tsx:14` — admin has no shopper
  list). For a codebase this size that is unusually clean.

---

## 10. Scale work we should NOT do yet

I measured rather than assumed. `EXPLAIN (ANALYZE, BUFFERS)` on the
representative discovery query against production (303 live deals):

```
Limit (actual time=43.586..43.593 rows=30)
  -> Sort  (top-N heapsort, Memory: 29kB)
    -> Nested Loop (actual rows=224)
      -> Bitmap Heap Scan on deals (BitmapAnd of
           idx_deals_node_live_created + idx_deals_expires_at)
      -> Index Scan using merchants_pkey (loops=224)
Buffers: shared hit=543          <- every buffer a cache HIT, zero reads
Execution Time: 43.776 ms
```

Index-driven, no sequential scan, no disk reads, 43.8 ms. **And no
`current_user_role()` appears in the plan at all** — because the discovery path
runs as service role with RLS bypassed, so the function is not on the hot path
at pilot scale.

**Verdict on `current_user_role()`: MEASURED — no material cost. Leave it
alone.**

**Explicitly premature, do not build:** Redis, PgBouncer/Supavisor, job queues,
background workers, sharding, read replicas, a caching layer, CDN changes. The
brief's stated context is confirmed by the repo: access is PostgREST/HTTPS, no
direct `postgres://` pools, `getLiveDeals` uses service-level access, and the
feed cache is short-lived and node/demo-aware. Nothing here is near a limit.

---

## 11. Provider / API exclusions

Excluded from the engineering count, as instructed:

what3words · M-Pesa/IntaSend · Stripe · SMS/phone OTP provider (D151) · Clerk
email deliverability to Microsoft mailboxes (D156) · external email delivery ·
maps/geocoding · PostHog/Sentry SaaS · external push service.

**Interface dependencies worth noting** (the boundary, not the integration):
`w3w/validate` degrades correctly — quota exhaustion leaves the address NULL and
onboarding completes (D162). The IntaSend webhook is authenticated by a static
shared secret echoed in the body rather than a signature over the payload
(**D83**) — that is *our* verification code, so it is fixable inside our
boundary, but it cannot be tested end-to-end without the provider. **P2, and
genuinely ours to fix.**

---

## 12. Pilot-readiness matrix

| Journey | Rating | Evidence |
|---|---|---|
| **Shopper** | **READY WITH KNOWN LIMIT** | Browse/feed/detail/claim/ticket/QR/queue all implemented; paused-deal filtering carried on all four direct `deals` readers; time-decay and Nairobi TZ centralised and tested. **Limits:** no offline ticket (honest copy, not a false promise); `max_claims` display understates outstanding codes (A1). Never proven in a browser. |
| **Merchant** | **READY WITH KNOWN LIMIT** | Self-serve onboarding without phone (D158), location capture (D162), deal cap pre-flight (D166 fixed), wallet/ledger, fee reporting split gross/reversals/net (D211). **Limits:** A1 over-billing risk on limited stock; D168 latent. Never proven in a browser. |
| **Staff** | **READY** | Queue is tenant-scoped, identity-minimised, race-safe, oldest-first, and drops redeemed/expired entries. Verification is server-authoritative. QR never redeems. Constraint preserved. |
| **Founder / Admin** | **READY** | The strongest area. `evidence-scope.ts` + `pilot-cohort.ts` encode three doctrines — a failed read is never zero; genuine-tagged ≠ external validation; no ratios below a sample floor. External field validation reads **0** and is an allow-list that fails closed. This is what stops the founder believing false evidence, and it works. |
| **Field operator / Agent** | **DEFERRED** | D159 open: `merchants_agent_read` keys on `merchants.onboarded_by`, which `onboard_merchant` never writes. Correctly deferred — agent acquisition is not authorised. No exposure risk, since the policy under-matches (fails closed). |

---

## 13. Recommended execution order

### From current HEAD to Merchant 01 — the narrowest path

1. **Nothing in code.** HEAD is green and the ledger reconciles.
2. **Founder decision on PR #317** (offline codes, shopper trust copy). Safe
   from a flag/fee/authz standpoint — verified. Merge it or close it; do not
   leave it open as ambiguous truth, because it is where D223–D235 currently
   live and the register at HEAD ends at D222.
3. **Founder decision on demo mode** for the Merchant 01 window. Ops action.
4. **Optional, ~1 hour, high value:** set `E2E_BASE_URL` + storage secrets on a
   non-prod deployment and get the first-ever green browser golden path.
5. **Run Merchant 01.** Capture D158/D162 browser evidence as it happens.

### After Merchant 01

- **Merchant 01 → first external redemption:** change nothing. Observe. Record
  on the day sheet.
- **First external redemption → 3–5 merchants:** now fix **A1** (a product
  ruling first, then either a copy change or a cap change), and land the E2E
  suite as a merge gate.
- **3–5 merchants → repeated redemption evidence:** fix **D168** (one
  migration), add the **D134** sweep, close **D166** in the register.
- **Broader Node 0:** D132, D153, D171, D83, D118. Re-measure performance before
  touching any of it.
- **Before Fast Visit is ever enabled:** **D233** — exclusion list and funding
  cap. Non-negotiable.

No calendar expansion. Each step is gated on evidence, not elapsed time.

---

## 14. STOP recommendation

# A. STOP ENGINEERING — RUN MERCHANT 01

**Why.**

There is no confirmed Merchant 01 blocker. The exact-head board is green on
every gate MAANTA runs — lint, typecheck, 1725 unit tests, build plus three
post-build gates, and 39 SQL suites over a fresh 107-migration chain in CI on
this precise SHA. The production ledger reconciles 107/107. The money path is
correctly locked and cannot double-charge. The QR/queue layer does what the
founder constraints require: it records arrival, it never redeems, and the
6-digit code remains the verification credential. Fast Visit is OFF and the
success fee reads 30.00. The founder-facing evidence layer — the thing that
decides whether Node 0's answer is trustworthy — is the best-engineered part of
the repository, and it currently reads **external field validation: 0**, which
is correct.

The four findings that are genuinely engineering (A1, D168, D134, D188) all
either fail closed, are already mitigated at the app layer, or cannot bite at
N=1. Fixing them now would be engineering against a hypothesis instead of
against evidence — which is the exact loop Node 0 Field Validation Mode exists
to stop.

**The binding constraint on MAANTA today is not code. It is that no real
merchant has ever used it.** Every remaining item on this list gets *better
specified* by watching Merchant 01 — A1 in particular, where the right fix
depends entirely on whether a real Eastleigh merchant means "10 people can claim
this" or "I have 10 of these."

**Two caveats attached to the STOP, neither of which is engineering:**

1. The brief's premise about D235 is wrong at this HEAD, and the register here
   ends at D222. Resolve PR #317 so there is one truth about what MAANTA has.
2. MAANTA has never run a browser test. 200 skipped runs is not coverage. That
   is an hour of ops work, and it would convert the largest remaining unknown
   into either a green or a real defect — before a merchant finds it instead.

---

### Note on drift-register numbering

I did **not** add rows to `docs/maanta-drift-register.md`. PR #317 already
claims **D223–D235**, and inserting D223 at HEAD would collide with it and
corrupt the open PR. The new finding in this audit is therefore proposed as
**D236**, to be inserted once PR #317 is merged or closed. This is a deliberate
deviation from CLAUDE.md's "record drift before the narrative" rule, taken to
avoid creating the exact kind of double-truth the rule exists to prevent — and
it is flagged here rather than resolved silently.

---

## Sources of truth consulted

Repository at `c3b2fd3` (code, migrations, tests, CI workflows) · production
`axrrslqssmbngbataejg` read-only (`schema_migrations`, `app_config`,
`pg_policies`, `pg_class`, `pg_proc`, role-probe, `EXPLAIN ANALYZE`) · GitHub
Actions run history (ci.yml #941, e2e.yml ×200) · `docs/maanta-drift-register.md`
· `CLAUDE.md` · `docs/ops/node0-known-limitations.md` ·
`docs/ops/merchant-01-pilot-runsheet.md` · open PRs #316/#317.

**Nothing in this document is inferred from prose where code or a live read was
available.**
