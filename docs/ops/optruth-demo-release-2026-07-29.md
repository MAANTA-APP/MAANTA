# Demo activity seed + demo-mode release — 2026-07-29

**Owner:** founder · **Executed by:** Claude (release lead) · **Target:** `axrrslqssmbngbataejg` (production)
**Related:** PR #127 (landing redesign), PR #128 (demo mode) — both merged

---

## Issue

The production demo activity batch was **degenerate**. All 339 synthetic redemptions
shared **one shopper and one timestamp**:

| Measure | Value |
|---|---|
| Rows | 339 |
| Distinct shoppers | **1** |
| Distinct `redeemed_at` | **1** (all `2026-07-29 09:51:12.720514+00`) |
| Distinct merchants | 145 |

**Cause.** `demo_activity_seed.sql` used two `CROSS JOIN LATERAL` subqueries with no
reference to the outer query. An uncorrelated LATERAL is not evaluated per row —
PostgreSQL hoists it out of the nested loop and computes it once, then reuses that
single result for every row, regardless of `random()` being VOLATILE. Measured on
PG16: an uncorrelated `ORDER BY random() LIMIT 1` produced **1 distinct value across
8 rows**.

This defeated both properties the seed's own comments claimed: per-shop variation in
verified counts, and a recency-weighted spread across the trailing week.

Found by CodeRabbit on PR #128 (it flagged the shopper lookup; the timestamp LATERAL
had the identical defect and was caught during verification).

---

## Fix

1. **Backup taken.** `public.redemptions_demo_activity_backup` — 339 rows, the exact
   pre-reseed batch. RLS enabled with no policies and grants revoked from `anon` /
   `authenticated`, so it is not a public PostgREST surface. Safe to drop once the
   reseed is accepted.
2. **Old batch deleted**, scoped to `is_demo AND demo_source = 'demo_activity'`.
3. **Corrected seed rerun.** The shopper lookup is now a correlated scalar subquery;
   the timestamp is computed in a target list over already-expanded rows, so
   `redeemed_at` and `expires_at` derive from the same draw.

### Before vs after

| Measure | Before | After |
|---|---|---|
| Rows | 339 | **354** |
| Distinct shoppers | 1 | **3** |
| Distinct timestamps | 1 | **354** |
| Distinct merchants | 145 | **157** |
| Time span | single instant | **2026-07-23 07:21 → 2026-07-29 16:39** |
| `expires_at = redeemed_at + 10 min` | — | **354 / 354** |

### Migrations applied

`20260729170000` (demo_wipe_agent_references), `20260729180000`
(demo_reseed_retire_expired), `20260729190000` (demo_wipe_user_references).

Applied via the Supabase MCP because the CLI cannot run in the authoring environment
(no project link / credentials). Version numbers were **renumbered** afterwards to
match the repo filenames, so `make db-list` and `make db-push` agree with the repo and
will not re-run them.

`wipe_demo_data()` dry run verified live: returns the new
`agents RETAINED` / `users RETAINED` lines, `applied = false` throughout, nothing
deleted.

---

## Demo-mode configuration

| Item | State | How verified |
|---|---|---|
| `app_config.demo_mode_enabled` | `true` | `SELECT public.is_demo_mode()` → `true` |
| Disclosure banner on `/` | **Rendering** | `role="status"` + full disclosure text in served HTML |
| `noStore()` / caching | **Working** | `cache-control: private, no-cache, no-store, must-revalidate`; `x-vercel-cache: MISS` |
| Landing redesign live | **Yes** | single hero CTA, trust pill, How-it-works above features, merchant band, segment picker with `role="group"` |
| `MAANTA_DEMO_MODE` (Vercel Production) | **NOT VERIFIED** | Cannot be read from this environment — **manual check required** |

### Toggle test — passed

| Step | Result |
|---|---|
| `demo_mode_enabled → false`, wait 40s | Banner **gone** from `/`; browse views return **0 deals / 0 merchants**; landing redesign unaffected |
| `demo_mode_enabled → true`, wait 40s | Banner **restored**; browse views return **248 deals / 210 merchants** |

The flag governs both the data and the disclosure, in both directions, without a
deploy. `make demo-off` is a working kill switch with roughly a 30-second lag.

### Real data untouched

`redemptions WHERE NOT is_demo` = 0 · `merchants WHERE NOT is_demo` = 0 ·
`users WHERE NOT is_demo` = 7 — unchanged throughout.

---

## Impact

**Now carrying realistic synthetic activity:** the shopper feed and browse rails,
per-merchant verified-redemption counts, shop profile pages, BBS Mall pages, and the
`kpi_counters` / `trust_metric` rollups that the redemption trigger feeds.

**What cannot be concluded from pre-fix demo KPIs.** Any screenshot, dashboard read or
analysis of demo data taken before 2026-07-29 ~16:40 UTC is invalid for anything
involving *users* or *time*:

- **No per-user analysis is meaningful.** Every redemption belonged to one shopper —
  repeat-rate, redemptions-per-user, and cohort or retention curves are artefacts.
- **No time-series is meaningful.** Every redemption shared one timestamp — daily
  volume, growth trend and "picking up over the week" readings are artefacts.
- Per-merchant totals were roughly usable, since `merchant_id` did vary (145 merchants).

All of it was synthetic and disclosed either way; the point is that the *shape* was
wrong, not just the magnitude.

---

## Follow-ups

- **Only 3 demo customers exist** (`users WHERE is_demo AND role='customer'`), so 354
  redemptions divide across 3 shoppers — about **118 each**. The seed is now correct;
  the shopper pool is the constraint. Seed more demo customers before any demo that
  shows per-user data. *Caution, not blocking.*
- **`MAANTA_DEMO_MODE` in Vercel Production is unverified.** It drives analytics
  tagging only, is read from the server bundle, and needs a **redeploy** to take
  effect. Flag on + env unset means synthetic activity lands in PostHog untagged and
  inflates real numbers.
- **Production verification used a Vercel share token.** Repeat the banner check in a
  private browser window for a truly anonymous confirmation.
- **Doc figures drift.** Several docs still cite 291 deals / 339 redemptions; live
  values are 311 total demo deals (248 live) and 354 redemptions, and the hourly
  reseed keeps moving them. Prefer the queries in
  `docs/ops/demo-mode-review-checklist.md` over any written number.
- **Audit-trail retention on wipe** (from PR #128 review): `guardian_events`,
  `fraud_events` and `admin_ops_log` rows are deleted when the *actor* is a demo user,
  even when the action targeted a real merchant. Decide whether to keep and tombstone
  instead.
- **`handle_trial_expiry()` NULL trap**: if `app_config.node0_launch_period_ends_at`
  went missing, both phases of trial expiry silently stop. No effect today; wants its
  own change.
- **Drop the backup table** once the reseed is accepted.
