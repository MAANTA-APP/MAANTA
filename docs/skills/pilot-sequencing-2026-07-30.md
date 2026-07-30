# Skill: pilot sequencing and migration-ledger verification (2026-07-30)

Durable handoff from the sequencing session. The plan itself lives at
`docs/maanta-pilot-sequencing-plan-2026-07-30.md`; this note records **how the
state was verified** and **the three findings**, so the next session does not
have to rediscover them.

---

## How to verify repo-vs-production state (do this, don't assume)

"Merged" is not "deployed" and "written" is not "applied". Four cheap checks
establish real state:

```bash
# 1. What does main actually contain?
git log --oneline -5 && ls maanta-app/supabase/migrations/ | tail -10

# 2. Which open PRs carry a DB step? (only these need sequencing)
git fetch origin 'refs/pull/*/head:refs/remotes/pr/*'
for pr in $(...); do
  git diff --name-only --diff-filter=A origin/main...pr/$pr -- maanta-app/supabase/migrations/
done
```

Use `origin/main...pr/N` (three dots, merge-base) — a two-dot diff against a
stale local `main` reports every shared migration as "added" and produces a
useless list.

```sql
-- 3. What is actually applied? Compare names AND versions to the repo filenames.
select version, name from supabase_migrations.schema_migrations order by version;

-- 4. Read the live function BODY, not the migration that claims to have set it.
select pg_get_functiondef(p.oid) from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'activate_merchant';
```

Check 4 is the one that found F2. A version present in `schema_migrations` only
proves a migration *ran once* — a later migration that recreates the same
function silently reverts it.

---

## F1 — Migration version `20260730120000` meant different things in repo and prod — **fixed**

| Where | `20260730120000` was |
|---|---|
| `main` | `correct_success_fee_config_notes` |
| Production | `node_scoped_opening_credit_cap` |
| PR #131 | `node_scoped_opening_credit_cap` |

Production additionally records `20260730160000 correct_success_fee_config_notes`,
a version no repo file used.

Consequences: `db push` from `main` reported divergence and wanted
`migration repair`; merging #131 would have created two files at one version,
which the CLI rejects.

**Remedy applied 2026-07-30:** the repo's notes migration was renumbered to
`20260730160000_correct_success_fee_config_notes.sql` (`git mv`, so history shows
a rename) to match what production recorded. #131's file stays at `20260730120000`.

Two checks worth repeating before any future migration rename:

1. **Is the migration content-inert to reordering?** This one is: two statements,
   an `ON CONFLICT DO UPDATE SET notes` and a `COMMENT ON FUNCTION`. Confirmed
   that nothing in `20260730130000`–`150000` touches `app_config.success_fee_kes`
   or `enforce_deal_success_fee()`, so moving it after them changes nothing on a
   fresh DB. A rename that moves a migration across one that recreates the same
   object is **not** safe — check first.
2. **Does a test pin the outcome independently of the filename?**
   `supabase/tests/frozen_commercial_config_test.sql` asserts the notes text, so
   the rename is protected by CI rather than by hope.

**`make db-verify` does not work from a Claude Code remote session.** Attempted,
and blocked twice by the sandbox's egress policy: `supabase start` fails fetching
`cheerful-sailfish-3.clerk.accounts.dev/.well-known/openid-configuration` (the
`[auth.third_party.clerk]` block in `supabase/config.toml`), and with that
disabled locally it then fails pulling `supabase/postgres` image layers (403 from
the Docker registry CDN). Docker itself is fine — `sudo dockerd` starts and
`npx supabase@2.109.1` installs. So **migration-ordering changes are validated by
the CI `db-tests` job, not locally from these sessions**; `supabase start` there
applies `supabase/migrations/` in filename order and then runs every
`supabase/tests/*.sql`. Verify migration reordering by inspection locally, and
let CI be the gate.

**The trap left behind.** With `main` now lacking a file at `20260730120000`
while production still records one, `supabase db push` suggests:

> `supabase migration repair --status reverted 20260730120000`

**Never run that here.** The migration genuinely ran; marking it reverted
misrepresents the ledger and sets it up to re-run. The file arrives when #131
merges — that, not a repair, is what restores parity. Never
`db push --include-all`, never edit `schema_migrations` by hand.

**Lesson for future sessions:** applying a migration to production via a path
that assigns its own version (e.g. an MCP `apply_migration` call) puts the repo
and the ledger out of sync permanently. Prefer `supabase db push` from a
committed file so the version comes from the filename.

---

## F2 — A later migration silently reverted an earlier fix, in production

`20260730130000_enforce_elite_trial_first_100_cap.sql` recreates
`activate_merchant` **in full**, and its copy of the opening-credit cap count
has no node join. Because `130000 > 120000`, it overwrites the node-scoped body
from #131. Production records both as applied; the live body is the **global**
count, while `app_config.node0_opening_credit_merchant_cap`'s notes claim
per-node behaviour.

- Impact today: none (0 credits granted, one node).
- Impact at Node 1: the promo grants nothing, silently, while `/for-merchants`
  advertises it.
- Merging #131 does not fix it — its version is already recorded, so it will
  never re-run. The body must be re-landed as a **new** migration above
  `20260730130000`.

**Lesson:** when a migration does `CREATE OR REPLACE FUNCTION` on a function
another open PR also rewrites, the higher version wins regardless of merge
order. Full-body recreations of money-path functions need a "does an open PR
also touch this function?" check before merge.

---

## F3 — The Elite launch offer looked burned and is not

101 production merchants carry `elite_trial_granted_at` against a cap of 100.
All are `is_demo`, and the counter excludes demo rows:

```sql
select * from public.elite_trial_cap_status();   -- cap 100, granted 0, remaining 100
```

Do not read raw `count(*)` on `elite_trial_granted_at` and conclude the offer is
spent — always go through `elite_trial_cap_status()`. Slots are durable
(`elite_trial_granted_at` is never cleared), so a false alarm here invites
someone to "clean up" stamps that are load-bearing.

---

## Production state read on 2026-07-30 (snapshot, will drift)

- `main` at `c9b6de4`; 84 migration files; 84 versions applied; latest applied
  `20260730160000`.
- `demo_mode_enabled = true`; `success_fee_kes = 30.00`;
  `elite_trial_merchant_cap = 100` (granted 0);
  `node0_launch_node = BBS Mall`; `node0_opening_credit_kes = 300` (cap 100,
  granted 0); `node0_launch_period_ends_at = 2026-12-15`.
- 213 merchants / 380 deals / 348 users — **all merchants and deals are demo**;
  7 real users, 4 admins. No real merchant or deal exists yet.
- 3 active `pg_cron` jobs: `maanta_handle_trial_expiry` (02:00 daily, skips
  demo — so it **will** manage the real pilot merchant's trial),
  `maanta_demo_reseed` (hourly :07), `maanta_demo_seed_refresh` (02:30 daily).

## Sequencing conclusions worth keeping

- **Pilot day one is gated on a deploy, not a `db push`.** Every migration the
  pilot needs is already applied. Runbooks saying otherwise are stale.
- **Only 3 of 20 open PRs carry a DB step** — #131, #108, #94 — and all three
  have version-ordering problems (#108 and #94 sort before 15 already-applied
  versions). The other 17 sequence purely on review and deploy.
- **#141 is the only open PR that is 0 commits behind `main`.** Everything else
  is 11–84 behind; anything 60+ behind needs a rebase and a fresh review.
- **The standing foot-gun** is `elite_merchants_100.sql` on PR #112: it inserts
  100 BBS Mall merchants with `elite_trial_active` and no `is_demo`, which would
  burn all 100 durable Elite slots. It must never reach production.

## Stale docs found (fix when the owning PR lands)

| Doc | What is stale |
|---|---|
| `docs/ops/live-pilot-day-one-prep-2026-07-30.md` §2 (PR #141) | Lists `20260730120000`–`150000` as needing `db push`; all are applied. Also labels `120000` as the success-fee notes migration — in production it is the node-scoped credit migration. |
| `docs/ops/demo-mode.md` "Risks and caveats" | Says `20260729170000` and `20260729180000` are not yet applied; both are. |
