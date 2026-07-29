# Demo mode — production runbook

**Target:** Supabase project `axrrslqssmbngbataejg`
**Branch:** `claude/maanta-plugin-setup-rt4bfy`
**Audience:** founder or ops lead. `db-push` is human-run.
**Design doc:** `docs/ops/demo-mode.md` (read once before your first run)

Run everything from the repo root. Each step states the command and the output
you should see. **Stop conditions are marked 🛑 — do not continue past one.**

---

## 0. What will run

### Migrations (3, applied by `make db-push`)

| # | File | What it does | Reversible by |
|---|---|---|---|
| 1 | `20260729140000_demo_mode_tagging.sql` | Adds `is_demo` / `demo_batch_id` / `demo_source` + partial indexes to `users`, `merchants`, `deals`, `redemptions`, `merchant_transactions`. Seeds `demo_mode_enabled=false`, `demo_flash_deal_floor=12`, `demo_flash_deal_ceiling=40`. Creates `is_demo_mode()`. **Backfills the 3 known seed batches.** | `DROP COLUMN` ×3 per table (header has exact SQL). Drops tagging, destroys no rows. |
| 2 | `20260729141000_demo_mode_isolation.sql` | Re-creates `merchants_public_browse` / `deals_public_browse` with a demo predicate. Re-creates `handle_trial_expiry()` with `AND NOT is_demo` on both loops. Adds `demo_data_census` view. | Re-run `20260726200000_architecture_now_fixes.sql` and `20260701111223_handle_trial_expiry_phase2.sql` — both `CREATE OR REPLACE`. |
| 3 | `20260729142000_demo_mode_reseed.sql` | Creates `reseed_demo_flash_deals()` and `wipe_demo_data()`. Schedules pg_cron job `maanta_demo_reseed` (hourly at `:07`). | `cron.unschedule('maanta_demo_reseed')` + `DROP FUNCTION` ×2. |

**Write scope of migration 1's backfill:** `UPDATE` only, only on rows whose id
matches a shipped seed prefix (`b0/b1/b2`, `c0/c1/c2`, `d0/d1/d2`, `e0`, `f0`),
plus inheritance from an already-tagged demo merchant. No deletes. No row whose
id doesn't match a batch we shipped can be tagged.

**Migration 2 changes `handle_trial_expiry`.** The body is reproduced verbatim
from its own migration with two added `AND NOT is_demo` predicates — no change
to grace length, downgrade conditions, task copy, or `tier_flags` wording.

### Make targets

| Target | Underlying SQL | Destructive? |
|---|---|---|
| `make demo-status` | `SELECT is_demo_mode()` + `SELECT * FROM demo_data_census` | No — read only |
| `make demo-on` | `UPDATE app_config SET value='true' WHERE key='demo_mode_enabled'` | No |
| `make demo-off` | same, `'false'` | No |
| `make demo-seed` | runs `supabase/seed/demo_activity_seed.sql` | Demo-scoped; replaces its own batch |
| `make demo-reseed` | `SELECT reseed_demo_flash_deals()` | Demo-scoped insert |
| `make demo-wipe` | dry run, prompt, then `wipe_demo_data(TRUE)` | **YES** — deletes all demo rows |

All resolve `DATABASE_URL` if set, otherwise the local stack. **For production
you must export `DATABASE_URL` first** or you'll silently hit localhost.

---

## 1. Apply the migrations

```bash
cd ~/MAANTA
git checkout claude/maanta-plugin-setup-rt4bfy && git pull
export DATABASE_URL="postgresql://postgres:<PASSWORD>@db.axrrslqssmbngbataejg.supabase.co:5432/postgres"
```

### 1a. Baseline — capture the before state

```bash
psql "$DATABASE_URL" -c "
SELECT 'merchants' t, count(*) FROM public.merchants
UNION ALL SELECT 'deals', count(*) FROM public.deals
UNION ALL SELECT 'users', count(*) FROM public.users;"
```

Expected, as measured 2026-07-29:

```
     t     | count
-----------+-------
 merchants |   213
 deals     |   291
 users     |   228
```

> 🛑 **Stop if merchants > 213.** New merchants have signed up since the audit.
> They are almost certainly real and must NOT be tagged. Re-run the origin query
> in `docs/ops/demo-mode.md` and confirm which prefixes are present before
> continuing.

### 1b. Preview

```bash
make db-list        # local vs remote migration state
make db-push-dry    # preview, writes nothing
```

Expect the three `20260729…` migrations listed as pending and nothing else
unexpected.

> 🛑 **Stop if any migration you don't recognise appears as pending.**

### 1c. Apply

```bash
make db-push
```

Watch for these `NOTICE` lines from migration 1:

```
NOTICE:  demo-mode backfill complete: 213 demo merchants, 291 demo deals, 7 real users retained.
```

and from migration 3:

```
NOTICE:  demo reseed scheduled: maanta_demo_reseed (hourly at :07)
```

> 🛑 **Stop if you also see** `NOTICE: demo-mode backfill: N merchant(s) left
> untagged — treated as REAL.` That is not automatically an error — it means N
> merchants didn't match a shipped seed prefix. Identify them before going
> further:
> ```sql
> SELECT id, merchant_name, created_at FROM public.merchants WHERE NOT is_demo;
> ```
> If they're genuinely real, good — the backfill did the right thing. If they're
> synthetic from a batch nobody documented, tag them by hand before enabling
> demo mode.

---

## 2. Confirm tagging and backfill

```bash
make demo-status
```

Expected:

```
 demo_mode_on
--------------
 f

      table_name       | demo_rows | real_rows
-----------------------+-----------+-----------
 merchants             |       213 |         0
 deals                 |       291 |         0
 users                 |       221 |         7
 redemptions           |         5 |         0
 merchant_transactions |         4 |         0
```

Then three integrity checks:

```sql
-- 2a. The 7 real users survived untagged.
SELECT count(*) FROM public.users WHERE NOT is_demo;                  -- expect 7

-- 2b. Attribution is complete — no demo row without a source.
SELECT count(*) FROM public.merchants WHERE is_demo AND demo_source IS NULL;  -- expect 0

-- 2c. Public surfaces are clean with demo mode off.
SELECT count(*) FROM public.deals_public_browse;                      -- expect 0
SELECT count(*) FROM public.merchants_public_browse;                  -- expect 0
```

`2c` returning **0** is correct and is the whole point: 291 synthetic deals were
publicly visible before this migration and are now hidden.

> 🛑 **Stop if 2a is not 7** (or your expected real-user count). Something tagged
> a real user. `wipe_demo_data` would delete it. Do not proceed to any wipe.

> 🛑 **Stop if 2c is non-zero while `demo_mode_on` is `f`.** The browse views
> didn't take. Re-check migration 2 applied.

### 2d. Confirm the trial cron is scoped and still scheduled

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

Expected — **both** jobs present:

```
        jobname          | schedule  | active
-------------------------+-----------+--------
 maanta_demo_reseed      | 7 * * * * | t
 maanta_handle_trial_expiry | ...    | t
```

> 🛑 **Stop if `maanta_handle_trial_expiry` is missing.** Migration 2 replaces
> the function, not the schedule, so it should be untouched — but this cron was
> silently unscheduled once before (decisions log, 2026-07-29).

---

## 3. Enable demo mode and seed

### 3a. Turn it on

```bash
make demo-on
```

```
 demo_mode_on
--------------
 t
Demo mode ON. Also set MAANTA_DEMO_MODE=true in the app environment so analytics events are tagged.
```

### 3b. Set the analytics flag

In Vercel → project → Settings → Environment Variables (Production):

```
MAANTA_DEMO_MODE = true
```

**Redeploy** for it to take effect. Without this, rehearsal traffic is recorded
with `is_demo:false` and mixes into real PostHog insights.

### 3c. Seed activity history

```bash
make demo-seed
```

```
NOTICE:  demo activity seed: <N> verified redemptions across <M> merchants
```

Expect N in the low hundreds and M around 120–130 (≈60% of 213 merchants).

> 🛑 **Stop on** `WARNING: demo activity seed produced no rows`. It means there
> are no demo users with `role='customer'`, so verified counts will stay empty.

### 3d. Fill the flash pool

```bash
make demo-reseed
```

```
 deals_created
---------------
            40
```

First run creates up to the ceiling (40). **Running it again immediately
returns 0** — that's the floor check working, not a failure.

### 3e. Confirm it looks alive

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM public.deals_public_browse;"
```

Now non-zero (hundreds). Then open the site:

- The **amber demo banner** must be visible on `/`, `/feed`, and merchant pages.
- `/feed` shows flash deals with a spread of expiry times.

> 🛑 **Stop if the banner is missing while demo data is visible.** Synthetic
> data is showing without disclosure. Turn demo mode off (`make demo-off`) and
> investigate before showing anyone.

### 3f. Ongoing

The cron tops the pool up hourly at `:07`. Nothing to do. To force a top-up
before a demo, run `make demo-reseed`.

---

## 4. Launch: disable and wipe

Run in order. **Do not reorder** — step 3's dry run is your last review point.

### 4.1 Turn demo mode off

```bash
make demo-off
```

```
 demo_mode_on
--------------
 f
```

### 4.2 Unset the analytics flag

Remove `MAANTA_DEMO_MODE` from Vercel Production (or set `false`). **Redeploy.**

### 4.3 Verify the public surfaces are already clean

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM public.deals_public_browse;"   # expect 0
```

Demo data is now invisible even though it still exists. **If launch is
imminent and you're short on time, you are already safe here** — the wipe is
hygiene, not a gate.

### 4.4 Review the blast radius

```bash
make demo-wipe
```

It prints the **dry run first** and waits:

```
Dry run — rows that WOULD be deleted:
      table_name       | rows_affected | applied
-----------------------+---------------+---------
 guardian_events       |             0 | f
 fraud_events          |             1 | f
 boost_flags           |             0 | f
 audit_logs            |             0 | f
 fee_reversals         |             0 | f
 admin_ops_log         |             0 | f
 agents                |             1 | f
 leads (detached)      |             0 | f
 tier_flags            |             ? | f
 agent_tasks           |             ? | f
 redemptions           |             ? | f
 merchant_transactions |             4 | f
 deals                 |             ? | f
 merchants             |           213 | f
 users                 |           221 | f
Type 'wipe' to delete all demo data:
```

**Read the `merchants` and `users` rows before typing anything.** They should
match section 2's census. Anything else means the tagging changed since.

> 🛑 **Stop if `users` exceeds your demo user count**, or if a real merchant
> count you expect to keep appears here. Type anything other than `wipe` to
> abort — nothing is deleted.

Type `wipe` to proceed.

### 4.5 Verify clean

```bash
make demo-status
```

```
      table_name       | demo_rows | real_rows
-----------------------+-----------+-----------
 merchants             |         0 |         0
 deals                 |         0 |         0
 users                 |         0 |         7
 redemptions           |         0 |         0
 merchant_transactions |         0 |         0
```

**Every `demo_rows` value must be 0.** `real_rows` for users must still show
your real accounts.

> 🛑 **Stop if any `demo_rows` is non-zero.** The wipe partially failed — most
> likely a new FK dependent. Get the error from:
> ```sql
> SELECT * FROM public.wipe_demo_data(TRUE);
> ```

### 4.6 Unschedule the reseed

```sql
SELECT cron.unschedule('maanta_demo_reseed');
SELECT jobname, active FROM cron.job ORDER BY jobname;
```

Expected — only the trial job remains:

```
          jobname           | active
----------------------------+--------
 maanta_handle_trial_expiry | t
```

> 🛑 **Stop if `maanta_handle_trial_expiry` disappeared.** You unscheduled the
> wrong job. Re-run `20260729092118_schedule_trial_expiry_cron.sql`.

### 4.7 Final eyeball

Load `/`, `/feed`, `/malls/bbs-mall`:
- no demo banner
- no synthetic shops or deals
- BBS Mall counts reflect real merchants only (likely 0 until real signups)

---

## 5. Rollback

| Situation | Action |
|---|---|
| Demo data visible when it shouldn't be | `make demo-off` — instant, no data change |
| Reseed misbehaving | `SELECT cron.unschedule('maanta_demo_reseed');` |
| Need the whole feature gone | Rollback SQL is in each migration's header comment. Drop order: 3, 2, 1. Migration 2's rollback re-runs the two original migrations verbatim. |
| Wipe deleted something it shouldn't | **No undo.** Restore from Supabase PITR. This is why 4.4's dry run exists. |

---

## 6. Safeguard status — honest assessment

### Covered and tested

| Safeguard | Test |
|---|---|
| Flag is fail-safe (`1`/`yes`/empty/missing → off) | `demo_mode_test.sql` A |
| Browse views hide demo, never hide real | B |
| Demo merchant hides its deals even if the deal is untagged | C |
| Trial cron skips demo, still processes real | D |
| Reseed no-ops when off; only ever writes demo rows | E |
| Wipe is dry-run by default; spares real rows | F |
| Wipe clears FK blockers; spares real audit trails; detaches leads | G |
| App excludes demo **by default**, not by opt-in | `visibility.test.ts` |
| Feed excludes demo when the flag can't be read | `get-live-deals.test.ts` |

### Known gaps — accept or close before you rely on them

1. **`demo_mode_test.sql` has not been run against the full migration chain.**
   It was verified against a hand-built fixture (this container has no Docker,
   so `make db-verify` couldn't run). **Run `make db-verify` locally before
   `db-push`** — that boots a throwaway stack, applies all 71 migrations, and
   runs every `supabase/tests/*.sql`. This is the single most valuable thing you
   can do before applying.

2. **`/demo/deal-placeholder.svg` does not exist.** Reseeded deals reference it,
   so demo flash deals will show a broken image. Either add the file to
   `maanta-app/public/demo/` or change the `image_url` literal in migration 3.
   Cosmetic, but it will be visible in exactly the screenshots you want.

3. **Two switches, not one.** `app_config` drives visibility; `MAANTA_DEMO_MODE`
   drives analytics tagging. Drift is possible. Failure is in the safe direction
   (events tagged `is_demo:false`, i.e. today's behaviour) and both are in this
   runbook, but it is not one lever.

4. **Demo mode is global, not per-session.** While it's on, every visitor sees
   the synthetic marketplace — with the banner. There is no "demo for me only".

5. **Admin surfaces are not demo-filtered.** `/admin/*` still shows demo and
   real rows together. That's arguably correct for an operator view, and
   `demo_data_census` gives the split on demand — but if you screenshot an admin
   dashboard for anyone external, those numbers include synthetic rows.

6. **No `is_demo` on `leads`.** Waitlist signups are all treated as real. Given
   `leads` is currently empty this costs nothing, but a demo waitlist entry
   would need tagging by hand.
