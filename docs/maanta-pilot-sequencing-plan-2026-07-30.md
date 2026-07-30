# MAANTA — E2E start board

**Date:** 2026-07-30. **Audience:** founder / admin.
**One question this board answers:** what still blocks the first real end-to-end
walkthrough — merchant onboards → Elite trial → deal → claim → in-person OTP
redeem → audit — and in what order do I clear it?

Not a roadmap. Anything that does not block starting E2E is listed at the bottom
under **Not required for E2E** and should be ignored until the run is done.

**The headline:** E2E is gated on a **deploy**, not a `db push`. Migrations
`20260730120000`–`160000` are already applied to production (verified against
`supabase_migrations.schema_migrations`, not inferred from the repo). Any runbook
telling you to `db push` before pilot day is stale.

Forensic detail behind the F1/F2/F3 findings referenced below lives in
`docs/skills/pilot-sequencing-2026-07-30.md`.

---

## Can do now

| Owner | Type | Blocking? | Action | Proof / outcome |
|---|---|---:|---|---|
| Claude | Code | No | ~~F1: renumber `20260730120000_correct_success_fee_config_notes.sql` → `20260730160000_…`~~ **done** | `git log` shows the rename; repo version now matches the version production recorded |
| Claude | Code | No | ~~F2: re-land the per-node opening-credit count as `20260730170000_node_scoped_opening_credit_cap_reland.sql`, above `130000`~~ **done, unmerged** | File exists on `claude/maanta-pilot-sequencing-uz6ac1`; `node0_opening_credit_test.sql` scenarios E + F added |
| Founder | Ops | **Yes** | Merge **#141** — the only open PR that matters for E2E. Adds the Elite cap panel, the pending-merchant cap line, and the approve skip notice | PR shows merged; CI green |
| Founder | Ops | **Yes** | Confirm Vercel built and promoted the merge commit to Production | Vercel deployment for that exact SHA is `Ready` and aliased to `www.maanta.app` |
| Founder | Config | No | Confirm `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` are set on Vercel Production | Sentry shows an event from production |
| Founder | Config | No | Confirm `POSTHOG_PROJECT_KEY` + `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` are set | PostHog live events view shows a pageview |
| Claude | Code | No | ~~Correct the stale caveats in `docs/ops/demo-mode.md`~~ **done** — it claimed `20260729170000`/`180000` were unapplied and the app code unmerged; both are wrong | Doc now describes applied state, and keeps the `main` ≠ production distinction |
| Founder | Code | No | Correct §2 of `docs/ops/live-pilot-day-one-prep-2026-07-30.md` — it lists these migrations as still needing `db push`. **Lives on #141, not `main`**, so it must be fixed on that branch or as a follow-up once #141 merges | Runbook no longer instructs a `db push` that would hit F1 |
| Founder | Ops | No | Merge **#137** (drift register) so F1/F2 have a durable home | Register lists both findings |

**Do not do in this phase:** any `db push`, any `migration repair`, any config
flip, any seed against production.

---

## Must do before E2E starts

Every row here is a check, not a build. If one fails, stop and fix that before
travelling to the mall.

| Owner | Type | Blocking? | Action | Proof / outcome |
|---|---|---:|---|---|
| Founder | Ops | **Yes** | **Which commit is production actually serving?** Compare the Vercel Production deployment SHA against `origin/main` tip | The two match. If production is behind, nothing else on this board is trustworthy |
| Founder | Ops | **Yes** | **Is #141 merged AND deployed?** Merged is not deployed — check both | `/admin/billing` renders the "Elite trial launch offer" panel on `www.maanta.app`, not just locally |
| Founder | Config | **Yes** | **Vercel Production env vars correct.** Specifically: `NEXT_PUBLIC_SUPABASE_URL` → the `axrrslqssmbngbataejg` project, `SUPABASE_SERVICE_ROLE_KEY` set, `NEXT_PUBLIC_APP_URL` → `https://www.maanta.app`, and `MAANTA_AUTH_STRATEGY` **equal to** `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` | Values read back correctly in the Vercel dashboard. `NEXT_PUBLIC_*` is baked into the bundle — if you change one, redeploy before proceeding |
| Founder | Config | **Yes** | `MAANTA_DEMO_MODE` on Vercel matches the DB (`true`) | Both read `true`; analytics tags demo activity correctly |
| Founder | QA | **Yes** | **Email OTP works on the live app**, on the actual phones the pilot will use — not a desktop browser, not a preview URL | Both pilot phones reach a signed-in session on `www.maanta.app` |
| Founder | QA | **Yes** | **Admin approval surface shows cap status and skip notices.** Open a pending merchant on `/admin/merchants/[id]` | Compact Elite cap line renders above Approve; the approve modal is wired to surface the API `notice` when a trial is requested but skipped |
| Founder | DB | **Yes** | **Elite cap intact for the real pilot path:** `SELECT * FROM public.elite_trial_cap_status();` | Returns `cap 100, granted 0, remaining 100`. (F3: the 101 merchants carrying `elite_trial_granted_at` are all `is_demo` and correctly excluded — do not "clean them up") |
| Founder | DB | **Yes** | `SELECT key, value FROM app_config WHERE key IN ('demo_mode_enabled','node0_launch_node','node0_opening_credit_kes','node0_launch_period_ends_at');` | `true` / `BBS Mall` / `300` / `2026-12-15…`. Demo mode stays `true` |
| Founder | Ops | **Yes** | Confirm the pilot merchant will register at node **`BBS Mall`** exactly, and is a **real signup** — not a seed, not `is_demo`, not `elite.seed*@maanta.app` | Node string matches `node0_launch_node` character for character, or no credit is written |
| Founder | Ops | No | Confirm `/merchant/onboard`, `/merchant/deals/new`, `/merchant/redeem`, `/feed`, `/admin/redemptions` all load on production | Each screen renders for the right role |

### Explicitly NOT required before E2E

- No `supabase db push`. Everything the run needs is applied.
- The F2 re-land (`20260730170000`) does **not** need to be merged or pushed
  first. Zero opening credits have been granted and only one node exists, so the
  global-vs-per-node count is indistinguishable today. The pilot merchant gets
  KES 300 either way.
- No auth-strategy change. Whatever the pilot phones verified against is the
  strategy for the run.

---

## Do during the E2E session

| Owner | Type | Blocking? | Action | Proof / outcome |
|---|---|---:|---|---|
| Founder | Ops | **Yes** | Pilot merchant self-onboards at BBS Mall on their own phone via `/merchant/onboard` | Shop appears in the admin pending queue |
| Founder | Ops | **Yes** | On `/admin/merchants/[id]`, read the cap line, then Approve with **Grant Elite trial (30 days)** ticked | `status=active`, `tier=elite`, `elite_trial_active=true`, `trial_ends_at ≈ now()+30d`, `elite_trial_granted_at` stamped |
| Founder | QA | **Yes** | Confirm the wallet carries the Node 0 opening credit | Balance includes **KES 300**; a `merchant_transactions` row with `provider_reference = 'node0_opening_credit:<id>'` exists |
| Founder | QA | No | If the approve UI shows the cap-skip notice instead, **stop** and reconcile before continuing the narrative | `elite_trial_cap_status()` explains why; do not proceed on a false "slot 1" |
| Founder | Ops | **Yes** | Merchant creates one live deal at `/merchant/deals/new` with a real photo, price and expiry | Deal renders on `/feed` for node BBS Mall |
| Founder | Ops | **Yes** | Pilot shopper signs up on their own phone, claims the deal from `/feed` | Claim + OTP code visible on the shopper's ticket |
| Founder | Ops | **Yes** | At the counter, merchant enters the OTP on `/merchant/redeem` | Redemption `success`; **KES 30** success fee ledgered (or recorded as arrears if the wallet cannot cover — verify-anyway must still succeed for the shopper) |
| Founder | QA | **Yes** | Audit: `/admin/redemptions` detail, `/admin/reports` counts, `/admin/merchants/[id]` trial dates + wallet, `/admin/billing` cap advanced by 1 | Every surface agrees with what happened at the counter |
| Founder | Ops | No | Write down what broke, in order of how much it hurt | That list, not this board, drives the next session |

### Do NOT do during the session

| Never | Why |
|---|---|
| Flip `demo_mode_enabled` to `false` | Still rehearsal; and with ~0 real deals it empties the shopper feed |
| Run `make demo-wipe` / `wipe_demo_data(TRUE)` | Irreversible, and not a pilot step |
| Apply `elite_merchants_100.sql` (PR #112's seed) to production | Inserts 100 BBS Mall merchants with `elite_trial_active` and **no `is_demo`** → burns all 100 durable Elite slots. Slots are never freed |
| Grant Elite to a demo merchant "to test the counter" | It proves nothing. `elite_trial_slot_available_for()` returns `TRUE` unconditionally for `is_demo` rows and `elite_trial_cap_status()` excludes them, so the counter will not move — you would be reading a rehearsal grant as evidence about the real offer. Use the real pilot merchant, once |
| `supabase migration repair --status reverted 20260730120000` | The CLI will suggest this. It is a lie about production history — that migration really ran. The missing local file arrives with #131 |
| `db push --include-all`, or hand-editing `schema_migrations` | Turns a naming problem into data loss |
| Any auth-strategy or env change mid-session | Ends the run |

---

## Do after E2E, before public launch

| Owner | Type | Blocking? | Action | Proof / outcome |
|---|---|---:|---|---|
| Founder | Ops | No | Merge this branch, then merge **#131** (rebase first — 32 behind) | `20260730170000` reaches `main`. Note #131 needs **no renumber** — the F1 rename freed `20260730120000` |
| Founder | DB | No | `make db-list`, then `make db-push-dry`, then `make db-push` | Only `20260730170000` pending. After push, `make db-list` shows local == remote |
| Founder | DB | No | Verify the F2 fix actually took: read the live `activate_merchant` body | The credit count `JOIN`s `merchants` and filters `m.node = v_launch_node`. If it does not, `130000` clobbered it again |
| Cursor/Claude | Code | No | Renumber **#108**'s `20260727010000_cofounder_role.sql` and **#94**'s `20260726190000_avatars_storage_and_columns.sql` above `20260730170000` | Both sort after every applied version; `db push --dry-run` shows them as the only pending items |
| Founder | Ops | No | Decide the auth strategy from what the pilot phones actually did, then land exactly one of **#119 / #117 / #108** | One settled login path before recruiting merchant #2 |
| Founder | Code | No | Delete `elite_merchants_100.sql` from #112, or mark it local-only in-file | The foot-gun stops being one bad afternoon away |
| Founder | Ops | No | Rebase or close the 60+-behind backlog (#132, #130, #121, #120, #113, #112, #102, #99, #97, #96, #95, #89, #86) | Backlog stops being noise |
| Founder | Ops | No | Recruit toward 100 Node 0 merchants, watching `/admin/billing` | Cap counter advances one real grant at a time |
| Founder | DB | No | **Public launch only:** `UPDATE app_config SET value='false' WHERE key='demo_mode_enabled';` then set `MAANTA_DEMO_MODE=false` on Vercel and redeploy | The **deployed** public site shows no synthetic data. Verify the rendered page, not view counts |
| Founder | DB | No | **Public launch only, and separately:** `make demo-wipe` | 213 demo merchants + 380 demo deals deleted, **irreversible**. Only after the flip is verified. Real-subject audit trails survive (Option C, `20260730150000`) — a non-zero "RETAINED" count is expected, not a partial failure |

---

## Not required for E2E

- **The F2 fix above `130000`** — written and tested, but only matters when a
  second node opens. Zero credits granted; one node exists. Merge it after the run.
- **Broader 100-merchant polish** — recruiting surfaces, agent tooling, scale
  work. E2E needs one merchant, not a hundred.
- **Plugin / superpower / UI-UX enhancement work** — none of it blocks the walkthrough.
- **Public-launch-only config flips** — `demo_mode_enabled`, `MAANTA_DEMO_MODE`,
  live Stripe / IntaSend keys.
- **The migration-ledger tail** — #108's and #94's out-of-order versions, and
  full `migration list` parity (which needs #131). Neither touches the pilot path.
- **`make db-verify` locally** — cannot run from a Claude Code remote session
  (blocked on Clerk's OIDC domain, then on Docker registry pulls). CI's
  `db-tests` job is the gate.

---

## Related

- `docs/skills/pilot-sequencing-2026-07-30.md` — how production state was verified, and the F1/F2/F3 forensics
- `docs/ops/live-pilot-3-person-2026-07-30.md` (PR #141) — the fuller session script
- `docs/ops/live-pilot-day-one-prep-2026-07-30.md` (PR #141) — §2 stale (F1); §3–§6 accurate
- `docs/ops/supabase-migrations.md` — how migrations are applied and verified
- `docs/maanta-decisions-log.md` — frozen rules and their dates
