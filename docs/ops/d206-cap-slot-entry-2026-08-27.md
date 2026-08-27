# D206 — the active-deal cap on entry into slot occupancy

**Date:** 2026-08-27 · **Branch:** `claude/d206-cap-update-guard` · **PR:** #284
**Migration:** `maanta-app/supabase/migrations/20260827120000_cap_enforce_on_slot_entry.sql`
**Production status: NOT APPLIED.** Ledger 104/104, high-water `20260826130000`.

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

Cost on current data: it activates **288 rows instead of 289**.

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

## 7. Production census, read-only, 2026-08-27

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
