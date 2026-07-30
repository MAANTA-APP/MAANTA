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
| `20260730120000` | **BURNED** — `node_scoped_opening_credit_cap` in production | Historical. Production's ledger holds this version for the hand-applied node-scoped credit migration, whose effect `130000` later overwrote. **No repo file uses it.** Never assign it. |
| `20260730130000` | `enforce_elite_trial_first_100_cap` | Elite first-100 cap. Recreates `activate_merchant` in full |
| `20260730140000` | `trial_expiry_launch_sentinel_null_guard` | Trial expiry |
| `20260730150000` | `demo_wipe_audit_trail_retention` | Demo wipe |
| `20260730160000` | `correct_success_fee_config_notes` | **The repo file lives here**, renumbered from `120000` to match the version production actually recorded. Metadata only |
| `20260730170000` | `node_scoped_opening_credit_cap_reland` | Re-lands the per-node credit count **above** `130000`, which had overwritten it. Assigned by #143 — not free |
| `20260730180000` | `restore_claim_deal_pause_gate` | Pause-gate restore (renumbered from `160000`, which was already taken by the notes migration) |

When adding a new migration, pick a version **strictly greater than the highest
assigned or reserved row above** — currently `20260730180000` — and then confirm
with `supabase migration list` that production does not already hold that number
under a different name.

"Already on `main`" is **not** the right bar: `170000` is assigned by an open PR
and `120000` is burned in production with no repo file at all, so both look free
from `main` alone and neither is. Read this table and the remote ledger, not the
`main` file listing.

## Status note (2026-07-28)

Production `axrrslqssmbngbataejg` was verified **fully aligned** with the 67
local migration files (`supabase db push --dry-run` → “Remote database is up
to date”). The “minimum hardening set” and lat/lng / preferred_language
migrations are present. Do not re-push unless `migration list` shows a local
version missing remotely.

**IPv6 / pooler:** `db.<ref>.supabase.co` may be IPv6-only. Agents or hosts
without IPv6 should use the session pooler URI
(`postgres.<ref>@aws-0-eu-west-1.pooler.supabase.com:5432`) for `psql` /
`db push --db-url`. See `docs/ops/backend-prod-setup-status-2026-07.md`.

**Seed beyond §4:** For multi-node rehearsal also apply
`nairobi_nodes_150_merchants.sql` then `test_accounts_maanta_2026_07.sql`
(`make db-seed-nairobi-150` / `make db-seed-test-accounts`). The 100-deal seed
alone is the Discover/Browse density floor for BBS Mall.
