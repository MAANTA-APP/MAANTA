# Migration deployment plan — three migrations, 2026-09-03

**Requested by founder ruling 3, 2026-09-03.** Nothing here has been applied.
This document is the pre-authorisation proof, not a record of a deployment.

**Currently deployed application:** `origin/main` = `c3b2fd3` (Vercel serves
`main`). Every compatibility claim below is verified against **that commit's
source**, not against this branch.

**Production ledger before apply:** 107 rows, high-water `20260830120000`,
reconciling 107/107 with `supabase/migrations/`.

---

## 0. The ordering question, answered first

**Migrations must be applied BEFORE the application deploys.** This is not a
preference; the reverse order breaks the shopper feed.

| Order | What happens |
|---|---|
| **Migrations first, then app** ✅ | Deployed app keeps working (proof below). Shopper sees a stale "N left" and may tap Claim on a full deal, and gets the correct HTTP 410 *"This deal is fully claimed."* — because `c3b2fd3` **already maps that error**. Degraded, honest, self-correcting on deploy |
| App first, then migrations ❌ | The new app selects the computed column `claims_reserved`, which does not exist yet. PostgREST returns an error, `getLiveDeals` fails, and `/feed`, `/browse`, `/map`, `/search` and `/deals/[id]` all render their read-failure state. **Total shopper outage** until the migration lands |

There is one behavioural window to accept knowingly, and it is small: between
apply and deploy, the deployed UI computes "fully claimed" from `claims_count`
(redemptions), so a deal whose allocation is genuinely full still shows a Claim
button. The shopper who taps it is refused correctly and told why. Demo mode is
ON and external field validation is 0, so the population exposed to that window
is prospects looking at synthetic deals.

**Recommended sequence:** apply all three → read back → repair the ledger →
deploy the app → post-deploy proof → then browser E2E → then Merchant 01.

---

## 1. `20260903120000_claim_allocation_cap.sql` — D236

**Purpose.** Make `max_claims` mean *the maximum number of shopper claims that
may be issued*, enforced at claim issuance, with an expired claim releasing its
slot (founder rulings 1 and D224).

### Affected objects

| Object | Change | Kind |
|---|---|---|
| `public.claim_occupies_allocation(text, timestamptz)` | CREATE | new function |
| `public.claims_reserved(public.deals)` | CREATE | new function (PostgREST computed column) |
| `idx_redemptions_deal_status_expiry` | CREATE INDEX | new index on `redemptions (deal_id, status, expires_at)` |
| `public.reserve_deal_claim_slot()` | CREATE | new trigger function |
| `redemptions_reserve_claim_slot` | CREATE TRIGGER | **new BEFORE INSERT trigger on `redemptions`** |
| `public.claim_deal(uuid,uuid,text,geography)` | CREATE OR REPLACE | body only |
| `deals.max_claims`, `deals.claims_count` | COMMENT | metadata only |

**No column is added, altered or dropped. No table is rewritten. No row is
updated. No data is deleted.**

### Locks and expected impact

| Statement | Lock | Expected duration |
|---|---|---|
| `CREATE INDEX` on `redemptions` | `SHARE` — blocks writes to `redemptions` for the build | **405 rows on production.** Milliseconds. Measured locally at 4,631 rows: still sub-second |
| `CREATE TRIGGER` on `redemptions` | `ACCESS EXCLUSIVE`, momentary | Milliseconds |
| `CREATE OR REPLACE FUNCTION` | none on tables | Instant |

`CREATE INDEX CONCURRENTLY` is **deliberately not used**: it cannot run inside a
transaction block, and the migration runner wraps each file in one. At 405 rows
the non-concurrent build is far cheaper than splitting the migration.

**Blast radius during apply:** claims cannot be inserted for the duration of the
index build. That is the only write path affected, and it is measured in
milliseconds.

### Backward compatibility with `c3b2fd3` — verified, not assumed

| Check | Method | Result |
|---|---|---|
| `claim_deal` signature unchanged | `oid::regprocedure` on production vs post-migration local | **Identical** — `claim_deal(uuid,uuid,text,geography)` on both. No overload added |
| `claim_deal` result shape unchanged | `pg_get_function_result` on both | **Identical** 11-column TABLE |
| `verify_redemption` untouched | `md5(pg_get_functiondef())` on both | **`faf4770acef192f3d6ed1d254647930c` on both.** Byte-identical. The money path is provably unchanged |
| Deployed app handles the new refusal | read `c3b2fd3:src/app/api/redemptions/route.ts` | **Yes** — line 212 maps `deal_claim_limit_reached` → HTTP 410 *"This deal is fully claimed."* This error is not new to the deployed app; only the circumstances that raise it are |
| Deployed app breaks on the new column | `grep claims_reserved` in `c3b2fd3:src/lib/data.ts` | **No** — it selects neither the old nor the new column. PostgREST computed columns are opt-in |
| Direct inserts by seeds/admin | trigger applies to all writers | Seeds run as `service_role`; a seed exceeding a deal's `max_claims` would now fail. **Demo seeds use `max_claims` well above their insert counts**; the demo reseed also deletes and recreates deals, so it starts from zero occupancy |

**Verdict: compatible.** The deployed app cannot crash on this migration, and
the one user-visible difference is a stale count that resolves on deploy.

### Rollback / forward repair

Forward-repair is preferred; nothing here is destructive.

```sql
-- Disable enforcement without dropping anything (fastest mitigation):
ALTER TABLE public.redemptions DISABLE TRIGGER redemptions_reserve_claim_slot;

-- Full reversal, if required:
DROP TRIGGER IF EXISTS redemptions_reserve_claim_slot ON public.redemptions;
DROP FUNCTION IF EXISTS public.reserve_deal_claim_slot();
DROP FUNCTION IF EXISTS public.claims_reserved(public.deals);
DROP FUNCTION IF EXISTS public.claim_occupies_allocation(text, timestamptz);
DROP INDEX IF EXISTS public.idx_redemptions_deal_status_expiry;
-- then re-apply 20260818120000_claim_deal_csprng_otp.sql to restore claim_deal
```

Reverting is safe **only while the old app is deployed**. Once the new app is
live it selects `claims_reserved`; dropping that function without rolling the
app back would break the feed. **Roll the app back first, then the migration.**

### Post-apply proof

```sql
-- 1. The three objects exist.
SELECT proname FROM pg_proc WHERE proname IN
  ('claim_occupies_allocation','claims_reserved','reserve_deal_claim_slot')
  AND pronamespace='public'::regnamespace ORDER BY 1;              -- expect 3 rows

-- 2. The trigger is enabled ('O' = origin, i.e. active).
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgrelid='public.redemptions'::regclass AND tgname='redemptions_reserve_claim_slot';

-- 3. Exactly ONE claim_deal, with the unchanged contract.
SELECT oid::regprocedure::text, pg_get_function_result(oid)
  FROM pg_proc WHERE proname='claim_deal' AND pronamespace='public'::regnamespace;

-- 4. verify_redemption is untouched.
SELECT md5(pg_get_functiondef(oid)) = 'faf4770acef192f3d6ed1d254647930c' AS money_path_unchanged
  FROM pg_proc WHERE proname='verify_redemption' AND pronamespace='public'::regnamespace;

-- 5. No deal is over-subscribed right now.
SELECT count(*) AS over_subscribed FROM public.deals d
 WHERE d.max_claims IS NOT NULL AND public.claims_reserved(d) > d.max_claims;   -- expect 0

-- 6. Nothing was mutated: the row counts are the ones measured before apply.
SELECT count(*) AS redemptions FROM public.redemptions;   -- expect the pre-apply number
SELECT count(*) AS deals FROM public.deals;               -- expect 2932
```

---

## 2. `20260903130000_enforce_user_blacklist.sql` — D171

**Purpose.** Make `users.is_blacklisted` an enforced control: `claim_deal`
refuses a blacklisted shopper, and only an admin can move the flag.

### Affected objects

| Object | Change | Kind |
|---|---|---|
| `public.claim_deal(...)` | CREATE OR REPLACE | body only — adds the blacklist gate **on top of** migration 1's body |
| `public.prevent_self_blacklist_change()` | CREATE | new trigger function |
| `prevent_self_blacklist_change_trigger` | CREATE TRIGGER | new BEFORE UPDATE on `users` |
| `admin_ops_log_target_type_check` | DROP + ADD CONSTRAINT | **widened** to allow `'user'` |
| `users.is_blacklisted` | COMMENT | metadata only |

**This migration depends on migration 1** — it re-creates `claim_deal` including
migration 1's occupancy check. Applying 2 without 1 would reference
`claim_occupies_allocation`, which would not exist. **Apply in order.**

### Locks and expected impact

| Statement | Lock | Duration |
|---|---|---|
| `CREATE TRIGGER` on `users` | `ACCESS EXCLUSIVE`, momentary | Milliseconds |
| `DROP` + `ADD CONSTRAINT` on `admin_ops_log` | `ACCESS EXCLUSIVE`; the ADD validates existing rows | Milliseconds — the constraint is **strictly wider** than the one it replaces, so every existing row already satisfies it |

### Backward compatibility with `c3b2fd3` — the ordering-sensitive one

This is the migration the founder was right to flag.

`user_blacklisted` is a **new error token** and the deployed app does **not**
map it: `c3b2fd3:src/app/api/redemptions/route.ts` contains zero occurrences, so
it would fall through to the generic branch and return **HTTP 500 "Could not
start redemption. Please try again."** — a server error for what is really a
policy decision.

**Why that is nonetheless safe to apply now, verified:**

| Check | Method | Result |
|---|---|---|
| Any blacklisted user on production? | `SELECT count(*) FROM users WHERE is_blacklisted` | **0** |
| Can the deployed app set the flag? | `git grep is_blacklisted origin/main -- src/app/api` | **0 hits — no write path exists in the deployed app** |
| Can anything else set it? | `is_blacklisted` appears only in two admin **read** surfaces at `c3b2fd3` | No |

So `user_blacklisted` **cannot be raised** while `c3b2fd3` is deployed: nothing
can put a user into the state that triggers it. The migration is **inert on
arrival** and becomes live only when the new app ships the admin control that
can set the flag — which is the same deploy that adds the error mapping.

**Operational consequence to accept explicitly:** between apply and deploy, do
**not** set `is_blacklisted` by hand in the Supabase console. Doing so would give
that shopper a 500 on every claim instead of a clear refusal. There is no reason
to, and after the app deploys the console is not the way to do it anyway.

### Rollback / forward repair

```sql
DROP TRIGGER IF EXISTS prevent_self_blacklist_change_trigger ON public.users;
DROP FUNCTION IF EXISTS public.prevent_self_blacklist_change();
-- The widened CHECK is harmless and should be LEFT IN PLACE: narrowing it again
-- would fail if any 'user' row has been written to admin_ops_log.
-- then re-apply 20260903120000 to restore claim_deal without the blacklist gate
```

### Post-apply proof

```sql
-- 1. The gate is in the deployed function.
SELECT pg_get_functiondef(oid) LIKE '%user_blacklisted%' AS gate_present
  FROM pg_proc WHERE proname='claim_deal' AND pronamespace='public'::regnamespace;

-- 2. The self-change trigger exists and is enabled.
SELECT tgname, tgenabled FROM pg_trigger
 WHERE tgrelid='public.users'::regclass AND tgname='prevent_self_blacklist_change_trigger';

-- 3. The audit CHECK accepts a user target.
SELECT pg_get_constraintdef(oid) LIKE '%user%' AS accepts_user
  FROM pg_constraint WHERE conname='admin_ops_log_target_type_check';

-- 4. Still zero blacklisted users — this migration changes no data.
SELECT count(*) AS blacklisted FROM public.users WHERE is_blacklisted;   -- expect 0

-- 5. Still exactly one claim_deal.
SELECT count(*) AS overloads FROM pg_proc
 WHERE proname='claim_deal' AND pronamespace='public'::regnamespace;     -- expect 1
```

---

## 3. `20260903140000_repair_merchant_tenant_policies.sql` — D168

**Purpose.** Ten tenant RLS policies raise `42501 permission denied for table
merchants` instead of filtering. Repair without restoring the `merchants` grant.

### Affected objects

`public.current_user_merchant_ids()` (CREATE), and **`ALTER POLICY`** on ten
policies across `archive_history`, `boost_flags`, `deals`, `kpi_counters`,
`merchant_staff`, `merchant_transactions`, `pending_topups`, `redemptions`,
`reporting_aggregates`, `tier_flags`.

**No grant is added to any table.** No data is touched.

### Locks and expected impact

`ALTER POLICY` takes a momentary `ACCESS EXCLUSIVE` lock on its table. Ten
tables, milliseconds each.

**The obvious risk was designed out rather than accepted.** The first draft of
this migration used `DROP POLICY` + `CREATE POLICY`, which leaves a window in
which a tenant-isolation policy does not exist on a live table. Whether that
window is visible to another session depends on the migration runner wrapping
the file in a transaction — a property this repository neither controls nor can
verify from here. `ALTER POLICY` replaces the expression **in place**, so the
window does not exist under any runner behaviour, and it cannot silently change
a policy's command or its `WITH CHECK` derivation because it does not touch
them.

### Backward compatibility with `c3b2fd3`

| Check | Result |
|---|---|
| Does the deployed app read these tables as `authenticated`? | **No.** 93 modules use the service client (which bypasses RLS); the 7 user-client modules do not read these tables with it |
| Does anything depend on the current `42501` behaviour? | No — it is a hard error nothing catches |
| Is the change strictly an improvement? | Yes: three policies go from *always erroring* to *filtering correctly*; seven dormant ones become correct before they are ever granted |

**Verdict: the safest of the three.** It cannot change any behaviour the
deployed app exercises.

### Rollback / forward repair

The prior policies are recoverable verbatim from
`20260630231915_maanta_schema_v3_baseline.sql`. Reverting restores a **broken**
state, so it should only be done if the new policies are shown to be wrong —
in which case the correct move is a forward fix, not a revert.

```sql
DROP FUNCTION IF EXISTS public.current_user_merchant_ids();  -- CASCADE not needed;
-- policies must be re-created from the baseline first, or this will fail.
```

### Post-apply proof

```sql
-- 1. No policy reads public.merchants directly any more.  Expect 0 rows.
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname='public' AND qual LIKE '%FROM merchants%';

-- 2. The helper is definer, argument-free, uuid-returning.
SELECT proname, pronargs, prosecdef, pg_catalog.format_type(prorettype,NULL)
  FROM pg_proc WHERE proname='current_user_merchant_ids'
   AND pronamespace='public'::regnamespace;      -- expect 0 args, true, uuid

-- 3. D147 is INTACT — this is the check that matters most.
SELECT has_table_privilege('authenticated','public.merchants','SELECT') AS must_be_false,
       has_table_privilege('anon','public.merchants','SELECT')          AS must_be_false_too,
       has_table_privilege('authenticated','public.deals','SELECT')     AS must_be_false_3;

-- 4. anon cannot execute the helper.
SELECT has_function_privilege('anon','public.current_user_merchant_ids()','EXECUTE')
  AS must_be_false;

-- 5. The affected reads no longer raise. Run as authenticated:
--    SET LOCAL ROLE authenticated; SELECT 1 FROM public.redemptions LIMIT 1;
--    (expect success, previously 42501)
```

---

## 4. Ledger repair — expected, and how

**Every MCP-hosted apply so far has minted its own version — twelve for twelve.**
Expect three more. Immediately after applying, before anything else:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
 ORDER BY version DESC LIMIT 6;
```

Any version that is not `20260903120000` / `20260903130000` / `20260903140000`
must be repaired to the repository filename under founder authorisation, then:

```sql
SELECT count(*) FROM supabase_migrations.schema_migrations;   -- expect 110
SELECT max(version) FROM supabase_migrations.schema_migrations; -- expect 20260903140000
```

and a full version+name read-back diff against `ls supabase/migrations/`.
**Target: 110/110.**

---

## 5. Pre-apply checklist

- [ ] Founder authorises the apply.
- [ ] Confirm `origin/main` is still `c3b2fd3` (nothing else deployed since).
- [ ] Record pre-apply counts: `redemptions`, `deals`, `merchants`, `users`,
      `schema_migrations`.
- [ ] Apply **1 → 2 → 3, in order, each as a whole file.**
- [ ] Read back the ledger and repair minted versions.
- [ ] Run every post-apply proof above.
- [ ] Confirm counts unchanged (these migrations write no rows).
- [ ] **Only then** deploy the application.
- [ ] Post-deploy: open `/deals/[id]` on a capped deal and confirm the claim
      count and "claims left" agree with `claims_reserved`.
- [ ] Then browser E2E, then Merchant 01.

## 6. What is NOT covered

- Nothing here has been applied, and no production data was written in producing
  it. Production was read `SELECT`-only.
- These migrations do not touch Fast Visit, `app_config`, the success fee, or any
  feature flag. Verified: `grep -l fast_visit supabase/migrations/20260903*.sql`
  returns nothing.
