# D206 — the active-deal cap on entry into slot occupancy

**Date:** 2026-08-27 · **Branch:** `claude/d206-cap-update-guard` · **PR:** #284
**Migration:** `maanta-app/supabase/migrations/20260827120000_cap_enforce_on_slot_entry.sql`
**Production status: APPLIED 2026-08-27** under founder authorization, after PR #284 merged as
`5aaf522`. **Ledger 105/105**, high-water `20260827120000`. See §11 for the apply record.
**D206 is still open** — closure waits on the scheduled 02:30 UTC refresh.

Locked commercial rule, unchanged and not up for revision here:
**Standard = 1 active deal, Elite = 2.** Database authoritative. No `is_demo` exemption.

---

## 1. What was wrong

`enforce_deal_limit_trigger` was `BEFORE INSERT` only. Setting `is_active = TRUE`
on an existing row never met the cap, so any reactivation walked past the rule.

Measured on production 2026-08-27: **28 merchants above their plan's cap**, up
from 0 hours earlier, **with no new deals inserted in between** — the forensic
signature of reactivation rather than creation. The 02:30 UTC timestamps matched
cron `maanta_demo_seed_refresh` exactly.

| Who | State | How |
|---|---|---|
| 27 Elite | 3 active (cap 2) | 2 seed-batch rows + 1 `autoreseed` flash row. `reseed_demo_flash_deals()` is cap-aware and inserted legitimately while under cap; the nightly refresh then blindly reactivated **both** batch rows on top. |
| 1 Standard | 2 active (cap 1) | The same blanket reactivation. |

**All 28 are demo merchants. No genuine merchant was ever over cap.** The
commercial rule was never breached in the field. What was breached is the
*enforcement*: the founder ruling of 2026-08-26 — no paused deal may be
reactivated over the cap — had nothing in the database behind it.

## 2. Why not simply `BEFORE INSERT OR UPDATE`

A trigger that re-counts on every UPDATE refuses ordinary edits to a deal
**already occupying its own slot**. A Standard merchant at 1/1 could not retitle,
reprice, pause or extend their only deal: the count (1) meets the limit (1) on
every write.

The guard therefore fires only on the **transition into occupancy** —
`OLD.is_active = FALSE AND NEW.is_active = TRUE` — and returns untouched for
everything else. Leaving occupancy is always allowed.

INSERT behaviour is unchanged, including its stricter-than-necessary shape (an
insert at cap is refused even for a row arriving inactive). Pinned by scenario C,
and not this change's to relax.

## 3. The nightly refresh — the part that would have broken silently

`refresh_demo_seed_deals()` was one blanket `UPDATE ... SET is_active = TRUE`
over every seed-batch row (289 rows, 208 merchants). Under the new guard that
single statement would **raise on the first over-cap row and abort the whole
nightly refresh**, in cron, unwatched — reproducing the 2026-07-29 ageing-out
incident the function exists to prevent.

It now chooses deterministically rather than attempting everything and leaning on
the trigger to reject the surplus:

1. subtract slots held by rows it does **not** manage (`autoreseed` flash, and
   any genuine row) — the interaction that produced 27 of the 28;
2. fill the remaining allowance in a stable `created_at, id` order → idempotent;
3. never activate a flash row for a Standard merchant;
4. **retire the surplus** — which is what lets the next scheduled run repair the
   current over-cap state without anyone editing production rows by hand.

Cost on current data, measured on production rather than estimated: of the **289**
active batch rows it keeps **261** and retires **28** — exactly the 28 merchants
sitting one deal over cap. Total active deals therefore go **331 → 303**
(261 batch + 40 `autoreseed` + 2 genuine).

> An earlier draft of this document said "288 instead of 289". That was wrong,
> and Codex caught it on PR #285: it counted the batch as though only one row
> were dropped, without subtracting the 40 slots `autoreseed` flash rows already
> hold. The corrected figures above come from running the function's own
> selection logic as a read-only query against production.

## 4. Not changed

Limits themselves · paused semantics (`is_paused` does not affect occupancy;
a paused deal keeps its slot) · expiry/archive semantics · repost (an INSERT,
unchanged path) · automatic trial-expiry grandfathering (`handle_trial_expiry()`
touches `merchants.tier`, never `deals`) · `is_demo` gets no exemption.

**No application-layer enforcement was added.** No production row was edited.

## 5. Tests — 17 scenarios

`deal_limit_cap_test.sql` A–G (existing) + **H–L**: Standard reactivation
refused · Elite 1→2 allowed, 2→3 refused · Standard cannot reactivate an
Elite-only flash deal · leaving occupancy always allowed and the freed slot
reusable · **a merchant at cap can still edit its own deal**.

`demo_seed_refresh_cap_test.sql` **A–E**: over-cap state repaired without
aborting · repeat runs deterministic · Standard flash rows skipped without
starving the standard row · no-op with demo mode off · scratch table cannot be
shadowed from `public`.

### Mutation proof — four mutants, each fails

| Mutant | Result |
|---|---|
| Naive `BEFORE INSERT OR UPDATE`, no transition check | ❌ `Deal limit reached` on an ordinary edit |
| Revert to `BEFORE INSERT` only | ❌ `H: D206 HOLE OPEN` |
| Blanket demo reactivation restored | ❌ `A: Elite merchant left with 3 active deals` |
| Unqualified `_refresh_keep` | ❌ `E: SHADOW HOLE — the function dropped public._refresh_keep` |

The fourth came out of the **substitute security review** run because both
automated gates were unavailable on #284 (Cursor agents `neutral`, CodeRabbit
trial exhausted — the same situation as #283). `refresh_demo_seed_deals()` pins
`search_path = public, pg_temp`, and an **explicitly listed** `pg_temp` is
searched **last** — so the unqualified `_refresh_keep` the rewrite introduced
resolved to `public._refresh_keep` first. Demonstrated, not theorised: the
unqualified draft **dropped an unrelated public table from inside a SECURITY
DEFINER body**, then read the wrong relation. Every reference is now
`pg_temp.`-qualified.

## 6. Verification

lint ✅ · typecheck ✅ · 1366 unit tests ✅ · build + three post-build gates ✅ ·
**all 37 SQL suites on a fresh 105-migration chain** ✅ · CI `ci` + `db-tests`
green on the exact head.

## 7. Production census, read-only, 2026-08-27 — **PRE-APPLY**

Every row below is the state *before* the migration was applied. The post-apply
read-back and census are in §11; do not read the two together.

| Measure | Value |
|---|---|
| Merchants over cap | **28** — 0 genuine, 28 demo |
| Max active, Standard | 2 (cap 1) |
| Max active, Elite | 3 (cap 2) |
| Active deals | 331 total, **2 genuine** |
| `tier_flags` rows | 0 (D194 — the audit row never survives its own exception) |
| `enforce_deal_limit_trigger` fires on | **INSERT only** — migration not applied |
| Ledger | 104/104, high-water `20260826130000` |
| Demo mode | ON (founder ruling 2026-08-26) |

## 8. Apply runbook — founder-authorized only

Claude does not apply this. When authorized, in order:

1. **Read `supabase_migrations.schema_migrations` first**, not the directory.
   Confirm the high-water is still `20260826130000` and nothing was applied in
   between.
2. Apply `20260827120000_cap_enforce_on_slot_entry.sql`.
3. **Repair the ledger to the repo filename.** Every MCP apply so far has minted
   its own version — **ten for ten**. Do this before anything else.
4. Read back: trigger fires on `INSERT OR UPDATE`; `pg_get_functiondef` contains
   the transition check; `refresh_demo_seed_deals()` grants intact
   (`service_role`, `postgres` only).
5. Census: **genuine over cap = 0 · demo over cap = 0 · Standard max ≤ 1 ·
   Elite max ≤ 2.** Expect the 28 to persist until step 6 — the migration does
   not edit rows, deliberately.
6. **Wait for the scheduled 02:30 UTC refresh**, then re-run the census. The
   over-cap state must be gone and must not return.

**D206 is not closed until step 6 has been observed.** The apply alone proves the
guard exists; only the scheduled run proves the cron repairs rather than aborts.

## 9. Seed reruns — Codex finding, confirmed and fixed

Codex flagged (P2) that the documented rerun path in `AGENTS.md` — apply
`supabase/seed/node0_100_deals_seed.sql` — ends in a blanket
`UPDATE ... SET is_active = true` over its whole id range. Reproduced: once one
of those merchants has a slot held by a row **outside** the range (an
`autoreseed` flash deal is exactly that), the guard raises
`Deal limit reached. elite plan allows 2 active deal(s).` and **rolls the entire
seed back**.

`node0_100_deals_seed.sql` and `node0_rehearsal_seed.sql` now use the same
allowance-based selection as the refresh function: already-active rows refreshed
unconditionally, inactive rows activated only within the slots that remain,
oldest id first. Verified before and after on the same probe state:

| Form | Result |
|---|---|
| Blanket (pre-fix) | ❌ aborts — `Deal limit reached` |
| Allowance-based (post-fix) | ✅ completes; merchant lands at exactly cap, 99 of 100 rows active with the autoreseed slot respected |
| Clean chain, seeded twice | ✅ 100 active, 0 over cap, idempotent |

**`node0_ops_personas_seed.sql` is NOT fixed here — see D207.** It inserts a
flash deal for a merchant the rehearsal seed creates on the **standard** tier, so
it aborts on the INSERT path this PR leaves byte-identical. That break predates
D206 and its fix is a product-data decision (Bilan becomes Elite, or the deal
stops being flash), not a mechanical one. Founder's call.

## 10. Reported, not silently widened

An UPDATE flipping `deal_type` to `flash` on a row that is **already active**
stays unguarded. No app or DB path updates `deal_type` (grepped), and the guard
does cover a flip on a row *entering* occupancy. It is a one-line addition to the
same branch if the founder wants it closed now.

## 11. Apply record — 2026-08-27, founder-authorized

Order followed: **merge first, apply minutes later** (the D162/D164 sequence), so
code never trailed schema.

1. **PR #284 merged** as `5aaf522`. Verified by **tree comparison, not SHA** —
   `git diff origin/main 87ce088` is empty, so `main` carries exactly the audited
   tree despite the squash minting a new commit.
2. **Ledger read first**, not the directory: 104/104, high-water
   `20260826130000`, `20260827120000` absent. Nothing had been applied in
   between.
3. **Applied.** The apply minted `20260827074843` — **eleven for eleven** — and
   was **repaired to `20260827120000` before anything else**. Ledger **105/105**,
   high-water `20260827120000`, the minted version gone.
4. **Read back:**

| Check | Result |
|---|---|
| `enforce_deal_limit_trigger` fires on | **INSERT UPDATE** |
| Transition check present in the live function body | ✅ |
| `refresh_demo_seed_deals()` `pg_temp.`-qualified | ✅ |
| `refresh_demo_seed_deals()` cap-aware (`foreign_occupancy`) | ✅ |
| Overloads | exactly **1** of each function |
| `refresh_demo_seed_deals()` EXECUTE grantees | `postgres`, `service_role` — anon/authenticated absent |
| cron `maanta_demo_seed_refresh` | `30 2 * * *`, active |

5. **Live negative test on production**, written to roll itself back — three
   behaviours confirmed on real data, nothing committed:

```
merchant=c0000000-…001
  reactivate_over_cap = [Deal limit reached. elite plan allows 2 active deal(s).]
  edit_at_cap         = [allowed]
  leave_occupancy     = [allowed]
```

   The hole is shut, and the thing a naive fix would have broken — editing the
   deal that owns your only slot — still works.

6. **No mutation.** Before and after the probe, identically: 2408 deals · 331
   active · 215 merchants · 404 redemptions · 0 `tier_flags` rows (D194) · 2
   genuine active deals.

7. **Census immediately after the apply: still 28 over cap** (0 genuine, 28
   demo; Standard max 2, Elite max 3). **This is expected and correct.** The
   migration changes behaviour, not rows — it deliberately does not edit
   production data, per the founder ruling *"do not solve this by manually
   cleaning production rows."* The 28 clear when the rewritten refresh next
   runs and retires the surplus.

### What closes D206

The **02:30 UTC scheduled run of `maanta_demo_seed_refresh`** on 2026-08-28, and
nothing before it. Three things must hold:

- the cron run **succeeds** — a failure would mean the refresh aborts under the
  new guard, the exact incident the rewrite exists to prevent;
- over-cap goes **28 → 0**, Standard max ≤ 1, Elite max ≤ 2, and does not recur;
- the marketplace is not starved — **303 active deals** (261 batch + 40
  `autoreseed` + 2 genuine), not 288: the refresh manages only the batch, and
  `autoreseed` and genuine rows are untouched. Using 288 as the target would
  either accept the silent loss of ~15 deals or make a correct run look wrong.
  The two deliberately-dark fixture shops must still be dark (0 active, as they
  are now).

A check-in is scheduled for 03:00 UTC on 2026-08-28 to read `cron.job_run_details`
and re-run the census. Until then D206 stays **open**.

> **Resolved — see §12.** That check-in ran. The cron succeeded, over-cap went
> 28 → 0, and the ledger held at 105/105. The **303** figure above is superseded:
> the correct expectation under the function's own allocation rule is **300**,
> and production landed there. D206 is **closed**.

---

## 12. Closure proof — 2026-08-28, measured on production

Read-only. Nothing was mutated to produce any figure below.

### 12.1 The cron ran and succeeded

`cron.job_run_details` for `maanta_demo_seed_refresh` (jobid 3, schedule
`30 2 * * *`, active):

| runid | status | return_message | start | end |
|---|---|---|---|---|
| 769 | **succeeded** | `1 row` | 2026-08-28 02:30:00.095767+00 | 02:30:00.495429+00 |

400 ms, clean. This was the first scheduled run under the rewritten function and
the new trigger, and it is the check that mattered most: the old blanket
`UPDATE ... SET is_active = TRUE` would have raised on its first over-cap row and
aborted the whole refresh **silently, inside cron** — the 2026-07-29 ageing-out
incident all over again. It did not.

### 12.2 Over-cap: 28 → 0

| metric | value |
|---|---|
| `over_cap_total` | **0** |
| `over_cap_genuine` | 0 |
| `over_cap_demo` | 0 |
| `max_active_standard` | **1** (cap 1) |
| `max_active_elite` | **2** (cap 2) |

The pre-existing over-cap state was repaired by the scheduled run itself, with no
hand-editing of production rows — which is exactly what the founder ruling
required and what the rewrite was designed to deliver.

**What the run actually did**, measured from `updated_at` inside the run minute:

| effect | rows |
|---|---|
| set active (kept) | 258 |
| set inactive (retired) | 29 |

All 29 retirements landed on **Elite merchants that were at 3 active** (cap 2),
each losing exactly 1 and each now at 2. **No merchant was cut below its cap**,
and no Standard merchant lost a deal.

### 12.3 Marketplace supply — 300, not the predicted 303

| bucket | count |
|---|---|
| seed batch (`node0_100_deals`, `nairobi_150`, `node0_rehearsal`) | 258 |
| `autoreseed` | 40 |
| genuine (non-demo) | 2 |
| **total active** | **300** |
| shopper-visible (`deals_public_browse`) | 272 |
| dark fixture shops `…059` / `…149` | **0** |

**The 303 target was wrong, and the run was right.** The prediction assumed the
refresh would retire exactly one row per over-cap merchant (289 active batch rows
− 28 = 261). The function does not work that way and never claimed to: it
allocates *per merchant* — cap, minus slots held by rows it does not manage,
filled from the batch in a stable `created_at, id` order. Recomputing that rule
independently, from the merchant/deal tables rather than from the function,
predicts **258** batch rows kept and matches the observed state for **208 of 208**
batch merchants, with **zero** deviations. 258 is the algorithm's fixed point.

Full reconciliation of the 289 batch rows in scope:

| | rows |
|---|---|
| kept active by the run | 258 |
| retired by the run | 29 |
| already inactive before the run | 2 |
| **total** | **289** |

The two rows already inactive are both **flash** deals that expired at
2026-08-27 07:30 and were deactivated by `reseed_demo_flash_deals()`, whose
retire step never sets `updated_at` (verified against
`pg_get_functiondef` — the body sets `is_active = FALSE` and mentions
`updated_at` nowhere). That is pre-existing behaviour, untouched by D206, and it
is why the pre-run active-batch figure was 287 rather than the 289 the
prediction was built on. Neither row was eligible to come back: `d1000000-…017`
is a **Standard** merchant's flash row, refused by the Elite-only rule
(this is D207's row), and `d0000000-…002` sits behind a fuller allowance at its
Elite merchant.

**Nothing is starved.** The 13 Elite merchants sitting at 1 of 2 own exactly one
batch deal each — zero inactive batch rows available to promote. That is supply,
not the guard. The 28 active-but-expired rows are `autoreseed` flash windows that
have aged out; an expired-but-active deal keeps its slot by design (§4, cap test
scenario E) and is not shopper-visible.

### 12.4 Ledger unchanged

105 rows, high-water `20260827120000` (`cap_enforce_on_slot_entry`), previous
high-water `20260826130000`. Full version+name read-back diffed against the repo
directory by md5 of the sorted `version|name` list:
`608e0dabc573bf0f0226ae83ebf50ec1` on both sides. **105/105, no drift, no stray
MCP-minted version.**

### 12.5 Verdict

**D206 CLOSED.** All three closure conditions hold: the cron succeeded, over-cap
went 28 → 0 with Standard ≤ 1 and Elite ≤ 2 and did not recur, and the
marketplace was not starved. The one number that missed its target missed it
because the target was computed wrongly here, not because production misbehaved —
the correct expected value under the function's own written rule is **300**, and
production landed on it exactly.
