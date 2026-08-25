# Apply packet — migration 102, `20260824130000_redemptions_claimed_at`

**For:** the founder. **Claude does not apply migrations to production.**
**Status:** **APPLIED AND MERGED 2026-08-25** under explicit founder
authorization. Production ledger reconciles at **102/102**, tail
`20260824130000`. Execution record at the foot of this file.

> The brief for this session pointed at
> `docs/ops/migration-101-apply-packet-2026-08-23.md`. **That file does not
> exist** — on `main`, on `claude/d162-d164`, or in any branch's history. This
> packet replaces the reference rather than the file.

## What this migration does

Four statements, all additive, in one transaction:

1. `ALTER TABLE public.redemptions ADD COLUMN IF NOT EXISTS claimed_at timestamptz`
   — **deliberately with no default**, so Postgres does not backfill history.
2. `ALTER COLUMN claimed_at SET DEFAULT now()` — future inserts only.
3. `CREATE INDEX IF NOT EXISTS idx_redemptions_claimed_at ON public.redemptions (claimed_at)`.
4. `INSERT INTO public.app_config` a `claims_tracking_started_at` row, in the
   same transaction that starts the tracking.

The split in (1)/(2) is the whole point: one `ADD COLUMN … DEFAULT now()` would
stamp every historical redemption with the migration timestamp — a fabricated
claim time on an audit record. **Never backfill `claimed_at`.**

It does not touch `claim_deal`, `verify_redemption`, or any RPC body.

## Why apply BEFORE the merge

The migration is additive and **no deployed code reads `claimed_at`** — the
live build still queries the phantom `created_at`. Applying first is therefore a
behavioural no-op on production, and it removes the window in which the merge is
live but the column is not, which would take both consoles down.

This supersedes the 2026-08-24 sequencing that made the apply wait on a
post-merge dashboard E2E: that E2E is **D172, deferred**, so the gate it named
does not exist.

Two separate authorizations: **apply**, then **merge**.

## Preconditions

- CI green on **#272**, including `db-tests` on real Supabase.
- Ledger read back at **101/101** immediately before applying — not assumed.

## Apply

```sql
-- read the ledger FIRST, never `ls supabase/migrations/` (D121)
select count(*), max(version) from supabase_migrations.schema_migrations;
-- expect: 101 | 20260824120000
```

Then apply `maanta-app/supabase/migrations/20260824130000_redemptions_claimed_at.sql`.

## Repair the ledger — do this before anything else

**Every MCP apply mints its own version. Nine for nine.** D162's minted
`20260824163212`; D158's minted `20260823134241`. Immediately after applying:

```sql
select version, name from supabase_migrations.schema_migrations
 where version > '20260824120000';
```

If the version is anything other than `20260824130000`, repair it to the repo
filename **before** running any other check:

```sql
update supabase_migrations.schema_migrations
   set version = '20260824130000', name = 'redemptions_claimed_at'
 where version = '<the minted version>';
```

## Verify — all six

```sql
-- 1. ledger reconciles at 102/102, by version AND name
select count(*) as total, max(version) as tail
  from supabase_migrations.schema_migrations;                    -- 102 | 20260824130000

-- 2. column nullable, DEFAULT now()
select is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='redemptions'
   and column_name='claimed_at';                                 -- YES | now()

-- 3. index present
select indexname from pg_indexes
 where schemaname='public' and tablename='redemptions'
   and indexdef ilike '%claimed_at%';                            -- idx_redemptions_claimed_at

-- 4. tracking-start config row present
select key, value from public.app_config
 where key = 'claims_tracking_started_at';                       -- one row, a timestamp

-- 5. EVERY historical row still NULL — the one that must not be skipped
select count(*) as total,
       count(claimed_at) as non_null          -- MUST be 0
  from public.redemptions;

-- 6. claim_deal untouched
select position('claimed_at' in
  pg_get_functiondef('public.claim_deal(uuid,uuid,text,geography)'::regprocedure)) as should_be_0;
-- NOTE: the signature is (uuid,uuid,text,geography). A wrong signature raises
-- 42883, and since these six run as one statement that aborts ALL of them.
```

**Check 5 is the one that must not be skipped.** `non_null` must be **0**.
Anything else means history was stamped, and the fix is not to null it back —
it is to stop and work out what wrote it.

Expected row counts, for comparison against the read-back: **401 redemptions**
(396 demo + 5 non-demo) at the time of writing; the demo figure is now frozen
because demo mode is off and both reseed jobs return 0.

## Then, separately, authorize the merge

Merging #272 deploys. Once deployed, `/founder` renders real metrics instead of
its read-failure state, and `/admin` shows an honest Claims (7d) — labelled as
partial while the 7-day window still reaches back past
`claims_tracking_started_at`.

## Rollback

Not needed for correctness — the column is additive and unread until #272
deploys. If it must be reversed **before** the merge:

```sql
DROP INDEX IF EXISTS public.idx_redemptions_claimed_at;
ALTER TABLE public.redemptions DROP COLUMN IF EXISTS claimed_at;
DELETE FROM public.app_config WHERE key = 'claims_tracking_started_at';
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260824130000';
```

After #272 is deployed, do **not** roll back — the dashboards read the column.


---

## Execution record — 2026-08-25

Founder authorized apply and merge together; the packet's order was still
followed, apply first.

| Step | Result |
|---|---|
| Pre-apply ledger | 101, tail `20260824120000` — as expected |
| Pre-apply baseline | 401 redemptions; `claimed_at` did not exist |
| Apply | success |
| **Minted version** | **`20260825083646`** — *ten for ten* |
| Ledger repair | to `20260824130000` / `redemptions_claimed_at`, **before any other check** |

Six verifications, all passing:

| # | Check | Result |
|---|---|---|
| 1 | ledger by version **and** name | **102/102** — full diff against `supabase/migrations/`, identical |
| 2 | column nullable, `DEFAULT now()` | `YES` / `now()` |
| 3 | index | `idx_redemptions_claimed_at` |
| 4 | tracking-start row | `2026-08-25 08:36:46.625659+00` |
| 5 | **every historical row still NULL** | **401 rows, 0 non-NULL** |
| 6 | `claim_deal` untouched | no mention of `claimed_at`; D25 `deal_paused` gate still live |

Then merged: PR #272 into `main` as **`061c92c`**.

Post-merge read-back: ledger 102/102, 401 redemptions / 0 non-NULL, demo mode
still off, 0 live deals, 2 live merchants. The KPI query both dashboards run —
`count(*) where claimed_at >= now() - 7 days` — now **succeeds**, returning an
honest `0` that `claimsWindow()` labels as a partial window rather than the
confident zero that was the defect.

**One correction to this packet, found by running it.** Check 6 was written as
`claim_deal(uuid,uuid)`; the real signature is
**`claim_deal(uuid,uuid,text,geography)`** and the query errored with `42883`.
It is corrected above. Because all six checks were issued as a single statement,
that error meant *none* of them ran on the first attempt — worth knowing, since
a failure in the last check silently withholds the first five. Re-issued with
the right signature, all six passed.

**Not verified:** no browser check of the rendered `/admin` or `/founder`. The
sandbox proxy denies `maanta.app`, `clerk.maanta.app` and the Vercel host, so
the dashboards were confirmed at the query level only. Observing them rendered
is owed by the founder.
