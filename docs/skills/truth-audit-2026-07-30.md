# Truth audit — code ↔ repo mirror ↔ Notion (2026-07-30)

Mode: **Reviewer**. Scope: pricing & plans, roles & permissions, payment/trial
flows, critical flows, feature flags. Reality-first — the code, migrations and
live `app_config` were read before any doc was trusted.

Baseline before changes: 45 test files / 301 tests passing.
After the audit corrections: 46 files / 307 tests.
After the D1 fix (founder ruling, same day): **47 files / 326 tests**.

---

## 0. A structural note about this repo's "design-truth mirror"

The audit prompt assumed a mirror made of `frames.json`, rule records (`R-xxxx`)
and drift rows (`D-xx`). **None of those exist in this repository** — there is no
frames file, no rule registry and no drift table, and nothing references them.

What plays that role here instead:

| Prompt's artifact | This repo's equivalent |
|---|---|
| `frames.json` | `docs/skills/frozen-ui-overall-handoff.md` + `maanta-app/design/` (wireframe HTML + `Maanta_Wireframe_System.pdf`) |
| Rule records `R-xxxx` | "Frozen business rules" in `CLAUDE.md`, mirrored from the Notion **Frozen Scope & Rules** page |
| Drift rows `D-xx` | Ad-hoc audit docs under `docs/skills/*-audit-*.md` — no persistent open/closed drift register |
| Decisions log | `docs/maanta-decisions-log.md` |
| Corrections log | Did not exist. **This file is it.** |

Consequence worth naming: because drift is recorded in dated audit documents
rather than a register with open/closed state, a finding raised in one audit can
be silently re-raised or forgotten in the next. Two of the findings below
(F4, F6) are exactly that failure mode — resolved in a previous audit, still
described as unresolved in code. See follow-up FU-1.

---

## 1. Corrections applied

| # | Domain | Contract claimed | Code/DB showed | Verdict | Action |
|---|---|---|---|---|---|
| F1 | Pricing | Notion frozen rule: launch offer = "First 100 BBS Mall merchants get 30-day free Elite trial"; Product Brief adds "KES 30 success fee still applies" | `/pricing` promised "Launch offer: first month of Elite free" — no cap, no node scope, no fee caveat | **Code was the outlier** (copy overstated a frozen, bounded promo) | Rewrote `/pricing` and the `/for-merchants` Elite bullet to state cap + node + fee caveat |
| F2 | Pricing | Elite price review = **Feb 2027** (founder ruling 2026-07-20), decisions log at `docs/maanta-decisions-log.md` | Live `app_config.success_fee_kes.notes` said "**Oct 2026** review" and pointed at `PROJECT_RULES.md` / `DECISIONS_LOG.md`, **neither of which exists** | **DB metadata was stale** | Migration `20260730120000_correct_success_fee_config_notes.sql` (metadata only) |
| F3 | Pricing | Plan names are Standard and Elite, "never Free"; forbidden term "free plan" | `/pricing` and `/for-merchants` printed **"Free"** as Standard's headline price | **Code was the outlier** | Both now read "No monthly fee" |
| F4 | Trials | 30-day Elite trial is frozen; the 2026-07-29 full-state audit already ruled wireframe 11j's "14 days" stale | `approve/route.ts` still carried "wireframe 11j says 14 days — flagged as an **open** spec/DB conflict" | **Comment was stale** | Comment rewritten to record the resolution |
| F5 | Pricing | Success fee must never be hardcoded (`getSuccessFee()` is canonical) | `30` was an independent literal in `/for-merchants` (`SUCCESS_FEE = 30`), `/pricing` (twice), and `data.ts`'s fallback | **Drift risk, no live mismatch** | Single-sourced as `SUCCESS_FEE_KES` in `src/lib/pricing.ts`; all three now import it |
| F6 | Mirror | Notion carries the launch offer as a **frozen rule** | `docs/maanta-decisions-log.md` referenced "the free Elite trial" in passing but never recorded its terms or cap | **Mirror gap** | Entry added to the decisions log |

## 2. Verified aligned (no action)

Checked against migrations and live `app_config`, all three sources agree:

- **Success fee** KES 30, all plans, at verification — `app_config.success_fee_kes = 30.00`,
  forced on every deal write by `enforce_deal_success_fee()`, amount-bound in
  `deduct_success_fee_or_record_arrears()`.
- **Deal limits** Standard 1 / Elite 2, flash Elite-only — `enforce_deal_limit()`.
- **Boost** KES 500 / 24h, Elite-only — `app_config.boost_fee_kes = 500`,
  `20260715194145_boost_elite_only_gate.sql`.
- **Zero-balance gate** blocks new deals only, running deals keep redeeming —
  `20260703190627_zero_balance_gate_deals.sql`.
- **Verify-anyway** redemption succeeds regardless of balance; shortfall becomes
  arrears — `20260630232014_arrears_support.sql`.
- **Standard expiry** 24h fixed; **flash** default 6h, CHECK 1–24 — `set_deal_expiry()`.
- **Deal image** required — `deals.image_url TEXT NOT NULL`.
- **Archive** last 5 expired per merchant — `archive_expired_deal()`.
- **Wallet top-up target** KES 3,000 — `/merchant/topup` default.
- **Node 0 opening credit** KES 300, first 100, BBS Mall, inside launch window —
  fully config-driven and **enforced**, unlike the Elite trial cap (see D2).
- **Roles** `docs/skills/role-permissions.md` matches code exactly: the
  `users.role` CHECK, `requireAdminPage/Api`, `requireFounderPage/Api` (admin),
  `getMerchantContext`, agent layout (`agent` + `admin`).
- **"Deals near me"** is honestly labelled — the rail subtitle says "Standard
  deals at your mall", so the node-scoped (not GPS-proximity) behaviour is
  disclosed on the same screen. `LocationPill` shows the selected mall, not a
  claimed GPS fix.

## 3. D1 — RESOLVED 2026-07-30 (founder ruling: option (a))

### What was wrong

Notion **Frozen Scope & Rules → Feed structure (locked)** specifies:

| Section | Locked sort |
|---|---|
| 1 Flash | soonest expiry first |
| 2 Priority Placements (boosted) | most recently boosted first |
| 3 All Active Deals | all-time verified redemptions descending |

`src/app/(shopper)/feed/page.tsx` defaulted `sort` to `"nearest"`, and
`sortDealRows()` then re-sorted **all three rails** by distance. `getLiveDeals()`
did compute the verified-redemption ordering for section 3 — and it was then
discarded by the re-sort. The distance origin is `nodeCoords(node)`, the **mall
centroid**, not the shopper, so within a single mall the displaced order carried
little signal. Most seriously, **boost is a paid entitlement** (KES 500 / 24h):
Elite merchants were buying a placement the feed did not deliver.

### The fix

Option (a): the locked structure is the default, distance becomes an opt-in.

- **New sort value `featured`** = the locked structure. `DEFAULT_FEED_SORT` is
  `featured`; `Nearest` / `Newest` / `Ending soon` remain as explicit overrides
  (and still apply to all rails when chosen — an explicit shopper choice
  outranks the default, which is the point of a control).
- **Ordering moved into the data layer.** `getLiveDeals` returns each rail
  already in locked order via `lockedFlashOrder` / `lockedBoostedOrder` /
  `lockedStandardOrder`. Two reasons: the order is a property of the feed
  structure rather than of one render, and it *has* to happen before the
  `unstable_cache` boundary anyway — cached values are serialized, so the `Map`s
  the locked orders depend on do not survive the trip to the caller.
- **`sortDealRows("featured", …)` is a pass-through.** The pre-audit bug was not
  a wrong comparator, it was a correct one being discarded downstream; making
  `featured` a no-op in the flat sorter is what stops that recurring.
- **Boost order reads `boost_flags.starts_at`** (`getBoostStartTimes`), a
  separate small indexed query rather than an embed, so `DealRow` and the
  lat/lng-less fallback select are untouched. `move_boost` updates `deal_id`
  only, keeping the original `starts_at`, so a moved boost holds its purchased
  position instead of jumping to the front — the 24h window it paid for stays
  continuous.
- **Degrades, never breaks.** If the boost-times query fails the rail falls back
  to newest-first and the feed still renders; a wrong paid-rail order for one
  render beats a blank feed. Missing timestamps sort *last*, so a malformed row
  or a missing join can never win free top placement.
- **Browse unchanged.** It renders one flat list, so `featured` has nothing to
  mean there; `DEFAULT_BROWSE_SORT` stays `nearest` and Browse's dropdown keeps
  the three options. The two defaults are now named constants rather than
  repeated `"nearest"` literals across four files.

Guardrails: `src/lib/__tests__/locked-feed-order.test.ts` (15 tests) pins each
rail's order, the tie-breaks, the degraded paths and the default; four cases in
`get-live-deals.test.ts` assert the order end-to-end through `getLiveDeals`.
Verified as a ratchet: reverting the default to `nearest` and removing the
`featured` pass-through fails 2 tests.

**One Notion edit is now outstanding** — see FU-6.

## 3b. D2 — RESOLVED 2026-07-30 (founder ruling: enforce the cap)

### What was wrong

The frozen offer is capped at 100 BBS Mall merchants. In code the trial was an
**admin opt-in per approval** (`grantEliteTrial` on `/api/admin/merchants/[id]/approve`,
or `grant-trial` on `/api/admin/plans/[id]`) with **no counter, no cap and no node
check** anywhere — no `app_config` key equivalent to
`node0_opening_credit_merchant_cap`, which does exactly this job for the KES 300
credit. The cap rested entirely on admin discipline, while `/pricing` advertised
it publicly.

### The fix — migration `20260730130000_enforce_elite_trial_first_100_cap.sql`

Four decisions inside it are worth understanding, because each is a place the
obvious implementation would have been wrong:

1. **A durable marker, not current state.** `merchants.elite_trial_granted_at` is
   stamped once and never cleared. Counting `elite_trial_active = TRUE` would
   have been the natural approach and would have been **broken**: the trial
   columns are cleared on downgrade and on mark-paid, so slots would silently
   recycle and far more than 100 merchants could take the offer over time. A
   consumed slot stays consumed. Existing trial-holders are backfilled, so
   enforcement does not begin from a false zero and re-issue the first 100 slots.

2. **A trigger, not just the RPC.** The ruling said "enforce it in
   `activate_merchant`", but doing only that would have left the documented
   bypass wide open — `/api/admin/plans/[id]` writes the trial columns directly
   and never touches the RPC. `trg_enforce_elite_trial_cap` fires on every
   `elite_trial_active` FALSE→TRUE transition, so the cap holds on all paths,
   including any added later. Enforcing only in the RPC would have let us *claim*
   the cap was enforced while it wasn't — the exact failure this audit exists to
   catch.

3. **The two paths fail differently, deliberately.** `activate_merchant` checks
   availability first and, when the offer is spent, **activates the merchant on
   Standard with no trial and no error** — a promo running out must never stop a
   merchant going live, which is the same choice the Node 0 opening credit makes.
   A direct admin grant **raises** `ELITE_TRIAL_CAP_REACHED` (surfaced as a 409,
   not a 500): there the admin asked for this specific merchant, so silently
   doing nothing would be worse than an error.

4. **Concurrency and scope.** Grants serialize on `pg_advisory_xact_lock`, so two
   simultaneous approvals cannot both read "99 granted" and push the total to
   101. Demo rows and off-node merchants are outside the offer and neither
   consume slots nor are blocked by an exhausted one. No launch-*window* check
   was added: the frozen rule caps by count and node and says nothing about a
   date, unlike the opening credit which explicitly reuses
   `node0_launch_period_ends_at`. Adding one would have been inventing a rule.

### A second bug this surfaced

The approve route logged `details: { grantEliteTrial }` — the **request**. Once a
grant can legitimately be refused, that puts "granted a trial" in the audit trail
for a merchant that never got one. It now reads the result back and logs
`eliteTrialGranted` plus a skip reason, and returns a notice so the approve modal
can tell the admin the shop went live on Standard. An audit log has to record
what happened to the entitlement, not what was asked for.

## 4. Guardrails added

`src/lib/__tests__/pricing-copy.test.ts` (6 tests). Verified as a real ratchet:
reverting `/pricing` to its pre-audit content fails 3 of the 6.

| Invariant | Prevents |
|---|---|
| Every per-redemption fee in public copy equals `SUCCESS_FEE_KES` | A fee change landing in `app_config` and some pages but not others |
| The fee is declared in exactly one module | New `const SUCCESS_FEE = 30` duplicates |
| No bare `>Free<` as a plan price | The banned "Free plan" claim returning with the noun dropped |
| Any page mentioning the Elite trial carries cap + node + fee caveat | An unbounded reading of a bounded promo |
| Named unbounded phrasings ("first month of Elite free", …) are banned | The exact regression this audit fixed |

`src/lib/__tests__/locked-feed-order.test.ts` (15 tests), from the D1 fix.
Verified as a ratchet: reverting the feed default to `nearest` and removing the
`featured` pass-through fails 2 of the 15.

| Invariant | Prevents |
|---|---|
| `DEFAULT_FEED_SORT` is `featured`; `DEFAULT_BROWSE_SORT` is `nearest` | The feed silently drifting back to a distance default |
| `sortDealRows(…, "featured", …)` is a pass-through | A flat comparator discarding the locked per-rail order again |
| `featured` is offered on the feed and **not** on Browse | A per-rail order appearing where there are no rails |
| Each rail's locked order, with newest→id tie-breaks | Position jitter between a cached and a live read |
| Missing expiry / boost-start / verified-count sorts **last** | A malformed row or missing join winning free top placement |
| Boost-times query failure degrades to newest-first | A broken paid rail taking the whole feed down |

Four further cases in `get-live-deals.test.ts` assert the locked order
end-to-end through `getLiveDeals`, not just at the comparator level — the
pre-audit bug was a correct comparator being discarded downstream, which a
unit-level test alone would not have caught.

`supabase/tests/elite_trial_cap_test.sql` (7 scenarios), from the D2 fix.

| Invariant | Prevents |
|---|---|
| Cap config, durable column and trigger all present; cap defaults to 100 | The enforcement being dropped by a later migration |
| Under the cap: trial granted **and** slot stamped | A grant that does not consume a slot |
| At the cap: merchant still **activated**, on Standard, no error | A spent promo blocking a merchant going live |
| A direct `UPDATE` past the cap **raises** | The admin-plans route bypassing the cap again |
| Downgrade leaves `elite_trial_granted_at` set | The 100 slots being recycled indefinitely |
| A re-grant to the same merchant consumes no second slot | A restarted trial burning two slots |
| Off-node and demo merchants neither consume nor are blocked | Rehearsal data eating real launch slots |

Verified as a behavioural ratchet, not just a presence check: neutering the
trigger to a pass-through (leaving it installed) fails the suite at scenario B.

Existing `frozen-ui-rules.test.ts` was left as-is; it covers design tokens and
the `free plan` term, and the new files cover the commercial claims, the locked
feed structure and the launch-offer cap.

### How the SQL suites were verified in this session

`supabase start` needs Docker, which is unavailable here, so the SQL guardrails
were run against a throwaway local Postgres 16 with PostGIS and a minimal
Supabase shim (`auth.users`, `auth.uid/role/jwt`, `storage.buckets/objects`,
`storage.foldername/filename/extension`, and the `anon`/`authenticated`/
`service_role` roles). On that cluster **all 51 migrations apply cleanly in order
and all 19 SQL suites pass** — the same work CI's `db-tests` job does. Worth
repeating rather than trusting: the two new suites were also each confirmed to
fail when the thing they guard is removed.

## 5. Follow-ups

- **FU-1 (process).** There is no persistent drift register, which is why F4 and
  F6 were re-discoverable. Either adopt a `docs/drift-register.md` with
  open/closed rows and evidence links, or make each audit doc explicitly close
  the prior audit's rows by ID.
- **FU-2 (operator, human only).** Two migrations need pushing to
  `axrrslqssmbngbataejg`. Per `docs/ops/supabase-migrations.md` Claude Code does
  not run migrations — a human operator must.
  - `20260730120000_correct_success_fee_config_notes.sql` — metadata only, safe to
    batch with anything.
  - `20260730130000_enforce_elite_trial_first_100_cap.sql` — **behavioural, read
    the note before pushing.** It adds a column, backfills it, and starts
    enforcing the cap. **Check the backfill result before announcing the offer:**
    run `SELECT * FROM public.elite_trial_cap_status();` straight after the push.
    That tells you how many of the 100 slots existing merchants already consumed.
    If `granted` looks higher than expected, the backfill counted merchants whose
    trial was granted before the cap existed — which is correct, but it is a
    number the founder should see rather than discover when the offer runs out
    early.
- **FU-3.** `app_config.demo_mode_enabled` is **`true` on production right now**
  (correct for rehearsal; its own notes say "must be false at launch"). The
  paired `MAANTA_DEMO_MODE` Vercel var — which tags analytics and can drift from
  the DB switch — remains unverified from this environment, as already flagged in
  `docs/ops/optruth-demo-release-2026-07-29.md`.
- **FU-4.** `/pricing` hardcodes KES 3,500 with no `app_config` key behind it
  (unlike the success fee and boost fee). If the Feb 2027 review changes the
  price, the UI is the only place to edit. Consider an `elite_subscription_kes`
  key when subscription billing is wired to a processor.
- **FU-5 (Notion).** Every *rule* discrepancy resolved in Notion's favour, so no
  rule text needed correcting. One **enforcement claim** did — see FU-6. The
  Notion-side edit that D2 would require is deferred until the founder rules on
  it.
- ~~**FU-6 (Notion, from the D1 fix).**~~ **DONE 2026-07-30.** The "Current state
  (as of 2026-07-21)" bullet on **Frozen Scope & Rules** claimed the fee, plan
  names, zero-balance gate, boost-Elite-only, image requirement "**and feed
  structure**" all "remain unchanged and **enforced in code**", citing only
  `frozen-ui-rules.test.ts`. For the feed structure that was **not true** — that
  file never covered it, and the default sort actively contradicted it. Updated
  on the founder's go-ahead to cite `frozen-ui-rules.test.ts`,
  `pricing-copy.test.ts` and `locked-feed-order.test.ts`, with a dated
  sub-bullet recording that the feed-structure claim was inaccurate until
  2026-07-30 — rather than quietly back-dating the enforcement, which would make
  the page's own history unreliable. Verified by re-fetching the page.

  **This is the only Notion write in the whole audit.** Worth noting what kind of
  error it was: the *rules* in Notion were right and the code was wrong, but
  Notion also asserted that code *enforced* those rules, and that meta-claim was
  the thing that let the drift survive. A "synced from the repo" note is itself a
  claim that needs auditing, not evidence that the audit already happened.

## 6. Sign-off

- Code, repo mirror and Notion now agree on: the success fee, plan names and
  entitlements, deal limits, boost, expiry, archive, roles, the zero-balance
  gate, verify-anyway, the launch offer — **stated terms and enforced cap** — and
  the locked feed structure.
- **No mismatches remain open.** Both product decisions were ruled on the same
  day: D1 (feed default) and D2 (launch-offer cap) are implemented, tested and
  recorded in the decisions log.
- The audit pass itself made no behavioural change (public copy, one shared
  constant, one comment, one metadata migration, tests). **D1 and D2 are both
  deliberate behavioural changes**, each on an explicit founder ruling: the feed's
  default rail order changed so the boosted rail delivers the placement Elite
  merchants pay for, and the launch offer is now capped in the database on every
  path that grants a trial.
- Verified: 47 JS test files / 326 tests; 51 migrations apply cleanly and 19 SQL
  suites pass on a local Postgres+PostGIS cluster; lint and typecheck clean; the
  production build compiles and generates 90/90 pages.
- Outstanding: **FU-2 only** — a human operator must push the two migrations, and
  should read `elite_trial_cap_status()` right after, since the backfill decides
  how many launch-offer slots are already spent. FU-6 is done: the one inaccurate
  Notion enforcement claim was corrected 2026-07-30 and verified by re-fetch.

### What this audit actually taught

The rules were almost never wrong. What was wrong, repeatedly, was the **claim
that something enforced them**: Notion said the feed structure was enforced in
code when no test covered it; the repo said the launch offer was frozen while no
counter existed; a stale comment said a resolved conflict was still open. Drift
here does not look like a disagreement about the rule — it looks like everyone
agreeing on the rule and nobody holding the invariant. That is why every fix in
this pass shipped with a test that was **checked to fail** when its guard is
removed. A guardrail nobody has seen fail is itself just another claim.
