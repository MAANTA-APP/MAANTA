# MAANTA sequencing plan — pilot, PRs, migrations, launch gates

**Session type:** Planner (sequencing only — no features written, no production
writes performed).
**Date:** 2026-07-30.
**Audience:** founder / admin.
**Scope:** ordering and gating of PR merges, `supabase db push` steps, config
flips, and pilot actions — from friends-and-family day one to a 100-merchant
Node 0.

State was read directly, not assumed: `main` at `c9b6de4`, all 20 open PR heads
fetched and diffed, and production `axrrslqssmbngbataejg` queried for applied
migrations, `app_config`, live function bodies, row censuses and `cron.job`.

> **Repository state and production state are different things.** This plan
> never treats "merged" as "deployed" or "written" as "applied". Every DB and
> config row below was read from production on 2026-07-30.

---

## 0. Three findings that change the sequence

Read these before executing anything. Two are blockers on the migration path;
one is good news that removes a feared blocker.

### F1 — BLOCKER: repo and production disagree on migration version `20260730120000`

| Where | Version `20260730120000` is… |
|---|---|
| `main` (repo) | `20260730120000_correct_success_fee_config_notes.sql` |
| **Production** | `node_scoped_opening_credit_cap` |
| PR **#131** (open) | `20260730120000_node_scoped_opening_credit_cap.sql` |

Production also records `20260730160000 correct_success_fee_config_notes` — a
version that exists in **no** repo file. So the notes migration was applied to
production under a renumbered version, and #131's migration was applied under
the version `main` now uses for something else.

Two consequences, both of which bite a human running the documented commands:

1. **`supabase db push` from `main` today is not a no-op-with-a-clean-exit.**
   Local version `20260730120000` is already recorded remotely, so the notes
   migration is skipped; remote version `20260730160000` has no local file, so
   the CLI reports local/remote divergence and points you at
   `supabase migration repair`. Nothing actually *needs* applying — production
   already contains every migration `main` carries, by content — so the fix is
   a **repair/renumber**, never a force-push of migrations.
2. **Merging #131 as-is puts two files at version `20260730120000` in one
   folder.** That is a duplicate version the CLI rejects outright. #131 cannot
   merge until this is renumbered.

**Recommended remedy (founder should eyeball this before it is executed):**
renumber the repo's notes migration to `20260730160000_correct_success_fee_config_notes.sql`
— matching the version production actually recorded — and leave #131's file at
`20260730120000`. Repo and production then agree exactly, and no migration is
re-run. The notes migration is metadata-only (it changes one `notes` string and
one `COMMENT`, and its `ON CONFLICT` touches `notes` alone), so renumbering it
carries no money-path risk.

**Do not** "fix" this by deleting rows from `supabase_migrations.schema_migrations`
by hand, and do not run `db push --include-all`.

### F2 — BLOCKER: the node-scoped opening-credit fix is silently reverted, in production, right now

`20260730130000_enforce_elite_trial_first_100_cap.sql` (on `main`, applied to
production) recreates `activate_merchant` **in full**, and its copy of the
opening-credit cap count is the **global** one:

```sql
SELECT COUNT(*) INTO v_credited_count
  FROM public.merchant_transactions
 WHERE transaction_type = 'topup' AND payment_provider = 'manual'
   AND provider_reference LIKE 'node0_opening_credit:%';   -- no node join
```

Because `130000` sorts after `120000`, it overwrites the node-scoped body from
#131. Verified against the live function definition in production: the deployed
`activate_merchant` counts opening credits **globally**, even though
production records `20260730120000 node_scoped_opening_credit_cap` as applied
and `app_config.node0_opening_credit_merchant_cap`'s own notes claim
"PER NODE … see migration 20260730120000". **The database's documentation and
the database's behaviour disagree.**

- **Impact on pilot day: none.** Zero opening credits have been granted, and
  only one node has ever run the promo. The pilot merchant will be credited
  correctly either way.
- **Impact at Node 1:** the promo is dead on arrival — every activation at the
  new node silently grants nothing while `/for-merchants` advertises the credit.
- **Sequencing implication:** merging #131 does **not** fix production. Its
  migration sits at a version production already recorded, so it will never
  re-run, and even on a fresh database `130000` would clobber it again. The
  node-scoped body has to be re-landed as a **new** migration with a version
  **greater than `20260730130000`**. That belongs on #131 before it merges.

### F3 — Good news: the Elite launch offer is **not** burned

Raw counts look alarming — 101 production merchants carry
`elite_trial_granted_at`, against a frozen cap of 100. They are all `is_demo`,
and the counter excludes demo rows. Read from production:

```
SELECT * FROM public.elite_trial_cap_status();
→ cap = 100, granted = 0, remaining = 100
```

The pilot merchant genuinely gets **slot 1 of 100**. Re-run that query on the
day rather than trusting this document.

---

## 1. Inventory of the moving pieces

### 1.1 Production database — what is actually applied

84 migration versions applied, latest `20260730160000`. Everything `main`
carries is present **by content**; only the tail versioning diverges (F1).

| Repo file on `main` | Production record | Status |
|---|---|---|
| `20260730120000_correct_success_fee_config_notes.sql` | `20260730160000 correct_success_fee_config_notes` | Applied, **renumbered** |
| *(PR #131 only)* `20260730120000_node_scoped_opening_credit_cap.sql` | `20260730120000 node_scoped_opening_credit_cap` | Applied, then **clobbered** by `130000` (F2) |
| `20260730130000_enforce_elite_trial_first_100_cap.sql` | `20260730130000` | Applied |
| `20260730140000_trial_expiry_launch_sentinel_null_guard.sql` | `20260730140000` | Applied |
| `20260730150000_demo_wipe_audit_trail_retention.sql` | `20260730150000` | Applied |

> **Correction to an existing doc.** `docs/ops/live-pilot-day-one-prep-2026-07-30.md`
> (on PR #141) lists `20260730120000`–`150000` as "must be live for pilot day"
> and still needing `db push`, and labels `120000` as the success-fee notes
> migration. All four are **already applied**, and `120000` is the node-scoped
> credit migration in production. A human following that section as written
> will run into F1. Section 2 of the prep note should be corrected when #141
> merges; §3–§6 of it remain accurate and useful.
> `docs/ops/demo-mode.md`'s "Risks and caveats" is likewise stale: it says
> `20260729170000` and `20260729180000` are not yet applied — both are.

### 1.2 Frozen commercial config — read from production

| Key | Value | Pilot-day expectation |
|---|---|---|
| `demo_mode_enabled` | **`true`** | Stays `true`. Do not flip. |
| `success_fee_kes` | `30.00` | Unchanged (notes now correctly cite the Feb 2027 Elite review, no caveat on the fee) |
| `elite_trial_merchant_cap` | `100` | Unchanged; `granted = 0` |
| `node0_launch_node` | `BBS Mall` | Pilot merchant's `node` must match exactly |
| `node0_opening_credit_kes` | `300` | Pilot merchant should receive KES 300 |
| `node0_opening_credit_merchant_cap` | `100` | 0 granted so far |
| `node0_launch_period_ends_at` | `2026-12-15T00:00:00Z` | Inside the window |
| `boost_fee_kes` | `500` | Out of scope for day one |
| `guardian_thresholds` | v1 defaults | Leave alone during the pilot |

### 1.3 Production row census

| Table | Total | Demo | Real |
|---|---|---|---|
| merchants | 213 | 213 | **0** |
| deals | 380 | 380 | **0** |
| users | 348 | 341 | **7** (4 admins) |
| redemptions | 396 | — | 0 real |
| opening credits granted | 0 | — | 0 |

There is **no real merchant and no real deal in production yet**. The pilot
merchant is the first, which is exactly why the "do not seed non-demo Elite
merchants" flag below is load-bearing.

### 1.4 Scheduled jobs already live in production

| Job | Schedule (UTC) | Touches pilot data? |
|---|---|---|
| `maanta_handle_trial_expiry` | `0 2 * * *` | Yes, eventually — skips demo rows, so the **real** pilot merchant is in scope. Its 30-day trial and 7-day grace are managed by this job. |
| `maanta_demo_reseed` | `7 * * * *` | Demo-scoped only |
| `maanta_demo_seed_refresh` | `30 2 * * *` | Demo-scoped only |

Nothing needs disabling for the pilot. Worth knowing that the demo feed churns
hourly, so the pilot merchant's deal sits among synthetic ones that change.

### 1.5 Open PRs — 20, of which only 3 carry a DB step

Merged and on `main` (all deployed only if Vercel has built `c9b6de4` — verify,
see §5): #135, #136, #138, #139, #140.

**Migration-carrying PRs — these are the ones that need sequencing:**

| PR | Migration added | Problem | Verdict |
|---|---|---|---|
| **#131** | `20260730120000_node_scoped_opening_credit_cap.sql` | Version collides with `main` (F1); body gets clobbered by `130000` (F2) | Renumber + re-land above `130000` before merge |
| **#108** | `20260727010000_cofounder_role.sql` | Version sorts **before 15 already-applied** production versions — out-of-order push | Renumber to `> 20260730160000` before merge |
| **#94** | `20260726190000_avatars_storage_and_columns.sql` | Same out-of-order problem | Renumber to `> 20260730160000` before merge |

**App/docs-only PRs — no DB step, no `db push`, safe to sequence purely on
review and deploy:** #141, #137, #132, #130, #121, #120, #119, #117, #113,
#112 *(see danger below)*, #102, #99, #97, #96, #95, #89, #86.

| PR | Ahead | Behind `main` | Draft | Nature |
|---|---|---|---|---|
| #141 | 3 | **0** | Yes | Pilot readiness: Elite cap admin surface + pilot runbooks |
| #137 | 9 | 11 | No | Drift register + enforcement test |
| #132 | 2 | 32 | No | Design contract + two money-path copy fixes |
| #131 | 24 | 32 | No | Role hardening + launch-credit governance (**has migration**) |
| #130 | 1 | 32 | Yes | Role functionality review + staff permission UI |
| #121 | 2 | 64 | Yes | Prod hardening: bootstrap, env, runbooks |
| #120 | 1 | 64 | Yes | Company-readiness audit (docs) |
| #119 | 4 | 63 | No | Default auth strategy to Supabase on `/login` |
| #117 | 1 | 67 | Yes | Supabase email OTP + landing UX |
| #113 | 4 | 64 | No | Browse/Map separation, seeded deals post-login |
| #112 | 2 | 69 | Yes | Elite seed, test accounts, PWA polish — **danger, see below** |
| #108 | 10 | 71 | Yes | Global E.164 phone auth (**has migration**) |
| #102 | 2 | 75 | No | 10k-scale readiness (docs) |
| #99 | 2 | 77 | No | Node 0 seed validation record (docs) |
| #97 | 2 | 77 | Yes | Vercel Web Analytics integration |
| #96 | 3 | 77 | No | Notification prefs, Map/bell sizing, seed runbook |
| #95 | 2 | 62 | No | Discover/Browse/w3w gaps |
| #94 | 1 | 77 | No | Avatars, notification prefs (**has migration**) |
| #89 | 1 | 83 | Yes | Cursor dev env (docs) |
| #86 | 1 | 84 | Yes | Cursor dev env (AGENTS.md) |

Everything except #141 is behind `main` — several by 60–85 commits. Anything
60+ behind should be treated as needing a rebase and a fresh review, not a
merge on the strength of its original approval.

### 1.6 Config and environment surface

| Surface | Where it lives | Pilot day |
|---|---|---|
| Demo mode (behaviour) | `app_config.demo_mode_enabled` — DB, not env | **`true`**, unchanged |
| Demo mode (analytics tagging) | `MAANTA_DEMO_MODE` on Vercel | Should read `true` to match the DB |
| Auth strategy | `MAANTA_AUTH_STRATEGY` + `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` (must match; redeploy after change) | Whatever real phones are verified against — do not change on the day |
| Elite trial cap | `app_config.elite_trial_merchant_cap = 100` | Unchanged |
| Node opening balance | `app_config.node0_opening_credit_kes = 300`, cap `100` | Unchanged |
| Analytics | `POSTHOG_PROJECT_KEY`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `POSTHOG_HOST` | Should be set so the pilot is measurable |
| Error reporting | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Should be set before the pilot |
| Money rails | `STRIPE_ENV`, `INTASEND_ENV` | Leave unset/sandbox unless the founder explicitly accepts live money |

Vercel environment variables could not be read in this session — **§5 treats
every env value above as founder-verified, not asserted.** `NEXT_PUBLIC_*`
values are baked into the client bundle, so any change needs a redeploy.

---

## 2. Dependency chains

Five chains. Everything else in the backlog hangs off one of them.

### Chain A — Migration ledger repair *(blocks every future `db push`)*

```
Renumber notes migration → 20260730160000   [code, human review]
   → `supabase migration list` shows local == remote, nothing pending
   → THEN, and only then, #131 / #108 / #94 can be sequenced
```

- Depends on: nothing.
- Blocks: **all three** migration-carrying PRs, and any future `db push`.
- Safe in isolation: yes — it is a filename change matching what production
  already recorded; no migration re-runs.
- Human step: yes — renumber, then run `make db-list` and confirm parity.

### Chain B — Pilot day one *(the critical path, and it is short)*

```
#141 merge → Vercel production deploy → verify /admin/billing cap panel renders
   → SELECT * FROM elite_trial_cap_status()  (expect remaining ≥ 1)
   → pilot merchant self-onboards at BBS Mall
   → founder approves WITH Grant Elite trial  → slot 1 + KES 300 credit
   → merchant creates deal → shopper claims → in-person OTP redeem
   → KES 30 fee ledgered → admin audit surfaces confirm
```

- Depends on: **no migration.** Every migration the pilot needs is already
  applied. This is the single most useful thing this session establishes: the
  pilot is gated on a **deploy**, not on a `db push`.
- Depends on: #141 merged **and deployed** (it adds the cap-visibility UI and
  the approve-skip notice; without the deploy, the cap is only readable by SQL).
- Blocks: post-pilot consolidation, 100-merchant recruiting.
- Human steps: merge, deploy, verify, and the pilot session itself.

### Chain C — Node-scoped opening credit *(after pilot; needed before Node 1)*

```
#131: renumber its migration + re-land the node-scoped activate_merchant
      body as a NEW version > 20260730130000
   → merge #131 (rebase first — 32 behind)
   → db push → verify the live function body contains the node join
   → correct app_config notes if they still overstate behaviour
```

- Depends on: Chain A; ideally after the pilot, since it rewrites
  `activate_merchant` — the exact function the pilot exercises.
- Blocks: opening a second node. Not needed for Node 0's 100 merchants.
- Safe in isolation: yes, once re-landed above `130000` — otherwise it is a
  no-op that *looks* like a fix, which is worse than not shipping it.

### Chain D — Auth strategy convergence *(pick one before recruiting)*

```
#119 (default to Supabase on /login) ⟂ #117 (Supabase OTP + landing UX)
   ⟂ #108 (global E.164 phone auth, has migration)
   → these three overlap on the same surface; land ONE, then re-evaluate
   → env: MAANTA_AUTH_STRATEGY + NEXT_PUBLIC_MAANTA_AUTH_STRATEGY must match
   → redeploy (NEXT_PUBLIC_* is baked into the bundle)
```

- Depends on: knowing which strategy the pilot's real phones actually verified
  against — evidence from pilot day, not a guess beforehand.
- Blocks: recruiting beyond the pilot merchant (100 merchants cannot be
  onboarded through a login path that is still being switched).
- Do **not** touch during the pilot: an auth change mid-session ends the pilot.

### Chain E — Demo-to-real transition *(public launch only)*

```
Node 0 recruiting complete enough → founder decision
   → app_config.demo_mode_enabled = 'false'
   → MAANTA_DEMO_MODE = false on Vercel → redeploy
   → verify the deployed site (not view counts) shows no synthetic rows
   → ONLY THEN, optionally: make demo-wipe   (irreversible)
```

- Depends on: real merchants and deals existing in enough volume that the feed
  is not empty once 380 demo deals disappear. **Flipping the flag with 0 real
  deals empties the shopper feed.**
- Blocks: nothing — but everything visible depends on it.
- `make demo-wipe` already refuses to run while demo mode is on. Good guard;
  do not work around it.

---

## 3. Safe sequences

### 3.1 Pilot day-one readiness (friends & family)

**Must be merged before the pilot:** #141 only.

Everything else can wait. #141 carries the Elite cap admin surface, the
approve-skip notice, and the two pilot runbooks; it is the only open PR that is
0 commits behind `main` and adds no migration.

**Migrations that must be pushed:** **none.** All four
`20260730120000`–`150000` are already applied to production. If a runbook tells
you to `db push` for pilot day, that instruction is stale (F1).

**Config flips that must NOT happen yet:**

| Do not flip | Why |
|---|---|
| `app_config.demo_mode_enabled` → `false` | Still rehearsal; and with 0 real deals it empties the feed |
| `MAANTA_DEMO_MODE` → `false` | Must stay aligned with the DB |
| `MAANTA_AUTH_STRATEGY` / `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` | Changing the login path on pilot day ends the pilot |
| `STRIPE_ENV=live` / `INTASEND_ENV=live` | Live money is a separate, explicit founder decision |
| `elite_trial_merchant_cap` / `node0_opening_credit_*` | Frozen rules; a change needs a decisions-log entry first |

**Must NOT be applied to production, ever, in this window:**

| Action | Consequence |
|---|---|
| `elite_merchants_100.sql` (PR #112's seed) | Inserts 100 BBS Mall merchants with `elite_trial_active` and **no `is_demo`** → burns all 100 durable Elite slots before the pilot merchant gets one. Slots are never freed. |
| Any non-demo seed inserting `elite_trial_active = true` at BBS Mall | Same |
| Granting Elite to a demo merchant "to test the counter" | Wastes a durable slot |
| `wipe_demo_data(TRUE)` on production | Irreversible; unnecessary; not a pilot step |
| `db push --include-all` or hand-editing `schema_migrations` | Turns F1 into a real outage |

**Manual checks right before the session** (see §5 for the founder checklist).

### 3.2 Post-pilot consolidation

Merge only after the pilot has taught you something, in this order:

1. **#137** (drift register, 11 behind) — cheapest merge, and it is the doc that
   should record F1/F2 as open drift entries. Land it early so the findings have
   a durable home.
2. **Chain A** — the migration renumber. Land before any migration-carrying PR.
3. **#131** — rebase, renumber, re-land the node-scoped body above `130000`,
   then merge and push. Do this **after** the pilot, because it rewrites
   `activate_merchant`.
4. **#132** and **#130** (32 behind) — rebase and re-review; UI/role fixes that
   benefit from pilot feedback about what actually confused people.
5. **Chain D** — decide the auth strategy from pilot evidence, then land exactly
   one of #119 / #117 / #108.

**Hold back until public launch:** Chain E in its entirety, live money rails,
and #112's Elite seed (which should arguably be deleted from that branch rather
than carried forward).

**Keeping demo and real data separate during this phase:** the mechanism is
already correct and already deployed at the DB layer — `is_demo` on five tables,
excluded from `elite_trial_cap_status()`, skipped by `handle_trial_expiry`,
gated in the browse views. The discipline required of humans is narrow:

- Never insert a non-demo seed row into production.
- The pilot merchant, pilot shopper, their deals and their redemptions are
  **production truth**, not disposable — do not clean them up afterwards.
- After #140's Option C retention (already applied), audit rows are kept by
  **subject**, so real-merchant trails survive a future demo wipe. A non-zero
  "RETAINED" count from `wipe_demo_data` is expected, not a partial failure.

### 3.3 First 100-merchant node

**App and admin surfaces that must be live before recruiting beyond the pilot
merchant:**

| Surface | Why | Where it comes from |
|---|---|---|
| `/admin/billing` Elite cap panel | You cannot hand out 100 capped slots without seeing the counter | #141 |
| `/admin/merchants/[id]` cap line + approve-skip notice | Prevents promising a trial that silently did not happen | #141 |
| `/merchant/onboard` self-serve | 100 merchants cannot be onboarded by founder-typing | On `main` — verify deployed |
| `/merchant/redeem` OTP | The money path | On `main` — verify deployed |
| `/admin/redemptions` + `/admin/reports` | Dispute handling at volume | On `main` — verify deployed |
| One settled auth path | Chain D | #119 / #117 / #108 — pick one |
| Sentry + PostHog receiving events | 100 merchants without error reporting is unowned risk | Env only, no code |

**Additional migrations or config for scaling:** none required by the cap
itself — `elite_trial_merchant_cap = 100` and
`node0_opening_credit_merchant_cap = 100` already match the target, and both
counters are advisory-locked so concurrent activations cannot overrun them.
Chain C is required before a **second** node, not for the first 100.

**"Once only" windows — irreversible by design:**

| Action | Why it is once-only |
|---|---|
| Each Elite trial grant | `elite_trial_granted_at` is never cleared. 100 grants, then the offer is over. Clearing stamps is a **founder decision with a decisions-log entry**, not a script. |
| Each Node 0 opening credit | Idempotent per merchant via `provider_reference = 'node0_opening_credit:<id>'`; the cap of 100 is spent as it is used |
| `node0_launch_period_ends_at` (2026-12-15) | Credits stop at the boundary; extending it is a commercial decision |
| Raising either cap | Both are frozen business rules — decisions-log entry first, and `/pricing` advertises the number publicly |
| `demo_mode_enabled` → `false` then `demo-wipe` | The flip is reversible; the wipe is not |

---

## 4. Gates

### Chain A — migration ledger repair

- 🟢 **Green light when:** you have read F1, and a human is at a terminal that
  can run `make db-list` against production.
- 🔴 **Do NOT run if:** you are tempted to reach for `db push --include-all`, or
  to delete rows from `schema_migrations`. Both convert a naming problem into
  data loss.
- 👁 **Check with your own eyes:** `make db-list` output before and after — local
  and remote version lists must match exactly, with nothing pending.

### Chain B — pilot day one

- 🟢 **Green light when:** #141 is merged **and** a Vercel production deployment
  of that commit has succeeded; `/admin/billing` renders the cap panel;
  `elite_trial_cap_status()` returns `remaining ≥ 1`;
  `demo_mode_enabled = 'true'`; both pilot phones can complete login on the
  **deployed** site.
- 🔴 **Do NOT run if:** any Elite seed has been applied to production; the cap
  shows `remaining = 0`; the pilot merchant's `node` is not exactly `BBS Mall`;
  or `main` has moved past what is deployed.
- 👁 **Check with your own eyes:** the cap counter on the deployed site (not
  localhost, not a preview URL), and the pilot merchant's wallet showing
  KES 300 after approval.

### Chain C — node-scoped opening credit

- 🟢 **Green light when:** the pilot is finished and written up; Chain A is done;
  #131 is rebased, its migration renumbered **above `20260730130000`**, and the
  node join verified present in the function the migration installs.
- 🔴 **Do NOT run if:** the migration still sits at `20260730120000` — it will
  never re-run and you will believe a fix shipped when it did not (F2). Do not
  push it during the pilot window: it rewrites `activate_merchant`.
- 👁 **Check with your own eyes:** after pushing, read the live function body and
  confirm the count joins `merchants` on the launch node.

### Chain D — auth strategy

- 🟢 **Green light when:** pilot evidence shows which login path real phones
  actually completed, and exactly one of #119 / #117 / #108 is chosen.
- 🔴 **Do NOT run if:** the pilot has not happened; #108 still carries an
  out-of-order migration version; or `MAANTA_AUTH_STRATEGY` and
  `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` would end up disagreeing.
- 👁 **Check with your own eyes:** both env vars, in Vercel, after redeploy.

### Chain E — demo off

- 🟢 **Green light when:** the founder has decided to launch publicly, and there
  are enough **real** deals that the feed is not empty without the 380 demo ones.
- 🔴 **Do NOT run if:** real deal count is near zero; the pilot or any rehearsal
  is still scheduled; or you intend to wipe in the same sitting as the flip
  (flip, verify the deployed site, *then* consider wiping — separately).
- 👁 **Check with your own eyes:** the deployed public site after the flip and
  redeploy. View counts are not evidence; the rendered page is.

---

## 5. Founder plan

Legend: **Code** = PR merge · **DB** = migration/SQL against production ·
**Config** = env var or `app_config` · **Ops** = human/pilot action.

### Now — safe to do immediately

| # | Step | What changes | Type |
|---|---|---|---|
| 1 | Read F1/F2/F3 above | Nothing — but changes what you do next | — |
| 2 | Renumber the notes migration to `20260730160000` (Chain A) | Repo matches production's ledger | Code |
| 3 | `make db-list` — confirm local == remote, nothing pending | Nothing | DB (read-only) |
| 4 | Merge **#141** | Elite cap admin surface + pilot runbooks | Code |
| 5 | Confirm Vercel deployed the merge commit | Production serves the cap UI | Ops |
| 6 | Verify `SENTRY_DSN` + PostHog keys are set in Vercel Production | Pilot becomes observable | Config 👁 |
| 7 | Confirm `MAANTA_DEMO_MODE` on Vercel matches the DB (`true`) | Analytics tagged correctly | Config 👁 |
| 8 | Merge **#137** and record F1/F2 in the drift register | Findings get a durable home | Code |
| 9 | Correct §2 of `live-pilot-day-one-prep` and the caveats in `ops/demo-mode.md` | Runbooks stop describing stale DB state | Code |

### Pilot day only — right before or during

| # | Step | What changes | Type |
|---|---|---|---|
| 10 | `SELECT * FROM public.elite_trial_cap_status();` — expect `remaining ≥ 1` | Nothing | DB (read-only) 👁 |
| 11 | Confirm `demo_mode_enabled = 'true'` | Nothing | DB (read-only) 👁 |
| 12 | Confirm both pilot phones can log in on the **deployed** site | Nothing | Ops 👁 |
| 13 | Pilot merchant self-onboards at **BBS Mall** (real signup, not a seed) | First real merchant in production | Ops |
| 14 | Founder approves **with Grant Elite trial** | Slot 1 of 100 consumed (durable) + KES 300 credit | Ops |
| 15 | Merchant creates one live deal | First real deal | Ops |
| 16 | Shopper claims; merchant redeems by OTP at the counter | KES 30 fee ledgered | Ops |
| 17 | Verify `/admin/redemptions`, `/admin/reports`, wallet ledger | Nothing | Ops 👁 |
| 18 | Write up what broke — that list drives §3.2's order | Nothing | Ops |

**Not on pilot day, under any circumstances:** any `db push`; any Elite seed;
any demo-mode flip; any wipe; any auth-strategy change; any cap change.

### After pilot, before public launch

| # | Step | What changes | Type |
|---|---|---|---|
| 19 | Rebase **#131**, renumber its migration **above `20260730130000`**, re-land the node-scoped body | Fix actually takes effect | Code |
| 20 | Merge #131, then `db push` | `activate_merchant` counts credits per node | DB 👁 |
| 21 | Verify the live function body contains the node join | Confirms F2 is closed | DB (read-only) 👁 |
| 22 | Rebase + re-review **#132**, **#130** | UI/role fixes informed by the pilot | Code |
| 23 | Decide auth strategy; land one of **#119 / #117 / #108** (renumber #108's migration first) | One settled login path | Code + Config |
| 24 | Renumber **#94**'s migration above `20260730160000` before merging | Avatars land without an out-of-order push | Code + DB |
| 25 | Close or rebase the 60+-behind backlog (#121, #120, #113, #112, #102, #99, #97, #96, #95, #89, #86) | Backlog stops being noise | Code |
| 26 | Delete `elite_merchants_100.sql` from #112, or mark it local-only in-file | Removes a foot-gun that only needs one bad afternoon | Code |
| 27 | Recruit toward 100 Node 0 merchants, watching the cap counter | Real merchants accumulate | Ops |

### Public launch

| # | Step | What changes | Type |
|---|---|---|---|
| 28 | Confirm enough **real** deals exist that the feed survives without demo rows | Nothing | Ops 👁 |
| 29 | `UPDATE app_config SET value='false' WHERE key='demo_mode_enabled';` | Synthetic rows hidden | DB 👁 |
| 30 | Set `MAANTA_DEMO_MODE=false` on Vercel; redeploy | App-side tagging aligns | Config 👁 |
| 31 | Verify the **deployed public site** shows no synthetic data | Nothing | Ops 👁 |
| 32 | Only then, and separately: `make demo-wipe` | 213 merchants + 380 deals deleted, **irreversible** | DB 👁 |
| 33 | Money rails go live as an explicitly separate decision | Real charges | Config 👁 |

---

## 6. What this session deliberately did not do

- **Did not renumber any migration.** F1's remedy touches the migration ledger
  of a production database; it should be executed by a human who has read F1,
  not landed as a side effect of a planning session.
- **Did not write to production.** Every query run was read-only.
- **Did not merge, rebase, or close any PR.**
- **Did not modify PR #131.** Its migration needs both a renumber and a
  re-land above `130000` (F2) — that is a change to someone else's open branch
  and a money-path function, and it belongs to whoever owns #131.
- **Could not read Vercel env vars or confirm which commit production serves.**
  Every step depending on that is marked 👁 for founder verification.

---

## Related

- `docs/ops/live-pilot-day-one-prep-2026-07-30.md` (PR #141) — §2 needs the F1
  correction; §3–§6 are accurate
- `docs/ops/live-pilot-3-person-2026-07-30.md` (PR #141) — the session runbook
- `docs/ops/supabase-migrations.md` — how migrations are applied and verified
- `docs/ops/demo-mode.md` — demo architecture; "Risks and caveats" is stale
- `docs/maanta-decisions-log.md` — frozen rules and their dates
- `docs/skills/pilot-sequencing-2026-07-30.md` — durable handoff for this session
