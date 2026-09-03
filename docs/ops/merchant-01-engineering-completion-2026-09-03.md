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

> **Revised 2026-09-03 after founder ruling 2 (D134/D224).** The first
> implementation used a stored monotonic counter. That is now gone: allocation
> is **derived**, and an expired claim releases its slot.

### Exact semantics implemented

`max_claims` is **the maximum number of shopper claims that may be reserving a
deal at once**. It is not a redemption cap and is never re-tested at redemption.

Occupancy is computed, never stored. `claim_occupies_allocation(status, expires_at)`
is the one definition:

| Status | Holds a slot? | Why |
|---|---|---|
| `success` | **yes, permanently** | The unit was sold |
| `flagged` | **yes** | `admin_release_redemption` can still turn it into a success; releasing it would let the deal over-issue the moment an admin approves |
| `pending`, unexpired | **yes** | A live claim |
| `pending`, expired | **no** | The D224 ruling |
| `failed` | **no** | No money moved and no code can be honoured |

A stored counter was rejected deliberately: keeping one true as the clock moves
would require exactly the periodic sweep the ruling forbids, and would rewrite
historical evidence to do it. **Nothing is mutated; an expired claim row is left
exactly as it was and simply stops counting.**

The count reaches the application as `claims_reserved`, a PostgREST computed
column backed by the *same* function the trigger enforces with — so the UI's
"claims left" and the database's refusal cannot disagree. That was the original
defect in a different costume, and this closes it structurally.

**Enforcement is a `BEFORE INSERT` trigger on `redemptions`**, so the allocation
binds for any writer, not only `claim_deal`.

### Concurrency proof (founder INVARIANT B)

A derived count cannot use the single-statement `UPDATE ... WHERE` trick, so the
trigger **takes the deal row lock first and counts second**. Under READ
COMMITTED each statement takes a fresh snapshot, so a claimant that waited on
the lock counts a state that already includes the winner. `claim_deal` already
holds the same lock, so the ordering is identical on both paths — no inversion,
no deadlock.

Measured on real PostgreSQL 16 with genuinely parallel sessions:

| Allocation | Simultaneous claimants | Granted | Path |
|---|---|---|---|
| 1 | 10 / 12 / 20 | **1** | `claim_deal` |
| 3 | 30 | **3** | `claim_deal` |
| 5 | 40 | **5** | `claim_deal` |
| 1 | 15 | **1** | raw concurrent INSERT |
| 3 | 30 | **3** | raw concurrent INSERT |

**Mutation-tested three times**, because the atomicity argument changed with the
design and had to be re-earned:

| Mutant | Result |
|---|---|
| Trigger removed | **10 codes for 1 slot** — the original defect |
| Trigger present, non-atomic read-then-write | Passed via `claim_deal`; **15 codes for 1 slot** under direct inserts |
| **`FOR UPDATE` serialisation removed** (the new design's load-bearing part) | **8 codes for 1 slot** |

### Editing proof (INVARIANT D)

Lowering the allocation **to** what is currently held is allowed — the merchant's
stock lever. Lowering it **below** is refused by `/api/deals/[id]` with the real
number and a pointer to pause instead.

The database CHECK from the first implementation is **gone, deliberately**: a
constraint on a value that changes with the clock would either need a sweep to
re-evaluate, or would start rejecting unrelated writes to an untouched row. The
database still refuses to over-*issue* at any allocation, which is the invariant
that protects shoppers; the API refusal protects the merchant from setting a
number that contradicts what is already out. No claim is ever cancelled by an
edit.

### Pause proof (INVARIANT F)

Pause blocks new claims, cancels nothing, and a claim refused by pause does not
reserve a slot. An already-issued ticket still verifies.

### Shopper exhausted-state proof

`/deals/[id]` computes claimability from `isFullyClaimed`, which reads
`claims_reserved`. The card KPI's "N left" reads the same value. An exhausted
allocation returns HTTP 410 with `code: "deal_claim_limit_reached"` and *"This
deal is fully claimed."* — a stated state, never a server error, and it never
says "try again". Race losers additionally get the page corrected under them via
a `stale` flag, so the sold-out state, the count and the button stop
contradicting the message.

**And a sold-out deal can become claimable again with no write anywhere** as
unredeemed claims lapse — which is the shopper-visible half of the D224 ruling.

### Existing-claim preservation proof

With the allocation exhausted, an already-issued claim still verifies `success`,
still charges KES 30 exactly once, and still lands in the ledger (500 → 470).
No second stock rejection at the counter; fee economics untouched.

### Performance, re-measured

The change from a counter read to a subquery had to be re-justified. At ~11x
production volume (668 deals / 4,631 redemptions):

| Query | Result |
|---|---|
| Feed-shaped, 30 deals, **with** `claims_reserved` | **1.8 ms** |
| Same query without it | 0.6 ms |
| The trigger's own occupancy count | **0.063 ms**, index-backed |

~40 µs per rendered deal, against a production feed query already measured at
43.8 ms. **No performance work is justified.**

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

## PR #317 — the five honesty fixes, evaluated individually

Founder ruling 2: *"Anything that prevents Merchant 01/Shopper 01 being misled
should normally land; unrelated retention or post-validation work should remain
deferred."*

Reviewed from the actual diff, one at a time, with the size of each fix
measured so cherry-picking is a real option rather than an aspiration.

### The two that mislead **Shopper 01 inside the product** — land these

| Row | What the shopper sees today | The fix | Size | Verdict |
|---|---|---|---|---|
| **D227** | A deal card reads "**12 verified**" beside a deal title. That number is `verified_counts_by_merchant` — the *shop's* all-time redemptions across every deal it has ever run. A shopper reads it as this deal's, which is a materially different and much smaller number | Two strings become "**12 verified at this shop**" | **2 lines**, `cards.tsx` + `deal-kpis.tsx` | **LAND BEFORE MERCHANT 01.** The smallest possible change, and it stops a shopper being misled about the one number MAANTA asks them to trust |
| **D234** | The feed asks for browser push permission with *"Don't miss flash deals — Turn on notifications for new deals near you"*. **Nothing in the codebase sends a shopper a push.** The only sender is `notify-merchant`, whose five call sites are payment webhooks addressed to merchants | Gates the sheet on `SHOPPER_PUSH_SENDER_EXISTS`, a constant that documents this as a codebase fact rather than an operator toggle | 21 lines + a 52-line constant module | **LAND BEFORE MERCHANT 01.** A browser push block is close to non-renewable — you cannot re-prompt. Spending Shopper 01's one permission on a promise nothing keeps is a trust cost you cannot buy back |

### The three that mislead **prospects and Merchant 01 on the marketing site**

D223, D224, D225 and D226 all live in the same two files
(`(marketing)/page.tsx`, `(marketing)/shoppers/page.tsx`) and are entangled with
each other — they rewrite the same paragraphs. **Take them as one set or not at
all;** splitting them would leave a page contradicting itself.

| Row | The claim | Why it matters for Merchant 01 |
|---|---|---|
| **D223** | The boosted rail is described to shoppers as earned and to merchants as bought | This is a **paid-placement disclosure**. Merchant 01 is being asked to trust MAANTA's ranking story, and a prospective merchant reading both pages sees two different products |
| **D224** | *"Ranked by who actually walked in"* is stated site-wide; it is true of **one rail in three** | The load-bearing trust claim of the whole product, overstated. This is the sentence Merchant 01 will repeat back |
| **D225** | Flash windows are *"often under an hour"*; the merchant's slider minimum is 1 hour | A promise the product cannot produce, in a surface Merchant 01 will read before signing up |
| **D226** | The homepage gives three different accounts of feed ranking in one scroll | Lower stakes — confusing rather than false — but it is in the same paragraphs |

**Verdict: LAND THE SET BEFORE MERCHANT 01.** Total 20 added / 12 removed lines
across two files, no logic. Merchant 01 is a real person deciding whether to
trust MAANTA, and three of these four are things they would be entitled to feel
misled about later.

### What must NOT land yet

| Row | Verdict | Reason |
|---|---|---|
| **D228** rail-3 reordering by proximity | **DO NOT MERGE** | Reverses the standing 2026-08-09 **D77** ruling and rests on a location the app does not collect. Correctly left open on the branch |
| **D229** see-all destinations · **D230** feed analytics · **D231** deal-level metric · **D232** storefront deep link | **DEFER** | Specified, not built. Post-validation work by the founder's own test |
| **D233** Fast Visit exclusions and funding cap | **DEFER as work; HARD GATE as a rule** | Must be satisfied before `fast_visit_enabled` is ever set true. Untouched here |
| **D235** offline ticket | **USEFUL DURING CONTROLLED PILOT** — see below | Valuable at a mall counter, but evidence-sensitive |

### D235 — the evidence line, restated

The implementation is sound on inspection: `public/sw.js` intercepts **GET
only**, **same-origin only**, never touches `/api/`, caches exactly one document
(`/my-deals`) network-first, falls back to an honest `/offline` page, posts a
purge on sign-out so a shared handset cannot reload its way to the previous
shopper's codes, and explicitly declines to fake offline claiming or redeeming.

**No claim is made that authenticated offline ticket presentation works.**
Nothing in this session ran the credentialed deployed test, and the founder's
distinction holds exactly as written:

> service-worker harness proof ≠ authenticated `/my-deals` offline proof.

One caveat to carry: the sign-out purge is client-initiated, so a session
abandoned without signing out leaves a cached document containing codes on that
device.

### The D-number collision — still needs resolving before integration

PR #317 assigns **D223–D235** on its branch. This session assigned **D223** and
**D224** on `main`'s line, because `drift-register.test.ts` enforces strict
contiguity and D222 is the last row at HEAD — using D236 would have left a
thirteen-row hole and failed CI.

Code and migrations cite **D236**, the identifier the founder's ruling uses; the
register row is **D223** and records the alias. This is the precedent **D172**
already set ("the repo is canonical for drift IDs").

**PR #317's thirteen rows must be renumbered on merge.** Mechanical, but it will
not resolve itself.

### Merge conflicts to expect (textual, not semantic)

Both branches touch `src/lib/data.ts`, `src/components/ui/claude/deal-kpis.tsx`,
`src/app/(shopper)/deals/[id]/page.tsx` and `src/app/(shopper)/feed/page.tsx`.
The changes are **independent**: PR #317 edits the `verifiedCount` label and
adds `BOOST_WINDOW_HOURS`; this branch edits the scarcity KPI and adds
`claims_reserved`. Both should survive; neither overwrites the other's intent.

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

## Production — the sequence, executed

> **Superseded the earlier "nothing applied" section below.** The founder
> authorised the three migrations on 2026-09-03 and the plan was followed
> exactly, with a read-back after each and a hard stop available at every
> boundary. No stop was needed.

### Pre-apply baseline

405 redemptions · 2,932 deals · 215 merchants · 353 users · 9 ledger rows ·
107 migrations (high-water `20260830120000`) · 0 blacklisted ·
`fast_visit_enabled = false` · `success_fee_kes = 30.00` ·
`verify_redemption` md5 `faf4770acef192f3d6ed1d254647930c`.

### Applied, in order, each with its read-back before the next

| # | Migration | Read-back |
|---|---|---|
| 1 | `20260903120000_claim_allocation_cap` | 3 new functions present · trigger enabled · **exactly one** `claim_deal` with the unchanged 11-column contract · **`verify_redemption` md5 unchanged** · 0 deals over-subscribed · index created · counts unchanged |
| 2 | `20260903130000_enforce_user_blacklist` | blacklist gate present **and checked before the allocation** · D236 gate still present (migration 2 did not regress migration 1) · still one overload · `users` trigger enabled alongside the two pre-existing identity guards · audit CHECK accepts `user` · 0 blacklisted · md5 still unchanged |
| 3 | `20260903140000_repair_merchant_tenant_policies` | **0** policies still reading `merchants` · **10** now using the helper · helper is 0-arg, definer, uuid-returning · **D147 re-verified: `authenticated` and `anon` still have no SELECT on `merchants` or `deals`, and `anon` no EXECUTE on the helper** · counts unchanged |

**Behavioural proof of D168 on production:** the three tables that raised
`42501 permission denied for table merchants` — `redemptions`,
`merchant_transactions`, `pending_topups` — now all return
*"OK — policy filtered without error"* under `SET LOCAL ROLE authenticated`.

### Ledger

All three applies minted their own versions — **fifteen for fifteen**
(`20260903104929`, `20260903105026`, `20260903105108`). Each was repaired to
its repository filename before anything else, then the **complete** ledger was
diffed against `ls supabase/migrations/`:

**110 files · 110 rows · ZERO differences.** Not "probably applied".

### Post-apply smoke (read-only — no KES 30 transaction was manufactured)

| Check | Result |
|---|---|
| Claim availability semantics | 247 live deals · **0 fully claimed** · **0 over-subscribed** · minimum 8 claims left. Nobody is locked out by the new cap |
| The defect, quantified in the wild | **146 of 247** live deals had `claims_reserved` different from the old `claims_count` — the number the UI used to show |
| Computed column correctness | An independent hand-count across all **198** deals holding claims: **0 mismatches** |
| The D224 ruling, working | Of 405 claim rows, **394 reserve** and **10 slots are released by expiry** — precisely the ten stale rows D134/D224 was about, freed without a single row being mutated |
| Normal browsing | `deals_public_browse` returns 247 rows · 211 visible merchants |
| Evidence integrity | genuine-tagged successes still **1** (the internal E2E survivor) · non-demo merchants still **2**, both internal (D184) · **external field validation still 0** |
| Ledger integrity | 9 rows · success-fee total −90.00 · unchanged |
| Admin access | 4 admins · 54 `admin_ops_log` rows |
| Frozen config | fee `30.00` · **`fast_visit_enabled` `false`** · demo mode `true` |

### Fast Visit

**Untouched and still OFF.** No migration in this session references
`fast_visit_enabled`, `fast_visit_points`, `award_fast_visit_points` or
`record_shopper_arrival`; no reward code was modified; D233 was not
implemented; the flag was read and never written.

---

## Production — pre-apply statement (historical)

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
