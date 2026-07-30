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
| `MAANTA_DEMO_MODE` (Vercel Production) | **`true`, verified from the event stream** | See "Analytics tagging" below |

### Toggle test — passed

| Step | Result |
|---|---|
| `demo_mode_enabled → false`, wait 40s | Banner **gone** from `/`; browse views return **0 deals / 0 merchants**; landing redesign unaffected |
| `demo_mode_enabled → true`, wait 40s | Banner **restored**; browse views return **248 deals / 210 merchants** |

The flag governs both the data and the disclosure, in both directions, without a
deploy. `make demo-off` is a working kill switch with roughly a 30-second lag.

### Analytics tagging — verified 2026-07-30 01:19 UTC

`MAANTA_DEMO_MODE=true` was set on Vercel Production and the project redeployed
(`dpl_FRtgWTHJtKb82ct4fiPjHB8GUVxt`, target `production`, 01:07 UTC — a redeploy of
the #133 merge). The env var can only be proved by a server-side event, so two
deal detail pages were requested on `www.maanta.app` and the resulting events read
back out of PostHog:

| event | timestamp | `is_demo` | `environment` |
|---|---|---|---|
| `deal_viewed` | 2026-07-30 01:19:45Z | `true` | `demo` |
| `deal_viewed` | 2026-07-30 01:19:44Z | `true` | `demo` |

Both tags are present, so synthetic rehearsal traffic is now separable in PostHog
and cannot silently inflate real numbers. Neither property existed in the project's
event taxonomy before this — the only prior server events (59 `deal_viewed`,
2026-07-27 09:40–09:41Z) predate PR #128 and are therefore untagged. **Exclude
anything before 2026-07-30 01:19Z from any demo/real split.**

Verification query (`is_demo` / `environment` are not in the taxonomy UI, so read
them from the stream directly):

```sql
SELECT event, timestamp, properties.is_demo, properties.environment
FROM events
WHERE timestamp >= now() - INTERVAL 1 HOUR
  AND properties.$lib = 'maanta-server'
ORDER BY timestamp DESC
```

### Server-side capture dropped events — found during this check, now fixed

> **Fixed 2026-07-30** in `src/lib/analytics.ts`: the capture promise is handed to
> Vercel's `waitUntil`, so the instance stays alive until the ping is actually
> sent. One change at the single choke point (`captureServerEvent`) — no call site
> changed, and no call site can opt out. Eight tests pin it: four were confirmed
> to fail with the fix removed, and one more — "registers while the ping is still
> in flight" — fails if the registration is merely moved *after* the capture
> awaits its own fetch, which is the version that looks right and still drops
> everything. **Undelivered events are not recoverable**; everything below still
> applies to anything served before the deploy carrying this change.
>
> It also warns once per cold start if it is ever running on Vercel *without* a
> request context, because the original failure was completely silent — nothing in
> the app could tell that its own events were evaporating. If that line ever shows
> up in the Vercel logs, server-side counts are undercounting again.

Four deal pages were rendered; **two** events arrived. The two that landed were
requested concurrently; the two that were dropped (01:16:05Z, 01:16:49Z) were
isolated requests roughly 40 seconds apart. `captureDealViewed` is invoked as
`void captureDealViewed(...)` in `src/app/(shopper)/deals/[id]/page.tsx:32` — it is
deliberately not awaited, so the pending `fetch` in `captureServerEvent` has no
`waitUntil` keeping the function alive. On Vercel the instance can freeze once the
response is sent, discarding the in-flight request. That matches the shape of the
history: the only other server events in the project arrived as one 67-second
burst of 59 under rapid sequential load, and nothing in the three days since.

Consequence, before anyone reads a server-side funnel: **`deal_viewed`,
`guardian_outcome`, `deal_claimed`, `deal_published`, `merchant_onboarded` and the
two `topup_completed_*` events undercount by an unknown amount for every request
served before the fix deploys.** The tagging was correct; the delivery was not.
Not a demo-mode regression — it predates PR #128 and affected real events
identically.

Why `waitUntil` rather than awaiting the capture: awaiting would put a network
round trip in front of the response, and the verify path is one of the callers —
the frozen rule is that a metrics ping never delays the counter. `waitUntil`
extends the *invocation* after the response is already sent, so the shopper is
unaffected and the ping still lands. Off Vercel it is a no-op, which is why
`captureServerEvent` also awaits its own delivery promise: that covers dev, CI and
any non-Vercel host, where the process outlives the request anyway.

Why the primitive is inlined instead of imported from `@vercel/functions`: that
package's whole implementation is two lines reading a `Symbol.for` key off
`globalThis`, but it depends on `@vercel/oidc` → `@vercel/cli-config` +
`@vercel/cli-exec` → `execa`, `zod`, `xdg-app-paths`. Those land in *production*
dependencies, including a package that spawns child processes. Not a trade worth
making for two lines in a payments app, so the symbol is read directly and the
try/catch plus the warning cover the case where that contract changes.

**Verified end to end on the render path, 2026-07-30 01:46:47Z.** `waitUntil` is
the documented primitive for route handlers, which covers 7 of the 8 callers, but
`deal_viewed` fires during a React Server Component render and whether the request
context survives into that async scope could only be settled against a real
deployment. Tested on the preview build of this branch
(`dpl_FS682Nx1aoFnVAttWBqJ8chNWsUC`): **one** deal page request, and the
`deal_viewed` event arrived, timestamped in the same second as the request.

A single trial is enough here because the confound is absent by construction. The
deployment was brand new, this was its first-ever request, it is auth-gated and
`noindex` so nothing else was hitting it, and no second invocation existed in the
two minutes before the stream was read — so nothing could have thawed the instance
and flushed a leftover ping, which is the mechanism that made two of four
production requests appear to succeed before the fix. The same isolated-request
scenario dropped the event 2 out of 2 times on production beforehand.

**One untagged event exists as a result.** Preview does not carry
`MAANTA_DEMO_MODE`, so that test event is `is_demo: false` / no `environment` while
describing a demo deal (`27e0b2c1-d8c6-4921-b1f2-7640fb757341`, "Kids uniform
bundle"). Exclude it: `deal_viewed` at `2026-07-30 01:46:47.934Z`. If preview
deployments are ever used for rehearsal traffic rather than one-off checks, set
`MAANTA_DEMO_MODE=true` on the Preview environment too — otherwise synthetic
preview activity lands in the stream indistinguishable from real production
activity, which is the failure the tagging exists to prevent.

### Signed-out views all shared one person — found 2026-07-30, fixed

Reading the first correctly-delivered production event surfaced the next problem in
the same area. `captureDealViewed` attributed signed-out shoppers to the literal
string `"anonymous"`:

```ts
const distinctId = args.clerkUserId ?? "anonymous";
```

Browsing the feed does not require an account, so **most of the top of the funnel
collapsed onto a single PostHog person** (`3b0220f8-5943-5a0c-b064-30790cc857b2`).
Two consequences, both silent:

- `uniq(person_id)` on `deal_viewed` returns **1** for all signed-out traffic,
  however many people it really was.
- A `deal_viewed` → `deal_claimed` funnel **cannot join** for signed-out users: the
  view belongs to `"anonymous"` while the claim belongs to a real Clerk id.

Same failure *shape* as the degenerate demo seed (many rows, one actor, per-user
analysis meaningless), but in live product code against real traffic. It stayed
hidden because the events were not arriving at all.

**Fix.** The server now reuses the id the browser is already using, read from the
posthog-js cookie (`ph_<token>_posthog`) — so server and client events land on one
person, and `posthog.identify()` aliases those pre-signup views onto the real user
at sign-in. Verified against the installed posthog-js: default persistence is
`localStorage+cookie`, no `persistence_name` override, and `defaults: "2026-01-30"`
is below the `2026-05-30` cutoff where `split_storage` would move `distinct_id` out
of that cookie. If any of those change the fix degrades to the fallback bucket
rather than breaking.

**New property: `distinct_id_source`** — `clerk`, `posthog_cookie`, or `none`.

| How to read `deal_viewed` | Rule |
|---|---|
| Per-user metrics (unique viewers, repeat rate, funnels) | Filter to `distinct_id_source IN ('clerk','posthog_cookie')` |
| Volume / counts | All sources are fine |
| Anything before the fix deploys | **No per-user metric is valid.** Every signed-out view is one person; treat it like the pre-fix redemption seed |

`none` is the residual bucket — first-ever view before posthog-js has run, cookies
blocked, bots. It keeps the literal `"anonymous"`, deliberately: the pre-fix data
already sits in that person, so all the untrustworthy attribution stays in one
identifiable place instead of a random id per view quietly inflating person counts.

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

## Production deployment, 2026-07-30

Merging is not deploying in this repo: `.github/workflows/` holds only `ci.yml` and
`e2e.yml`, so nothing pushes migrations. They are applied by hand.

Both of the fixes below were merged (#139, #140) and then applied to the production
project `axrrslqssmbngbataejg`:

| Migration | Function(s) replaced |
|---|---|
| `20260730140000_trial_expiry_launch_sentinel_null_guard` | `handle_trial_expiry()` |
| `20260730150000_demo_wipe_audit_trail_retention` | `demo_admin_ops_target_is_demo()` (new), `demo_agent_is_retained()`, `demo_user_is_retained()`, `wipe_demo_data()` |

Verified live, not assumed: the `COALESCE(..., TRUE)` guard and the `RAISE WARNING`
are present; **both** `AND NOT is_demo` guards survived the replacement (the
regression that CI caught during #139); `demo_user_is_retained()` carries all three
audit arms; the `fraud_events` arm of `demo_agent_is_retained()` is subject-based;
and `admin_ops_log` is deleted **before** `guardian_events` in `wipe_demo_data()`.

`wipe_demo_data()` was then run as a **dry run** (`applied = false`, nothing deleted)
because plpgsql does not validate the SQL inside a function body at `CREATE` time —
executing it is what proves every query in the new body runs against the real schema.
It returned cleanly. Both `RETAINED` lines read **0**, which is correct rather than
suspicious: production has 0 real merchants, 0 real deals and 0 real redemptions, so
there is no real subject for a synthetic actor to be anchored to yet. Retention will
start showing non-zero counts once real merchants exist — that is when this fix
begins to matter.

### Migration versions have to be pinned by hand

`apply_migration` derives the recorded version from the wall clock, not from the
filename. These two first landed as `20260730115309` and `20260730115433` — **below**
their repo filenames — which would have left `supabase db push` treating both as
unapplied. Both rows were corrected in `supabase_migrations.schema_migrations` to
`20260730140000` and `20260730150000`.

**Open drift, not caused by this deployment.** Production records version
`20260730120000` as `node_scoped_opening_credit_cap`, applied by hand and never
committed — there is no such file anywhere in git history. The repo's file at that
same version is `20260730120000_correct_success_fee_config_notes.sql`. Because
Supabase matches on version alone, `db push` treats `20260730120000` as done and
will **silently skip** the success-fee metadata correction, which is therefore
probably not live. Needs a founder call: renumber the repo file, or repair the remote
history. Untouched here.

---

## Follow-ups

- **Only 3 demo customers exist** (`users WHERE is_demo AND role='customer'`), so 354
  redemptions divide across 3 shoppers — about **118 each**. The seed is now correct;
  the shopper pool is the constraint. Seed more demo customers before any demo that
  shows per-user data. *Caution, not blocking.*
- ~~**`MAANTA_DEMO_MODE` in Vercel Production is unverified.**~~ **Closed
  2026-07-30**: set, redeployed, and confirmed from the event stream — see
  "Analytics tagging" above. Note it still needs a redeploy on every future change,
  and `make demo-off` does **not** touch it: turning demo mode off in `app_config`
  while the env var stays `true` would tag real events as demo. Flip both.
- ~~**Server-side capture drops events**~~ (found while verifying the above).
  **Fixed 2026-07-30** — `waitUntil` in `captureServerEvent`, verified end to end on
  a preview deployment including the RSC render path. Two things remain true
  regardless: the dropped events are gone for good, and any server-side funnel or
  conversion rate computed over data from before that deploy is a floor, not a
  measurement.
- **The signed-out attribution fix depends on posthog-js client config.** If anyone
  raises `defaults` in `components/posthog-provider.tsx` to `2026-05-30` or later,
  `split_storage` turns on and moves `distinct_id` out of the cookie the server
  reads — signed-out views would silently fall back to the `none` bucket and the
  funnel would break again. Same if `persistence` or `persistence_name` is set.
  The server cannot distinguish that from a normal first-ever view, so there is no
  runtime warning to catch it; the guard is the comment in
  `lib/analytics-identity.ts` and this note. Re-verify attribution after any
  posthog-js config or major-version change. *Caution, not blocking.*
- **`MAANTA_DEMO_MODE` is not set on the Preview environment.** Harmless while
  previews are only used for one-off checks — it cost exactly one untagged event
  during the verification above. Set it if previews are ever used to show anybody
  the rehearsal dataset. *Caution, not blocking.*
- **Production verification used a Vercel share token.** Repeat the banner check in a
  private browser window for a truly anonymous confirmation.
- **Doc figures drift.** Several docs still cite 291 deals / 339 redemptions; live
  values are 311 total demo deals (248 live) and 354 redemptions, and the hourly
  reseed keeps moving them. Prefer the queries in
  `docs/ops/demo-mode-review-checklist.md` over any written number.
- ~~**Audit-trail retention on wipe**~~ (from PR #128 review). **Founder decision
  2026-07-30: Option C (retention-aware); fixed in migration `20260730150000`.**
  `guardian_events`, `fraud_events` and `admin_ops_log` were deleted when the *actor*
  was a demo user, even where the action targeted a real merchant — so a demo shopper
  at a real counter, or a demo admin acting on a real merchant, cost that real
  merchant its record.

  Audit-row survival is now decided by the **subject** (merchant / deal / redemption /
  ops target), never the actor; the actor is then retained and reported on the
  `RETAINED` lines. No schema change, no relaxing `NOT NULL` on `admin_ops_log`, no
  nulling of actor references.

  Worth knowing why it is not literally "make the deletes respect user retention":
  that is circular — "delete the row iff its actor is deleted" and "keep the actor iff
  a row survives" are mutually defined. It would also have **aborted the wipe**:
  `demo_agent_is_retained()` judged `fraud_events` survival by `NOT EXISTS (demo
  user)`, so a row surviving on a demo-but-retained user would have left its agent
  disposable, and `fraud_events.agent_id` is `REFERENCES agents(id)` with no
  `ON DELETE` action. That helper's fraud arm moved to the same subject-based rule, so
  all three definitions of "does this row survive" now agree.

  Two FKs shape the outcome: `guardian_events.redemption_id` is `NOT NULL … ON DELETE
  CASCADE`, so a guardian row on a *demo* redemption dies with the cascade regardless
  of retention — retention only bites on real redemptions. And an `admin_ops_log`
  target that no longer resolves is deliberately **not** treated as provably demo,
  because an admin action against a since-deleted subject is still a real record.

  Consequence to expect: the wipe now **retains more demo users than before**. That is
  the point, and the `users RETAINED (still referenced)` line is what keeps it honest —
  "wipe" has never meant "every synthetic row is gone".
- ~~**`handle_trial_expiry()` NULL trap**~~ **Fixed 2026-07-30** — migration
  `20260730140000`. The earlier description here was too broad: a missing
  `app_config.node0_launch_period_ends_at` made `NOW() <= NULL` evaluate to NULL,
  which killed the grace-period/agent-task phase and the post-launch immediate
  downgrade, but **not** the grace-expiry downgrade, whose condition never reads the
  sentinel. A partial failure, which is worse than a total one: merchants already in
  grace kept downgrading on schedule while newly-expiring trials froze in Elite with
  no grace row and no error, and the `tier_flags` note silently switched to
  post-launch wording. Now `COALESCE(..., TRUE)` — missing means "launch period
  still open", matching how `activate_merchant` reads the same key, and chosen
  because defaulting the other way would downgrade merchants with **no grace at
  all**, breaching the frozen trial rule on an operator slip. Raises a WARNING so
  the cause is visible in the cron log instead of silent. New suite
  `supabase/tests/trial_expiry_launch_sentinel_test.sql` (4 scenarios); scenario C
  was confirmed to fail against the pre-fix function.
- **Drop the backup table** once the reseed is accepted.
