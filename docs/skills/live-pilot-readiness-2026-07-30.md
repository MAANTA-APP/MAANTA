# Skill — Live pilot readiness (2026-07-30)

Handoff from the friends-and-family **3-person live pilot** prep session.

## What was reconstructed

Claude’s open work that day-one depends on:

| PR | Status at prep | Role |
|---|---|---|
| #135 (Elite cap / truth audit) | Merged | Cap enforcement + approve outcome logging |
| #139 (trial-expiry sentinel) | **Merged** 2026-07-30 — push pending | Sentinel NULL guard for `handle_trial_expiry` |
| #140 (Option C demo-wipe retention) | **Merged** 2026-07-30 — push pending | Subject-based audit retention |
| #141 (this session) | Open | Cap admin UI + pilot runbook / prep |

Intent (do not redefine):

1. Elite trial = first 100 BBS Mall slots, durable stamp, approve soft-skips /
   grant-trial hard-fails at cap, KES 300 opening credit on activate.
2. Option C wipe = subject-based audit retention; retain demo actors who touched
   real merchants; report `users RETAINED`.
3. Pilot = real merchant + real shopper + founder; demo mode stays on until launch.

## What this session shipped

- `docs/ops/live-pilot-3-person-2026-07-30.md` — Act-by-Act runbook
- `docs/ops/live-pilot-day-one-prep-2026-07-30.md` — PRs, `db push`, config flips
- Admin Elite cap status on `/admin/billing` and pending merchant detail
  (shared helpers in `src/lib/elite-trial.ts`, landed via #144; this PR keeps the
  pilot runbooks and no longer ships a duplicate React panel)
- Approve UI shows server `notice` when trial skipped / outcome unknown
- Local `supabase db reset` + SQL suites: elite cap A–H; after applying #139/#140
  files, sentinel + Option C retention suites green

## Operator next steps (human only)

1. Merge #141 (admin cap UI + runbooks). #139 and #140 are already on `main`.
2. `supabase db push` on `axrrslqssmbngbataejg` (versions `…120000`–`…150000`).
3. `SELECT * FROM elite_trial_cap_status();` before granting the pilot trial.
4. Keep `demo_mode_enabled = true` until public launch.
5. Do **not** apply PR #112’s `elite_merchants_100.sql` to production.

## Founder choices left open

Documented as TODOs in the runbook (Stripe live vs sandbox, IntaSend, boosts,
whether to reclassify backfilled rehearsal Elite stamps as demo).
