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
nothing to load — do **not** rely on it. The Node 0 rehearsal seed is a separate,
**idempotent** script applied explicitly:

```bash
# via psql (get the connection string from dashboard → Database → Connection string)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed/node0_rehearsal_seed.sql
```

…or paste that file into the Supabase SQL Editor. Re-running refreshes deal
windows + the live OTP ticket (see `docs/maanta-node0-rehearsal-checklist.md`).
Only seed a project you intend to demo on.

## 5. Verify the push took

```sql
-- 5a. All six hardening versions recorded:
SELECT version FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260722%' OR version LIKE '20260723%'
ORDER BY version;

-- 5b. Core-table writes revoked from authenticated (expect f / false):
SELECT has_table_privilege('authenticated','public.merchants','UPDATE')   AS merchants_update,
       has_table_privilege('authenticated','public.redemptions','UPDATE') AS redemptions_update,
       has_table_privilege('authenticated','public.deals','UPDATE')       AS deals_update;

-- 5c. Audit / money tables exist (expect all not-null / true):
SELECT to_regclass('public.admin_ops_log')  IS NOT NULL AS admin_ops_log,
       to_regclass('public.guardian_events') IS NOT NULL AS guardian_events,
       to_regclass('public.fee_reversals')   IS NOT NULL AS fee_reversals;

-- 5d. Internal money RPC not executable by authenticated (expect false):
SELECT has_function_privilege('authenticated',
  'public.deduct_success_fee_or_record_arrears(uuid,uuid,numeric)','EXECUTE');
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

# no residue:
psql "$DATABASE_URL" -c "SELECT count(*) FROM merchants WHERE merchant_name LIKE '__test%';"
```

Each suite ends in a success `RAISE NOTICE`; any failed `ASSERT` aborts under
`ON_ERROR_STOP=1`. The full 14-suite set is what CI `db-tests` runs on every PR.

## 6. Convenience targets

`make -f Makefile <target>` (repo root) wraps the read-safe commands. They only
echo/run the CLI above — **review before running against prod**:

| Target | Runs |
|---|---|
| `make db-link` | `supabase link --project-ref axrrslqssmbngbataejg` |
| `make db-list` | `supabase migration list` |
| `make db-push-dry` | `supabase db push --dry-run` |
| `make db-push` | `supabase db push` (prompts) |

## Safety recap

- Confirm the ref matches Vercel before pushing; never push to
  `vcrfqsevompqjazbwzyh`.
- Prefer `--dry-run` first; apply in a low-traffic window.
- `db push` is forward-only — there is no auto-rollback. Take a DB backup /
  point-in-time snapshot first if you're uneasy.
