# MAANTA MERCHANT 01 ENGINEERING COMPLETION

**Date:** 2026-09-03
**Branch:** `claude/maanta-audit-merchant-01-a67nk2`
**Baseline SHA:** `d78f266` (the audit commit)
**Working tree at report time:** clean after commit; all work is on this branch.
**Authority:** founder ruling *"FOUNDER AUTHORISATION — MAANTA MERCHANT 01
ENGINEERING COMPLETION"*, 2026-09-03, which supersedes the audit's
STOP ENGINEERING verdict.

---

## Completed

| # | Item | Outcome |
|---|---|---|
| 1 | **D236 / register D223** — `max_claims` capped redemptions, not claims | **FIXED.** Enforced atomically at claim issuance. Concurrency proven under 40-way contention; mutation-tested twice |
| 2 | **D171** — blacklist was a label with no lever | **COMPLETED.** Enforced in `claim_deal`, admin write path, self-clear blocked, audited. Mutation-tested |
| 3 | **D168** — ten tenant RLS policies error instead of filtering | **CLOSED ON EVIDENCE.** Root-caused, repaired without restoring the `merchants` grant, cross-tenant proven |
| 4 | **D166** — recorded open, already fixed | **CLOSED.** Verified at HEAD, register corrected |
| 5 | **D134** — ten stale pending redemptions | **DIAGNOSED, not "fixed".** All ten are demo artefacts. Root cause is a doc/schema mismatch, opened as **D224** for a founder ruling |
| 6 | Race loser saw a live Claim button under a sold-out message | **FIXED.** The deal re-renders in its true state |
| 7 | **Local fresh-chain DB harness** | **BUILT.** The audit could not run `db-tests`; this session ran the full chain and every SQL suite locally |

**Three migrations written. None applied to production.**

- `20260903120000_claim_allocation_cap.sql` (D236)
- `20260903130000_enforce_user_blacklist.sql` (D171)
- `20260903140000_repair_merchant_tenant_policies.sql` (D168)

---

## D236 — the claim allocation

### Exact semantics implemented

`max_claims` is **the maximum number of shopper claims that may be ISSUED**.
It is not a redemption cap and is never re-tested at redemption.

`deals.claims_issued` is the new counter and is backfilled from the rows
themselves. `claims_count` keeps its old meaning — verified redemptions — and
both are now labelled for what they are on every surface. The invariant is
exact and asserted globally:

```
deals.claims_issued = (SELECT count(*) FROM redemptions WHERE deal_id = d.id)
```

**The cap lives on a `BEFORE INSERT` trigger on `redemptions`, not only inside
`claim_deal`.** `claim_deal` is today's only issuance path, but a seed, an admin
script or a future RPC would otherwise break the merchant's promise. `claim_deal`
keeps a fast pre-check so the shopper gets `deal_claim_limit_reached` before any
OTP work, and so the same error comes back whichever layer refuses.

### Concurrency proof (founder INVARIANT B)

The check and the increment are **one statement**, so no read-then-write window
exists:

```sql
UPDATE public.deals SET claims_issued = claims_issued + 1
 WHERE id = NEW.deal_id AND (max_claims IS NULL OR claims_issued < max_claims);
IF NOT FOUND THEN RAISE EXCEPTION 'deal_claim_limit_reached'; END IF;
```

Measured on real PostgreSQL 16 with genuinely parallel sessions, all firing at
one wall-clock instant:

| Allocation | Simultaneous claimants | Granted | Denied | `claims_issued` | Rows |
|---|---|---|---|---|---|
| 1 | 10 | **1** | 9 | 1 | 1 |
| 1 | 12 | **1** | 11 | 1 | 1 |
| 2 | 25 | **2** | 23 | 2 | 2 |
| 3 | 30 | **3** | 27 | 3 | 3 |
| 4 | 40 | **4** | 36 | 4 | 4 |
| 5 | 40 | **5** | 35 | 5 | 5 |

The founder's exact scenario — one claim left, ten shoppers tap Claim — issues
**exactly one** code. Nine get `deal_claim_limit_reached` and a stated sold-out
screen, not a shortage discovered at the counter.

**Mutation-tested twice, because a passing concurrency test proves nothing until
you have seen it fail:**

| Mutant | Result |
|---|---|
| Trigger removed (leaving only `claim_deal`'s pre-check) | **10 codes issued for 1 slot** — the original defect, reproduced |
| Trigger present but non-atomic (read-then-write) | Passed via `claim_deal` (its row lock masks it), then **issued 15 codes for 1 slot** under direct concurrent INSERTs |

That second mutant is the important one: it shows the `claim_deal` race test
alone would have been a false green, which is why the direct-insert race exists.

### Editing proof (INVARIANT D)

Lowering the allocation **to** the issued count is allowed — that is the
merchant's stock lever. Lowering it **below** is refused in two places:
`deals_claims_issued_within_allocation` at the database, and
`/api/deals/[id]` in the API so the merchant reads a sentence naming the real
number rather than a 500. The API also translates the constraint's own error,
because a claim can land between the read and the write.

No claim is ever cancelled by an edit (INVARIANT C, scenario D).

### Pause proof (INVARIANT F)

Pause blocks new claims, cancels nothing, and a claim refused by pause does
**not** consume a slot. An already-issued ticket still verifies (scenario F).

### Shopper exhausted-state proof

`/deals/[id]` computes claimability and "fully claimed" from `isFullyClaimed`,
which reads `claims_issued`. The card KPI's "N left" reads the same counter —
it previously read `claims_count` and so said "12 left" on a deal whose forty
codes were all already issued. An exhausted allocation returns HTTP 410 with
`code: "deal_claim_limit_reached"` and the sentence *"This deal is fully
claimed."* — a stated state, never a server error, and it never says "try again".

Race losers additionally get the page corrected under them: the response is
marked `stale`, and the claim flow calls `router.refresh()` so the sold-out
state, the claim count and the button stop contradicting the message. `stale`
is deliberately **not** set for a transport failure or an unknown outcome —
refreshing there would replace an honest *"check My Deals before trying again"*
with a page that looks claimable and invites a double claim.

### Existing-claim preservation proof

Scenario C: with the allocation exhausted, an already-issued claim still
verifies `success`, still charges KES 30 exactly once, and still lands in the
ledger (balance 500 → 470). **There is no second stock rejection at the counter**
(INVARIANT G) and fee economics are untouched (INVARIANT H).

### The one question deliberately left open (INVARIANT J)

**Does an expired or rejected claim release its slot?** Today it does **not** —
allocation is consumed at issuance. The rows still exist, so they still count.
The only decrement is on hard `DELETE`, which is bookkeeping for the demo wipe,
not a lifecycle rule.

The ruling does not settle this and the audit method forbids inventing it, so
scenario G is the *written record* of today's behaviour: if the founder later
rules that no-shows hand capacity back, that test is the one place to start.

---

## D171 — the blacklist

**What it means.** `users.is_blacklisted` is the shopper-side twin of
`merchants.is_shadow_banned`, which is already gated in the same RPC. That is
option (a) from the D171 register row — the semantics the column always had, not
a new product rule.

- **Prevents:** issuing a NEW claim. `claim_deal` raises `user_blacklisted`.
- **Does NOT prevent:** redeeming a code the shopper already holds.

The second half is deliberate. Verify-anyway is a frozen rule, and a blacklist
applied while someone is walking to the shop must never become a merchant
arguing at a till about a code MAANTA itself issued. Counter-side abuse stays
Guardian's job. Scenario G asserts that `verify_redemption` provably does not
consult the flag, so a future change cannot quietly break the frozen rule.

**Write path.** `POST /api/admin/customers/[id]/ops`, built on the same shape as
the merchant ops route: `requireAdminApi` for authority, service client for the
write, `logAdminOp` for the record. It refuses to blacklist an admin's own
account, and refuses non-shopper roles — "issue no more deal codes" says nothing
coherent about a merchant login.

**Authorization.** Server-side only; the caller's role is resolved from their
session and never read from the request body. `prevent_self_blacklist_change`
closes the hole the register itself flagged: `users_own_row` grants a shopper
ALL on their own row, so without it a blacklisted shopper could clear their own
flag through PostgREST. The trigger is scoped to `is_blacklisted` **alone** —
`role` is already owned by `prevent_self_role_escalation`, and re-checking it
would be a second place for one rule to drift.

**Auditability.** `admin_ops_log`'s `target_type` CHECK did not allow `'user'`.
Since `logAdminOp` is best-effort and swallows its error, the block would have
applied with **no record of who applied it**. The CHECK is extended and the
app-side union with it.

**Tests.** `supabase/tests/user_blacklist_enforcement_test.sql` (7 scenarios),
`src/app/api/admin/customers/[id]/ops/__tests__/route.test.ts` (8 tests),
`src/lib/__tests__/user-blacklist.test.ts` (9 tests).

Mutation-tested: dropping the self-change trigger fails scenario D
(*"a blacklisted shopper cleared their own flag"*); removing the claim gate
fails scenario A (*"the control is decorative again"*).

---

## D168 — tenant policies

### Root cause

An RLS predicate is evaluated as the **invoking** role. D147 deliberately
revoked base-table `SELECT` on `merchants` from `anon` and `authenticated`, so
from that migration onward the shared subquery
`merchant_id IN (SELECT id FROM merchants WHERE user_id = current_user_id())`
could no longer read the table it names. Evaluating it as `authenticated` raises
`42501` — the query fails outright instead of filtering.

Reproduced on production **and** on a fresh chain built from this repository, so
it is a defect in the migration chain, not production drift.

### Ten-policy disposition

| Table · policy | `authenticated` privilege | State | Now |
|---|---|---|---|
| `redemptions.redemptions_merchant` | SELECT | **LIVE — reproduced 42501** | repaired |
| `merchant_transactions.transactions_merchant` | SELECT | **LIVE — reproduced 42501** | repaired |
| `pending_topups.pending_topups_merchant_read` | SELECT | **LIVE — reproduced 42501** | repaired |
| `archive_history.archive_merchant` | none | dormant | repaired |
| `boost_flags.boost_flags_merchant` | none | dormant | repaired |
| `deals.deals_merchant` | none | dormant | repaired |
| `kpi_counters.kpi_merchant` | none | dormant | repaired |
| `merchant_staff.staff_owner_manage` | none | dormant | repaired |
| `reporting_aggregates.reporting_merchant` | none | dormant | repaired |
| `tier_flags.tier_flags_merchant` | none | dormant | repaired |

The register recorded **four**; the real count is **ten**, of which **three**
are reachable today. The seven dormant ones are repaired too — they are dormant,
not safe, and the trap re-arms the moment any of them is granted.

**Nothing leaked.** The failure is a hard error, and every live merchant surface
reads through the service client with an app-layer `merchant_id` predicate.

### The fix, and why it is not a grant

`public.current_user_merchant_ids()` — a `SECURITY DEFINER` helper returning the
ids of shops the caller owns. Safe because it **takes no arguments** (a caller
cannot aim it at anyone else), filters on `current_user_id()` internally,
returns **bare uuids** so no merchant column is reachable through it, and grants
`anon` no EXECUTE. Every policy keeps its exact prior command, admin and role
clauses; only the id source changed.

**The founder's security requirement is met and tested: the `merchants` grant
was NOT restored.** Scenario F asserts `authenticated` still has no SELECT on
`merchants` or `deals`, and it is mutation-tested — "fixing" D168 by granting
that SELECT **fails the suite**, exactly as the ruling demanded.

### Cross-tenant proof

Two real tenants plus a bystander shopper: the owner sees exactly their own
ledger row (1), sees **zero** of the other tenant's, and a plain shopper sees
**zero**. Mutation-tested: restoring one old policy fails scenario A.

**D168 is CLOSED on evidence.**

---

## D166 — register reconciliation

Verified fixed at HEAD. `src/app/merchant/(app)/deals/new/page.tsx` counts
active deals **before** the wizard renders, shows "Deal limit reached" with an
archive CTA, and — better than the row asked — treats a failed count as
*unavailable* rather than assuming zero. Landed in `3c44bb4` (PR #282).

The row stayed `open` for eleven days after the defect was gone. That is exactly
**D212**: a durable record that goes false the moment the fixing commit lands.
**Closed.**

---

## D134 — the ten stale pending redemptions

**Cause: not a lifecycle failure. A documentation/schema mismatch.**

Re-measured on production 2026-09-03, joined through both parents:

- **10** rows are `pending` with `expires_at` in the past.
- **All ten are claims against demo merchants and demo deals** — two seed rows,
  eight made through the product against the demo marketplace (the D188 pattern:
  `claim_deal` never sets `is_demo`).
- **Zero genuine shopper claims are stranded.**

And the framing itself was wrong. `redemptions.status` is constrained to
`pending`, `success`, `failed`, `flagged` — **there is no `expired` status**,
nothing has ever written one, and a no-show is *represented* as a `pending` row
past its expiry. So there is nothing to sweep **to** without adding a status
value, which would be inventing metric and inventory semantics nobody has ruled
on. The funnel is unaffected: `lib/pilot-command-centre.ts` computes it from
claims vs `verifiedCohort`, never from a status literal.

**No sweep was written and no production row was touched.** Deleting demo
artefacts would have destroyed the only evidence of how they arose.

The residual gap is real but small, and is now **D224** for a founder ruling: a
no-show who never returns ends `pending`, while a no-show who tries a lapsed
code at the counter is set to `failed` by `verify_redemption` — two terminal
states for one situation. Recommendation: accept `pending` + past expiry as
canonical and correct the protocol's wording.

---

## PR #317 — D223–D235 classification

Reviewed from the actual diff. Merge-base is `c3b2fd3`; the true net difference
is **37 files**, and it contains **no migration, no `app_config` change, no fee
change and no authorization change** — verified: `git diff HEAD <branch> --
maanta-app/supabase/` is empty.

| Row | Subject | Classification |
|---|---|---|
| D223 | Boosted rail described as earned to shoppers, bought to merchants | **MERGE BEFORE MERCHANT 01** — a paid-placement disclosure defect on a live surface |
| D224 | "Ranked by who actually walked in" stated site-wide, true of one rail in three | **MERGE BEFORE MERCHANT 01** — the load-bearing trust claim |
| D225 | Flash windows advertised "often under an hour"; slider minimum is 1h | **MERGE BEFORE MERCHANT 01** — unachievable promise |
| D226 | Homepage gives three accounts of feed ranking in one scroll | **USEFUL DURING CONTROLLED PILOT** |
| D227 | Deal card shows the SHOP's all-time verified count labelled as the deal's | **MERGE BEFORE MERCHANT 01** — a shopper-visible trust defect |
| D228 | Rail 3 reordering by proximity | **DO NOT MERGE** — reverses the standing D77 ruling and rests on a location the app does not collect. Correctly left open |
| D229 | "See all" destinations with sort controls | **DEFER** — spec only, no code |
| D230 | Ten feed analytics events | **DEFER** — spec only, no code |
| D231 | Deal-level verified redemption metric | **DEFER** — precondition for D227's long-term fix, not for Merchant 01 |
| D232 | Storefront deep link + favourite notifications | **DEFER** — spec only |
| D233 | Fast Visit has no staff/test exclusion and no funding cap | **DEFER as work; HARD GATE as a rule.** Must be satisfied before `fast_visit_enabled` is ever set true. Not touched here |
| D234 | Push permission requested for a stream nothing sends | **MERGE BEFORE MERCHANT 01** — asking for a permission MAANTA cannot honour costs trust once |
| D235 | PWA offline resilience | **USEFUL DURING CONTROLLED PILOT** — see below |

### D235 specifically

The implementation is sound on inspection. `public/sw.js` intercepts **GET
only**, **same-origin only**, never touches `/api/`, caches exactly one document
(`/my-deals`) network-first, falls back to an honest `/offline` page, and posts
a purge on sign-out so a shared handset cannot reload its way to the previous
shopper's codes. It explicitly declines to fake offline claiming or redeeming.

**Two caveats to carry, not to resolve here.** The sign-out purge is
client-initiated, so a session abandoned without signing out leaves a cached
document containing codes on that device. And the evidence distinction stands
exactly as the founder stated it:

> **service-worker harness proof ≠ authenticated `/my-deals` offline proof.**

Nothing in this session ran the credentialed deployed test, so **no claim of
authenticated offline ticket presentation is made.**

### The D-number collision — needs a decision

PR #317 assigns **D223–D235** on its branch. This session assigned **D223** and
**D224** on `main`'s line, because `drift-register.test.ts` enforces strict
contiguity and D222 is the last row at HEAD — D236 would have left a
thirteen-row hole and failed CI.

The code and migrations here cite **D236**, the identifier the founder's ruling
uses; the register row is **D223** and records the alias explicitly. This is the
precedent **D172** already set for a Notion collision ("the repo is canonical for
drift IDs").

**Whoever merges PR #317 must renumber its thirteen rows.** This is mechanical,
but it will not resolve itself and it is not safe to leave ambiguous.

### Merge conflicts to expect (textual, not semantic)

PR #317 and this branch both touch `src/lib/data.ts`,
`src/components/ui/claude/deal-kpis.tsx`, `src/app/(shopper)/deals/[id]/page.tsx`
and `src/app/(shopper)/feed/page.tsx`. The changes are **independent**: PR #317
edits the `verifiedCount` label and adds `BOOST_WINDOW_HOURS`; this branch edits
the scarcity KPI and adds `claims_issued`. Both should survive; neither
overwrites the other's intent.

---

## Browser E2E — what has ACTUALLY executed

| Suite | Status | Why |
|---|---|---|
| `e2e/golden-path.spec.ts` | **BLOCKED ON OPS** | Needs a deployed non-prod `E2E_BASE_URL` + shopper/merchant storage states |
| `e2e/dashboards.spec.ts` | **BLOCKED ON OPS** | Needs `E2E_ADMIN_STORAGE` |
| `e2e-sw/service-worker-offline.spec.ts` (PR #317) | **NOT RUN** | On an unmerged branch; not merged, so not run |
| `e2e/offline-ticket.spec.ts` (PR #317) | **BLOCKED ON CREDENTIAL** | Needs a deployed app AND a shopper holding a real active claim |
| Vitest (177 files) | **PASSING** | Ran here, this SHA |
| SQL suites (42) | **PASSING** | Ran here on a fresh 110-migration chain |

**Nothing skipped has been converted into green.** The `e2e.yml` workflow has
now recorded 200 runs, every sampled one `skipped`; that number is unchanged by
this session because no browser test was run.

### What could NOT be done from this environment, and honestly why

The golden path drives a **real** claim and a **real** KES 30 redemption. It
needs a deployed app with a live Supabase and Clerk — which this container does
not have, and which cannot be substituted without fabricating credentials or
weakening authentication. Both are forbidden and neither was attempted.

### Exact minimal ops steps to unblock (one person, ~1 hour)

1. Deploy a **non-production** MAANTA instance (Vercel preview against a
   non-prod Supabase). It must not be `maanta.app` — `e2e.yml` refuses that host
   before checkout, because the suite charges real fees.
2. Repo → Settings → Environments → create `e2e`, add required reviewers.
3. Repo → Settings → Secrets and variables → Actions:
   - Variable `E2E_BASE_URL` = the deployed non-prod origin
   - Variable `E2E_ALLOWED_HOST` (optional but recommended) = that host
   - Environment secrets on `e2e`: `E2E_SHOPPER_STORAGE`, `E2E_MERCHANT_STORAGE`,
     `E2E_ADMIN_STORAGE` — Playwright `storageState` JSON for each signed-in role
4. Seed one claimable deal on that instance and let the suite run on `main`, or
   dispatch it manually.

The workflow already **fails closed** on a partial configuration and asserts
from the Playwright JSON report that no spec silently skipped, so this cannot
turn into a false green once switched on.

---

## Merchant 01 experience

| Journey | Rating | Evidence |
|---|---|---|
| **Merchant** | **READY** | Self-serve onboarding without a phone (D158), location capture (D162), deal-cap pre-flight (D166, verified), a claim limit that now means what it says with claims/left/redeemed shown separately, pause and raise as working stock levers, an edit that refuses to contradict itself, KES 30 unchanged. Never proven in a browser |
| **Shopper** | **READY WITH KNOWN LIMIT** | Claim → 6-digit ticket → counter is intact; sold-out is a stated state and the page self-corrects for a race loser; paused-deal filtering holds on all four discovery surfaces. **Limits:** no offline ticket at HEAD (honest copy, not a false promise — D235 unmerged); never proven in a browser |
| **Staff** | **READY** | Queue is tenant-scoped, identity-minimised (first name + last initial), race-safe, oldest-first, drops redeemed and expired entries. QR never redeems. Verification is server-authoritative and cannot double-charge |
| **Founder / Admin** | **READY** | `evidence-scope.ts` + `pilot-cohort.ts` keep genuine-tagged separate from external validation, and a failed read is never a zero. The blacklist is now a real control with a real audit trail. External field validation still reads **0**, which is correct |
| **Field operator / Agent** | **DEFERRED** | D159 open; agent acquisition is not authorised. The policy under-matches, so it fails closed |

---

## Security / data integrity

- **Tenant isolation** — D168 repaired and adversarially proven: same-tenant
  reads work, cross-tenant returns zero, and D147's revokes are intact and
  guarded against being traded away.
- **Staff isolation** — unchanged. `requireMerchant("can_verify")` plus the
  app-layer `merchant_id` predicate; queue reads cannot cross tenants.
- **Shopper privacy** — unchanged. Queue payload is first name + last initial;
  full name, phone and email never leave the server.
- **Claim integrity** — materially improved. The allocation now binds at
  issuance, atomically, against every writer.
- **Redemption integrity** — deliberately untouched. `verify_redemption` still
  locks the row, still guards every transition on `status = 'pending'`, and
  still cannot charge twice. No stock rejection was added at the counter.
- **Ledger integrity** — untouched. Scenario C asserts 500 → 470 on one
  redemption, fee `charged`, exactly once.
- **Admin authority** — extended by exactly one action, server-resolved, audited,
  and unable to target the acting admin or a non-shopper.
- **Feature-flag safety** — nothing read or written. See the production section.

---

## Gates

| Gate | Result |
|---|---|
| `npm run lint` | **pass** — no ESLint warnings or errors |
| `npm run typecheck` | **pass** — `tsc --noEmit`, clean |
| `npm test` | **pass — 177 files, 1757 tests, 0 failed, 0 skipped** (from 174 / 1725) |
| `npm run build` | **pass** |
| `check:tokens` | clean |
| `check:canonicals` | clean |
| `check:forms` | clean |
| **SQL suites** | **42 / 42 pass** (from 39; three new suites) |
| **Fresh migration chain** | **110 migrations applied to an empty database, clean** |
| **Browser tests** | **NOT RUN** — blocked on ops credentials. Not counted as green |

### On the fresh-chain evidence

The audit could not run `db-tests` (no Docker). This session built a local
PostgreSQL 16 harness that applies the **entire** chain and runs **every** SQL
suite. It shims only the Supabase platform surface the migrations touch — roles,
`auth.role()`/`auth.uid()`, `storage`, and a `geography` domain (verified safe:
**no migration calls any PostGIS function**, the type is only ever a column or
parameter type).

It earned itself immediately: it caught a second `claim_deal` overload the
moment the D236 migration landed. That turned out to be a harness artefact —
production has exactly one overload, confirmed by direct read — but it is the
precise failure CLAUDE.md warns about for `onboard_merchant`, and it was caught
in seconds rather than at an apply.

CI remains the authority; this is a faster local mirror of it, not a replacement.

---

## Production

Explicitly confirmed, for this entire session:

- **No production writes.** Production was read **read-only** (`SELECT` and
  `EXPLAIN` only) to measure D134, D168, D171, D236 and the migration ledger.
- **No production migration applied.** All three new migrations exist only as
  files in `supabase/migrations/`, verified against a local fresh chain.
- **No production configuration changed.**
- **Fast Visit remains OFF.** `app_config.fast_visit_enabled` was **read** and
  reads `false`. It was not written. No migration in this session references
  `fast_visit_enabled`, `fast_visit_points`, `award_fast_visit_points` or
  `record_shopper_arrival`; no reward code was modified; **D233 was not
  implemented**. Verifiable: `grep -l fast_visit supabase/migrations/20260903*.sql`
  returns nothing.
- **No branch or PR merged.** PR #317 was fetched and read only.
- **`app_config.success_fee_kes` still reads `30.00`.** Untouched.

---

## Remaining work

### OPS BEFORE MERCHANT 01
1. **Provision the browser E2E** (steps above). The single highest-value hour
   available; converts the largest remaining unknown into a green or a real
   defect before a merchant finds it.
2. **Founder decision on demo mode** for the Merchant 01 window. It is ON.
3. **Founder decision on PR #317** — merge the five *before Merchant 01* rows at
   minimum, and renumber its D-rows.
4. **Apply the three migrations** under founder authorisation, then read back and
   repair the ledger. **Every MCP apply has minted its own version — twelve for
   twelve.** Expect three more and repair each to the repo filename first.

### EXTERNAL PROVIDER
what3words · M-Pesa / IntaSend · Stripe · SMS and phone OTP (D151) · Clerk email
deliverability to Microsoft mailboxes (D156) · maps/geocoding · PostHog/Sentry.
None blocks this package. **D83** (IntaSend webhook authenticated by a static
shared secret rather than a payload signature) is *our* code and remains ours to
fix, but cannot be tested end to end without the provider.

### DURING CONTROLLED PILOT
- **D224** — rule on the no-show representation (recommendation: accept
  `pending` + past expiry, correct the wording).
- **D188** — set `redemptions.is_demo` at the DB layer; the app layer already
  guards it correctly.
- **D162 / D158** — close on the first real self-serve onboarding.

### BEFORE SCALE
- **D172** — browser E2E as a merge gate.
- **D132** (three `SECURITY DEFINER` views), **D153** (five anon-executable demo
  predicates — the row names four; `fast_visit_enabled` is a fifth), **D118**,
  **D187**, **D83**.

### DEFERRED
- **D233** — **hard gate before Fast Visit is ever enabled.** Not work to do now.
- **D159** — agent acquisition tooling.
- **D228** — rail-3 reordering; contradicts the D77 ruling.
- D229–D232 — specified, not built.

---

## FINAL VERDICT

# READY FOR MERCHANT 01 WITH NAMED OPERATIONAL GATES

The three confirmed engineering defects the founder named are fixed, tested,
adversarially tested and mutation-tested, and all three were verified on a fresh
110-migration chain with 42/42 SQL suites and 1757/1757 unit tests green. The
money path is unchanged and still cannot double-charge. Tenant isolation is
stronger than it was this morning and D147's protections are intact and guarded.
Fast Visit is untouched and still OFF.

The gates are **operational, not engineering**, and there are three:

1. **The three migrations must be applied** under founder authorisation, with a
   ledger read-back and repair. Until then D236, D171 and D168 are fixed in the
   repository and **not yet true of production** — the claim cap in particular
   still does not bind on the live database.
2. **A decision on PR #317**, including renumbering its D-rows. Five of its
   thirteen rows are shopper- and merchant-visible honesty fixes.
3. **Browser E2E provisioning.** Not a blocker, but MAANTA has still never
   observed its own golden path in a browser, and Merchant 01 is a poor first
   place to discover why that matters.

Nothing here is merged to `main`. Awaiting founder review.
