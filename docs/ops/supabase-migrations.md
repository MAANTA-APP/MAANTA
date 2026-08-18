# Ops — Supabase migrations & seed (production)

**Audience:** human operator with Supabase CLI + production credentials.
**Claude Code does NOT run any of this** (repo-only); these are the exact
commands + verifications to run yourself.

## Pinned production project

| | |
|---|---|
| **Production project-ref** | **`axrrslqssmbngbataejg`** (MAANTA-APP org, eu-west-1, Postgres 17, Clerk `cheerful-sailfish-3`) |
| Do NOT use | `vcrfqsevompqjazbwzyh` — old org, treated as **not production**. A historical *comment* in `migrations/20260703233440_*.sql` still names it; leave applied migration SQL untouched. |

**Before anything:** confirm the app really points here — read Vercel
`NEXT_PUBLIC_SUPABASE_URL` for the Production environment and check it contains
`axrrslqssmbngbataejg`. If it doesn't, stop and reconcile first.

## 1. Link

Run from `maanta-app/` (where `supabase/` lives):

```bash
cd maanta-app
supabase link --project-ref axrrslqssmbngbataejg
# prompts for the DB password (Supabase dashboard → Project settings → Database)
```

## 2. See what's applied vs local

```bash
supabase migration list
# LOCAL column = files in supabase/migrations/; REMOTE = applied on prod.
# Any row present locally but missing remotely still needs pushing.
```

## 3. Push migrations

```bash
supabase db push        # applies every not-yet-applied migration, in order
# add --dry-run first to preview without writing:
supabase db push --dry-run
```

Prefer a **low-traffic window** — the hardening migrations are grant/view/table
changes and can take brief locks.

### Paused-deal claim gate deploy (D25) — LANDED 2026-08-04

**Done — do not re-run.** The pause gate went live on production on 2026-08-04
via a founder-authorized MCP apply (initially recorded under MCP-minted ledger
versions; on 2026-08-05 the ledger was repaired to the repo filenames
**`20260730180000`** / **`20260730190000`**, closing **D24**). Verified by
read-back: `pg_get_functiondef(claim_deal)` contains `deal_paused`,
`deals_public_browse` filters `is_paused`, `verify_redemption` ignores
`is_paused`. **D25 is closed.** Canonical semantics:
`docs/skills/paused-deal-semantics.md` / `CLAUDE.md` (Paused deals).

### The #48–#61 hardening set (must be present after push)

From `docs/skills/prod-handoff-security-audit-2026-07-23.md`, apply in filename
order (they are all already in `supabase/migrations/`, so `db push` handles them):

1. `20260722180000_lock_down_internal_money_rpcs.sql`
2. `20260722190000_capture_lead_atomic.sql`
3. `20260722200000_fix_capture_lead_column_ambiguity.sql`
4. `20260723120000_revoke_authenticated_writes_core_tables.sql`  (C-1/C-2/C-3)
5. `20260723130000_fix_browse_views_security_invoker.sql`        (H-1)
6. `20260723140000_admin_ops_log.sql`                            (M-3)

## 4. Seed (rehearsal data)

There is **no** `supabase/seed.sql`, so `supabase db push --include-seed` has
nothing to load — do **not** rely on it. Seed scripts are separate, **idempotent**,
and applied explicitly:

```bash
# Small rehearsal accounts + 3 deals + live OTP (see docs/maanta-node0-rehearsal-checklist.md)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/node0_rehearsal_seed.sql

# 100 live BBS Mall deals for Discover/Browse rails (60 merchants; flash/boosted/standard)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/node0_100_deals_seed.sql
# or: ./scripts/apply-100-deals-seed.sh
```

…or paste either file into the Supabase SQL Editor. Re-running refreshes deal
expiry windows. Only seed a project you intend to demo on.

**Do not** paste shell (`export DATABASE_URL=…`, `./scripts/…`) into the SQL
Editor — that is what previously left prod unseeded. Use `psql`, the apply
script, or paste the **`.sql` file contents** only.

After the 100-deal seed:

```sql
SELECT count(*) FROM merchants WHERE id::text LIKE 'c1000000-%';  -- ~60
SELECT count(*) FROM deals     WHERE id::text LIKE 'd1000000-%';  -- ~100
```

### Lat/lng migration (required for Browse pins / distance)

`20260726120000_merchant_lat_lng.sql` adds `merchants.lat` / `merchants.lng` and
extends `merchants_public_browse`. If this version is missing remotely, older
app builds that select `lat,lng` throw on `/feed` (error boundary). Current app
code retries without those columns, but Browse distance still needs the push:

```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260726120000';
```

## 5. Verify the push took

```sql
-- 5a. Exactly the six hardening versions present (expect 6 rows, all six):
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260722180000','20260722190000','20260722200000',
  '20260723120000','20260723130000','20260723140000'
)
ORDER BY version;
-- If this returns fewer than 6, the missing version(s) still need `db push`.

-- 5b. Core-table writes ALL revoked from authenticated — INSERT/UPDATE/DELETE
--     on merchants/redemptions/deals (expect every column false):
SELECT c AS tbl,
       has_table_privilege('authenticated','public.'||c,'INSERT') AS ins,
       has_table_privilege('authenticated','public.'||c,'UPDATE') AS upd,
       has_table_privilege('authenticated','public.'||c,'DELETE') AS del
FROM unnest(ARRAY['merchants','redemptions','deals']) AS c;

-- 5c. Audit / money tables exist (expect all not-null / true):
SELECT to_regclass('public.admin_ops_log')  IS NOT NULL AS admin_ops_log,
       to_regclass('public.guardian_events') IS NOT NULL AS guardian_events,
       to_regclass('public.fee_reversals')   IS NOT NULL AS fee_reversals;

-- 5d. Internal money RPC is service_role-only: denied to anon + authenticated,
--     allowed for service_role (expect false, false, true):
SELECT has_function_privilege('anon',
         'public.deduct_success_fee_or_record_arrears(uuid,uuid,numeric)','EXECUTE') AS anon_exec,
       has_function_privilege('authenticated',
         'public.deduct_success_fee_or_record_arrears(uuid,uuid,numeric)','EXECUTE') AS authed_exec,
       has_function_privilege('service_role',
         'public.deduct_success_fee_or_record_arrears(uuid,uuid,numeric)','EXECUTE') AS service_exec;

-- 5e. The redundant merchant-financial guard is GONE (dropped by
--     20260724120000_drop_redundant_merchant_financial_guard.sql). If either is
--     still present, the money-path (verify_redemption / boosts) stays blocked —
--     expect BOTH false:
SELECT EXISTS (
         SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_protect_merchant_financial_columns' AND NOT tgisinternal
       ) AS trigger_present,
       to_regprocedure('public.protect_merchant_financial_columns()') IS NOT NULL
         AS function_present;
```

Then run the **audit SQL subset** against prod (self-cleaning, but still a
mutation — low-traffic window):

```bash
cd maanta-app
export DATABASE_URL="postgresql://..."   # prod connection string
for f in security_hardening_test capture_lead_test \
         revoke_authenticated_writes_core_tables_test browse_views_test \
         admin_ops_log_test; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "supabase/tests/$f.sql"
done

# no residue — check every known test-data class, not just merchant names
# (the suites also create rate-limit buckets; security-hardening.md treats
# both as residue). Expect 0 for every count:
psql "$DATABASE_URL" -c "
  SELECT
    -- '\_\_test%' escapes the underscores so LIKE matches the literal '__test'
    -- fixture prefix, not '_' as a single-char wildcard (which would also match
    -- names like 'abtest…'). Backslash is LIKE's default escape char.
    (SELECT count(*) FROM merchants WHERE merchant_name LIKE '\_\_test%')      AS test_merchants,
    (SELECT count(*) FROM api_rate_limit_buckets WHERE bucket_key LIKE 'test-rate-%') AS test_buckets;
"
```

(If a count is non-zero, a suite failed to self-clean — inspect and remove the
rows before treating the run as clean. Adjust the `api_rate_limit_buckets`
key/column name if the suite uses a different one.)

Each suite ends in a success `RAISE NOTICE`; any failed `ASSERT` aborts under
`ON_ERROR_STOP=1`. The full 14-suite set is what CI `db-tests` runs on every PR.

## 6. Convenience targets

`make -f Makefile <target>` (repo root) wraps the CLI. These are **read/write**
commands — `db-push` **mutates production** (applies migrations). They only
echo/run the CLI above — **review before running against prod**:

| Target | Runs | Effect |
|---|---|---|
| `make db-link` | `supabase link --project-ref axrrslqssmbngbataejg` | local link only |
| `make db-list` | `supabase migration list` | read-only |
| `make db-push-dry` | `supabase db push --dry-run` | read-only (preview) |
| `make db-push` | `supabase db push` (prompts) | **MUTATING — applies migrations to prod** |
| `make db-verify` | boots a **throwaway local** Supabase, applies all migrations, runs `supabase/tests/*.sql`, stops it | **LOCAL/dev ONLY — never touches prod** |

> **`make db-verify` is not a production verification.** It reproduces the CI
> `db-tests` job on a disposable local stack (fixed db_url
> `postgresql://postgres:postgres@127.0.0.1:54322/postgres`). Because the
> assertion suites INSERT test data, they must **only** run against a local
> stack — never against the linked prod project. Requires the Supabase CLI +
> Docker. To verify a **production** push, use the manual read-only SQL subset
> in §5 above (grants, audit tables, spot-checks), not this target.

## 7. Applying via the Supabase MCP — mandatory read-back

`apply_migration` in the Supabase MCP takes **`name` and `query` only. There is
no version parameter.** It mints its own version from the wall clock of the
apply, so an MCP apply **always** records a ledger version that differs from the
committed filename. This is a property of the channel, not an operator slip.

The record is unambiguous — **every MCP apply so far has needed the same
repair**: `20260730180000`, `20260730190000` (2026-08-04, repaired 08-05),
`20260807160000`, `20260807161000` (2026-08-08, repaired same session), and
`20260810120000` (2026-08-10, repaired same session). Five for five. Assume the
next one will too.

**Do this, in order, every time:**

1. **Before the apply**, note the repo filename's version and name — e.g.
   `20260810120000` / `pending_topups`.
2. **Immediately after the apply**, read back what was actually minted:
   ```sql
   select version, name from supabase_migrations.schema_migrations
    where version > '<previous latest version>' order by version;
   ```
3. **If it differs, repair before anything else** — before any further apply,
   any `db push`, and before ending the session:
   ```sql
   update supabase_migrations.schema_migrations
      set version = '<repo filename version>'
    where version = '<minted version>' and name = '<migration name>';
   ```
   Then re-read to confirm, and check the ledger total matches
   `ls supabase/migrations/*.sql | wc -l`.
4. **Check whether the SQL is idempotent**, because it determines what an
   unrepaired ledger costs you. `CREATE OR REPLACE` / `DROP … CREATE` migrations
   survive being replayed under a mismatched version; a bare `CREATE TABLE`,
   `CREATE INDEX` or `CREATE POLICY` does **not** — the next `supabase db push`
   sees the repo file as unapplied, re-runs it, and **errors**. Treat a
   non-idempotent migration's repair as urgent rather than tidy-up.
5. **Record both versions**, the correction, the operator, the timestamp and the
   read-back output — in the drift register and, for a security-relevant change,
   the audit report.

Why this is not automated: the divergence happens inside a hosted tool, so no
test in this repo can assert on it. The control is this procedure. Tracked as
**D86**; the standing preference is `supabase db push`, which keys on the
filename and never mints a version — reach for the MCP only when a human-run
push is not available.

## Safety recap

- Confirm the ref matches Vercel before pushing; never push to
  `vcrfqsevompqjazbwzyh`.
- Prefer `--dry-run` first; apply in a low-traffic window.
- `db push` is forward-only — there is no auto-rollback. Take a DB backup /
  point-in-time snapshot first if you're uneasy.
- `make db-verify` is safe to run anytime in dev/CI (local stack only); it has
  no path to production.

## Versioning rule — never reuse a production ledger number

`supabase db push` matches on the **version string alone**. If production's
`schema_migrations` already holds version `N` for migration A, shipping a
different file also named `N_….sql` in the repo will be **silently skipped**.

### Canonical `20260730*` map (consolidation 2026-07-30)

| Version | File / intent | Notes |
|---|---|---|
| `20260730010000` | `demo_seed_deal_refresh` | Demo cron |
| `20260730120000` | `node_scoped_opening_credit_cap` | Applied to prod by hand 2026-07-30, exported back into the repo 2026-08-05 (D24). Its per-node change was clobbered by `20260730130000` (drift **D73**) and restored by the `20260807160000` reland, applied 2026-08-08 |
| `20260730130000` | `enforce_elite_trial_first_100_cap` | Elite first-100 cap |
| `20260730140000` | `trial_expiry_launch_sentinel_null_guard` | Trial expiry |
| `20260730150000` | `demo_wipe_audit_trail_retention` | Demo wipe |
| `20260730160000` | `correct_success_fee_config_notes` | Renamed in the repo 2026-08-05 from `20260730120000` to match the ledger (the applied copy had declared this number at apply time on 07-30). Filename and ledger now agree |
| `20260730170000` | ~~`node_scoped_opening_credit_cap_reland`~~ | **Never used.** The 07-30 reservation is dead; if the cap reland ever ships, number it with a current timestamp |
| `20260730180000` | `restore_claim_deal_pause_gate` | Applied to production 2026-08-04 (MCP apply); ledger repaired to this filename 2026-08-05 |
| `20260730190000` | `paused_deals_discovery_filter` | Applied to production 2026-08-04 (MCP apply); ledger repaired to this filename 2026-08-05 |
| `20260804010000` | `cofounder_role` | Adds `'cofounder'` to `users_role_check`. Applied to production 2026-08-05 under the same version |
| `20260807160000` | `reland_node_scoped_opening_credit_cap` | The D73 reland: per-node opening-credit lock + joined count. Applied to production 2026-08-08 (MCP apply); minted version repaired to this filename same session |
| `20260807161000` | `cofounder_read_policies` | The D74 policy layer: eight SELECT-only cofounder policies + explicit grants. Applied to production 2026-08-08 (MCP apply); minted version repaired to this filename same session |

When adding a new migration, pick a version **strictly after** the highest row
above that is already on `main` *and* confirm against production's ledger
(`supabase migration list`, or the MCP `list_migrations`) that production does
not already hold that number under a different name.

## Status note (2026-07-28)

Production `axrrslqssmbngbataejg` was verified **fully aligned** with the 67
local migration files (`supabase db push --dry-run` → “Remote database is up
to date”). The “minimum hardening set” and lat/lng / preferred_language
migrations are present. Do not re-push unless `migration list` shows a local
version missing remotely.

**Status note (2026-08-05):** the ledger is **fully reconciled** — production's
`supabase_migrations.schema_migrations` and `supabase/migrations/` agree on all
**85** version/name pairs, verified by a full read-back diff (D24 closed).
Reconciliation was: prod's uncommitted `20260730120000_node_scoped_opening_credit_cap`
exported into the repo (its change is **not in effect** — see D73), the notes
migration renamed to `20260730160000` to match the ledger, and the pause-gate
pair's MCP-minted versions repaired to the repo filenames. `db push` should now
report "Remote database is up to date"; anything else is new drift — register it.

**IPv6 / pooler:** `db.<ref>.supabase.co` may be IPv6-only. Agents or hosts
without IPv6 should use the session pooler URI
(`postgres.<ref>@aws-0-eu-west-1.pooler.supabase.com:5432`) for `psql` /
`db push --db-url`. See `docs/ops/backend-prod-setup-status-2026-07.md`.

**Seed beyond §4:** For multi-node rehearsal also apply
`nairobi_nodes_150_merchants.sql` then `test_accounts_maanta_2026_07.sql`
(`make db-seed-nairobi-150` / `make db-seed-test-accounts`). The 100-deal seed
alone is the Discover/Browse density floor for BBS Mall.

## Awaiting a human apply (as of 2026-08-18)

Two migrations are committed and **not on production**. Apply in this order —
the second writes into the column the first creates:

1. `20260818120000_deal_categories.sql` — adds `deals.category` (NULLable) with
   the named CHECK `deals_category_check` listing **ten** keys, and a **DROP +
   CREATE** of `deals_public_browse` carrying the new column. No index: the
   category predicate lives in the app, so one could never be used (see D118).

   **Check the key count before you apply.** This file was authored with three
   keys and widened to ten on the same day, before any apply. If it somehow
   reached production while it still listed three, applying it again is a no-op
   — the ledger has it — and production will refuse seven of the ten keys with a
   `check_violation` the moment a merchant picks one. Verify with:

   ```sql
   select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'deals_category_check';
   ```

   It must list: fashion, beauty, food, electronics, shoes, home, jewellery,
   health, kids, services. If it lists three, widen it by hand with the
   `DROP CONSTRAINT IF EXISTS` / `ADD CONSTRAINT` pair from the migration, then
   record the manual fix in the drift register. The recreate
   copies the pause predicate verbatim; `supabase/tests/deal_categories_test.sql`
   re-asserts it, so run the SQL suites after the apply rather than assuming.
2. `20260818130000_demo_reseed_categories.sql` — `CREATE OR REPLACE` of
   `reseed_demo_flash_deals()` so the demo catalogue files itself under the
   taxonomy. Idempotent; safe to replay.

Both are idempotent (`ADD COLUMN IF NOT EXISTS`, `DROP … CREATE`,
`CREATE OR REPLACE`), so an unrepaired MCP-minted ledger version costs a
mismatched row rather than a failed re-push — but repair it anyway, per §7.
Until they are applied the app degrades rather than breaking: no chip row, and
new deals publish uncategorised. Tracked as drift **D116**; close it by
read-back, not by merging.
