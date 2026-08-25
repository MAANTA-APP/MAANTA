# Final engineering session before merchant acquisition — 2026-08-25

**Mode:** maintenance/verification engineer under Node 0 Field Validation Mode.
**Scope:** clear the marketplace · land PR #264 with corrections · one
documentation task. No scope expansion; no UI work; no refactors.

This is the close-out required by the mandatory session rule. It separates
**code verified · provider verified · deployed · proven in the field**, because
those four are routinely collapsed and the difference is the whole point of the
Node 0 protocol.

---

## Outcome

| | |
|---|---|
| Marketplace cleared | **done and verified** — demo mode OFF on production, 0 synthetic rows reachable |
| PR #264 landed | **superseded by #272 — merged as `061c92c`**; #264 closed |
| Migration renumbered | `20260823140000` → **`20260824130000`** |
| `/admin` guard corrected | done, ratcheted, proven to fail on the old source |
| D184 classification | done — both non-demo merchant records classified as internal |
| Migration applied to production | **YES** — ledger reconciles **102/102** |
| Production mutated | **YES, twice** — one `app_config` row (demo mode), then the D164 migration. Both founder-authorized |

---

## The four states, kept apart

### Code verified

Everything below ran in this session and passed:

- `npm run lint`, `npm run typecheck` — clean.
- `npm test` — **1166 tests / 133 files**.
- `npm run build` + the three post-build gates — `check:tokens` (53 rendered
  files, 428 chunks), `check:canonicals` (16 marketing routes),
  `check:forms` (2 routes) — all clean.
- **Fresh migration chain: all 102 files applied in filename order, 0 failures.**
- **All 33 `supabase/tests/*.sql` suites pass**, including
  `redemptions_claimed_at_test.sql`.

**The caveat on the last two, stated plainly.** Docker's daemon cannot start in
this sandbox (`ulimit: Operation not permitted`) and the Supabase CLI is absent,
so `make db-verify` could not run. Instead a throwaway **Postgres 16** cluster
was built and the Supabase prerequisites were **hand-stubbed** — `anon` /
`authenticated` / `service_role` roles, `auth.uid()` / `auth.role()` /
`auth.jwt()`, `storage.buckets` / `objects` / `foldername`, a `cron.job` table,
and `supabase_migrations.schema_migrations` — then the CI job's exact loop was
replayed. Supabase runs **Postgres 17** and real GoTrue/pg_cron. **This rig is a
stand-in, not the `db-tests` job.** CI is the authority and it is running on
#272.

A worked example of why the caveat matters: the first run of the suites showed
**16 of 33 failing**, every one on `unauthorized: no authenticated caller
identity` or `service_role only`. None was a real defect — the stub `auth.role()`
read the legacy singular `request.jwt.claim.role` GUC while the suites set the
JSON `request.jwt.claims`. Correcting the stub to Supabase's real definition took
all 33 to green. A less careful reading of that first run would have reported 16
broken money-path suites.

### Provider verified

- **Supabase (production, read-only):** both browse view definitions via
  `pg_get_viewdef`; the `anon`/`authenticated` grant matrix (D147 still holds —
  `anon` has SELECT on the two views and on neither base table); all three
  `cron.job` rows and the `is_demo_mode()` guard inside both reseed function
  bodies; the demo/real census; live-vs-off browse counts; the expiry of both
  non-demo deals; the identity of both non-demo merchants; the ledger at
  **101/101**, tail `20260824120000`.
- **GitHub:** PR #264 confirmed open, head `a039d5e`, base `49c2e39`,
  `mergeable_state: dirty`.
- **what3words, Clerk, Vercel, PostHog, IntaSend, Stripe:** **not touched, not
  verified.** Nothing in this session depended on them.

### Deployed

- **Migration `20260824130000` is applied.** Ledger **102/102** by version and
  name, verified by a full diff against `supabase/migrations/`. The apply minted
  `20260825083646` — **ten for ten** — repaired to the repo filename before any
  other check. **401 redemptions, 0 non-NULL `claimed_at`**: no history was
  fabricated.
- **PR #272 is merged** as `061c92c`, on a board that was green including
  `db-tests` on real Supabase and the Cursor Security Agent with no findings.
  Both dashboards' KPI query now succeeds, returning an honest 0 that
  `claimsWindow()` labels as a partial window.
- **Demo mode OFF is live on production.** One `UPDATE` of one `app_config`
  row, under explicit founder authorization given in session. Before: 233 live
  deals / 212 live merchants. After: **0 live deals / 2 live merchants, 0
  synthetic deals visible, 0 synthetic merchants visible.** Census unchanged, so
  `make demo-on` restores the rehearsal set intact.
- Nothing else was deployed. Three production changes in total, each
  founder-authorized: the demo-mode flag, the migration, the merge.

### Proven in the field

**Nothing.** Zero genuine merchants, zero genuine shoppers, zero genuine
redemptions. The external field counter is **0** and this session did not and
could not move it. Every number produced here is a code or database fact.

This is the state the whole session was in service of, and it is worth saying
plainly at the end: the marketplace is now empty, the consoles now read real
data, and **none of that is evidence of demand**. The next real number has to
come from a merchant nobody at MAANTA recruited.

---

## What was NOT run, and why

| Not run | Why | Owed by |
|---|---|---|
| Any browser check of `www.maanta.app` | Sandbox proxy denies `maanta.app`, `clerk.maanta.app` and the Vercel host — `CONNECT tunnel failed, response 403`. Chromium uses the same proxy | founder |
| Signed-out confirmation that the cleared marketplace *renders* empty | same | founder |
| Any rendered check of `/admin` or `/founder` post-deploy | same — confirmed at the query level only | founder |
| `make db-verify` / the real `db-tests` locally | Docker daemon cannot start here; Supabase CLI absent. Replaced by the stand-in above | **DONE — CI green on #272**, 33/33 suites, scenarios A-J |
| `npm run test:e2e` | Needs `E2E_BASE_URL` + storage state. This is **D172, deferred**, explicitly non-blocking for Merchant 01. Deliberately not cited as a gate anywhere | — |
| Unsetting `MAANTA_DEMO_MODE` in Vercel | Environment change + redeploy, outside this session | founder |

**No check is reported here that did not run.**

---

## Three claims in the brief that were wrong, and the measurements

The brief warned it was assembled from a stale clone. It was right to.

1. **"~293 live synthetic deals against 1 non-demo."** The 293 was real at the
   time (233 by the time of the flip — synthetic flash deals expire and the
   hourly reseed tops them up, so the count drifts). The **1 is wrong**: both
   non-demo deals are expired, so with the flag off the marketplace serves
   **0 live deals**. This changes what Merchant 01 will see and had to be said
   before someone "fixed" an empty feed by switching demo mode back on.
2. **"The branch opens D168 for the E2E finding."** It does not. `grep D168`
   over every file the branch touches returns **nothing** — the renumbering to
   D172 already landed on `main` in #267. The instruction to delete the row was
   unexecutable because the row does not exist.
3. **"Is the hourly reseed disabled by the flag?"** implied one cron job. There
   are **three** — `reseed_demo_flash_deals` (hourly `:07`),
   `refresh_demo_seed_deals` (daily `02:30`, unmentioned anywhere in the brief),
   and `handle_trial_expiry`. Both demo jobs are guarded; the third skips demo
   unconditionally. Reading `cron.job` rather than the documentation is what
   surfaced the second one.

A fourth, smaller one: the close-out doc on the branch justified the first
rename with "sits immediately after the ledger's high-water mark". True when
written, false two days later. **This is D121 recurring** — a version chosen
against a directory listing is correct only until production moves.

---

## Files changed

**Code**
- `maanta-app/src/app/admin/page.tsx` — guarded set separated structurally.
- `maanta-app/supabase/migrations/20260824130000_redemptions_claimed_at.sql` — renamed.
- `maanta-app/supabase/tests/redemptions_claimed_at_test.sql`,
  `src/lib/claims-window.ts`, `src/app/founder/page.tsx`,
  `src/app/(shopper)/deals/[id]/page.tsx` — version references.
- Plus the seven merged commits from `claude/d162-d164`.

**Guards added**
- `maanta-app/src/lib/__tests__/claims-metric.test.ts` — the exclusion ratchet.
- `maanta-app/src/lib/__tests__/node0-evidence-counters.test.ts` — new.

**Docs**
- `CLAUDE.md` — merchant-record classification in the Node 0 evidence block.
- `docs/maanta-drift-register.md` — **D184** opened and closed; D162/D164
  conflict resolution; stamps.
- `docs/maanta-decisions-log.md` — 2026-08-25 entry; branch entry marked partly
  superseded.
- `docs/ops/demo-mode-clearing-2026-08-25.md` — new, the evidence and the
  executed record.
- `docs/skills/d162-d164-close-out-2026-08-23.md` — rename history corrected.
- This file.

---

## Tests added, and proof they fail against the old behaviour

**`claims-metric.test.ts`** — captures each dashboard's guarded set with a
balanced-bracket, string-aware scanner over comment-stripped source (via the
single shared D38 lexer), asserts a **non-empty, plausibly-shaped capture
first**, then asserts the claims-tracking read is absent from it, then asserts
the read still happens and still feeds `claimsWindow()` — so the exclusion
cannot be satisfied by deleting the feature.

Run against the pre-fix `/admin` source:

```
× /admin does not scan the claims-tracking config read for errors
  → /admin: the app_config claims-tracking read is inside the readFailed set —
    a missing or failed config row would blank the dashboard, which is the
    opposite of what its own comment promises:
    expected '[\n    atNode(\n      service.from("m…' not to contain
    'CLAIMS_TRACKING_CONFIG_KEY'
```

The captured text in that message is the point: the scanner resolved to a real
array before failing, so this is a failure **on the merits**, not a missing
anchor producing a vacuous result. That distinction is exactly what the two
earlier attempts at `redemptionFilters` got wrong, and the file says so.

**`node0-evidence-counters.test.ts`** — asserts CLAUDE.md still names
`bf66a041`, `67fe233d` and `72f95ac8`, still states the external counter at
zero, and still says a non-demo row is a record and not a customer. It asserts
**identifiers, never counts**: the counts change the moment Merchant 01
onboards, and a guard that must be edited then is a guard that gets deleted
then. Removing any id from CLAUDE.md fails it.

The drift register's own stamp guard also fired during this session — a `Last
updated: 2026-08-24` header above a 2026-08-25 row — and was fixed before commit.

---

## Founder actions required

Items 1-4 of the original list are **done**: #264 closed, CI confirmed green,
migration applied (ledger 102/102, tenth minted version repaired), #272 merged.
Two remain, both requiring a browser this session cannot open:

1. **Run the signed-out browser check** of the cleared marketplace
   (`docs/ops/demo-mode-clearing-2026-08-25.md` § Step 3) — the feed, browse,
   map and search show no deals and no demo banner.
2. **Look at `/admin` and `/founder` once the deploy lands.** `/founder` should
   render metrics instead of its read-failure state, and `/admin`'s Claims (7d)
   should read 0 **labelled as a partial window**, not a bare zero. Both were
   verified at the query level only.
3. **Unset `MAANTA_DEMO_MODE`** in Vercel and redeploy, so analytics tagging
   follows the flag.

## Unresolved risks

- **The empty marketplace is the biggest one, and it is a people risk, not a
  code risk.** Everything now reads zero because everything genuinely is zero.
  The failure mode is someone restoring demo mode to make the app "look alive"
  during a real merchant's onboarding, which destroys the evidence the pilot
  exists to collect.
- **`MAANTA_DEMO_MODE` can drift from the flag** until step 6. Visibility is
  correct; analytics tagging may not be.
- ~~The stand-in DB rig is not CI.~~ **Resolved:** CI's real Supabase agreed
  with it exactly — 33/33, scenarios A-J.
- **D162 stays open** until one real self-serve onboarding completes at Node 0.
- **D172 stays deferred.** It becomes a hard gate before routine or scaled
  releases, which this is not.

## Next recommended task

**None from engineering.** Claude Code returns to rest. The next event should be
Merchant 01's real onboarding, observed against
`docs/ops/d158-self-serve-live-test.md` — recording what actually happens rather
than coaching the merchant into matching the documentation. Wake Claude Code
only for a demonstrated field blocker.
