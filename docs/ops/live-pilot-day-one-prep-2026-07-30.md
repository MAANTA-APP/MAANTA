# Live pilot day-one prep (2026-07-30)

**Audience:** human operator / founder before the 3-person pilot.
**Do not** run production-only writes from Cursor agents — this note is the
checklist a human executes.

Session runbook: `docs/ops/live-pilot-3-person-2026-07-30.md`.

> **Correction, 2026-08-05:** the "still needs `db push`" notes below are a
> dated record from 2026-07-30 and are **done** — the migration ledger was fully
> reconciled with the repo on 2026-08-05 (85/85 version/name pairs, drift
> **D24** closed), so every migration this checklist names is applied to
> production. The do-not-apply table (PR #112 and any non-demo Elite seed)
> still stands.

---

## Intent preserved from Claude’s work

| Track | Intent |
|---|---|
| **Elite trial path** | Admin approve with `p_grant_elite_trial` → under advisory lock, if a launch-node slot remains: `tier=elite`, `elite_trial_active`, `trial_ends_at = now()+30d`, trigger stamps `elite_trial_granted_at` (never cleared), Node 0 KES 300 opening credit when still under its own cap. Cap exhausted → activate on Standard, no error. Explicit **Grant trial** on Plans → **409** when exhausted. Cap = 100. |
| **Demo wipe Option C** | Audit-row survival by **subject** (real merchant/deal/redemption/ops target), not actor. Demo actors who touched real subjects are **retained**; fully synthetic activity is deleted; `users RETAINED` count stays visible. |
| **Live pilot day one** | Real merchant (slot 1 of 100) + real shopper + founder admin; redeem in person; accurate audit; demo mode stays on until public launch. |

---

## 1. PRs that must be merged before pilot day

| PR | Why | Status |
|---|---|---|
| **#139** trial-expiry launch sentinel | `handle_trial_expiry` must not freeze new expiries if `node0_launch_period_ends_at` is missing | **Merged** 2026-07-30 — still needs **`db push`** |
| **#140** Option C demo-wipe retention | Real-merchant audit trails survive demo wipe | **Merged** 2026-07-30 — still needs **`db push`** |
| **This branch** `#141` live-pilot-readiness | Admin Elite-cap surface, approve notice, pilot runbook + this prep note | Open — merge then deploy app |

Already on `main` earlier: Elite cap migration
`20260730130000_enforce_elite_trial_first_100_cap.sql` via #135 (also still
needs **`db push`** if not yet applied on production — check
`elite_trial_cap_status()`).

### Do **not** merge/apply for pilot day

| Item | Risk |
|---|---|
| PR **#112** `elite_merchants_100.sql` applied to **production** | Inserts 100 BBS Mall `elite_trial_active` merchants **without** `is_demo` — would consume the entire launch offer before the real pilot merchant |
| Any other non-demo seed that INSERTs `elite_trial_active = true` at BBS Mall on prod | Same — durable slots |

Rehearsal seeds on throwaway / local DBs are fine. Production pilot merchant must
be a real signup.

---

## 2. `supabase db push` steps (production `axrrslqssmbngbataejg`)

From `maanta-app/` after the PRs above are on `main`:

```bash
cd maanta-app
supabase link --project-ref axrrslqssmbngbataejg
supabase migration list          # confirm LOCAL has versions REMOTE lacks
supabase db push --dry-run       # preview
supabase db push                 # apply in order
```

### Migrations that must be live for pilot day

| Version | Source | What it does |
|---|---|---|
| `20260730120000` | #135 (main) | Correct success-fee config notes (metadata) |
| `20260730130000` | #135 (main) | Elite trial first-100 cap + `elite_trial_cap_status()` |
| `20260730140000` | #139 (merged) | Trial-expiry launch-sentinel NULL guard |
| `20260730150000` | #140 (merged) | Demo-wipe Option C audit retention |

### Immediately after push

```sql
-- Slot counter (founder must see this before granting the pilot Elite trial)
SELECT * FROM public.elite_trial_cap_status();
-- expect: cap=100, granted=<backfill>, remaining=100-granted

-- Who already holds durable slots (rehearsal residue?)
SELECT id, merchant_name, node, is_demo, elite_trial_active, elite_trial_granted_at
  FROM public.merchants
 WHERE elite_trial_granted_at IS NOT NULL
 ORDER BY elite_trial_granted_at;

-- Demo mode must still be ON
SELECT key, value FROM public.app_config
 WHERE key IN ('demo_mode_enabled', 'node0_launch_period_ends_at', 'elite_trial_merchant_cap');
```

If `granted` is already > 0 from rehearsal merchants that are **not** `is_demo`,
that is correct durable behaviour — but the pilot merchant may not be “slot 1”
numerically. Treat “first **real** pilot merchant” as the first intentional
live grant; record the `granted` number in the session notes. Clearing stamped
rehearsal rows is a **founder choice** (see runbook TODOs), not something to
script silently.

Local verification (this session): after `supabase db reset`,
`elite_trial_cap_test.sql` A–H passed; after applying #139/#140 SQL files,
`trial_expiry_launch_sentinel_test.sql` and `demo_wipe_audit_retention_test.sql`
A–D all passed.

---

## 3. Config flips — launch time only

| Config | Pilot day | Public launch |
|---|---|---|
| `app_config.demo_mode_enabled` | Keep **`true`** | Flip to **`false`** |
| Vercel `MAANTA_DEMO_MODE` | Keep aligned with DB (`true` while rehearsing) | Flip with the DB switch (see `docs/ops/demo-mode.md`) |
| Stripe / IntaSend live keys | Only if founder explicitly accepts money rails | Separate go-live |

**Do not** flip `demo_mode_enabled` before or during the 3-person pilot.

Launch flip (human, later):

```sql
UPDATE public.app_config
   SET value = 'false', updated_at = NOW()
 WHERE key = 'demo_mode_enabled';
-- Then set MAANTA_DEMO_MODE=false on Vercel Production and redeploy.
```

---

## 4. Admin surface for the Elite cap

After this PR deploys:

- `/admin/billing` — **Elite trial launch offer** line (`granted / cap`,
  remaining, exhausted behaviour) via `elite_trial_cap_status()`.
- `/admin/merchants/[id]` when status is pending — same cap line above Approve,
  plus a pre-approve warning when the offer is exhausted.
- Approve modal surfaces outcome notices (granted / skipped at cap / unknown)
  via `approveOutcomeMessage` so a silent refresh cannot look like a trial grant.

SQL fallback if the UI is down:

```sql
SELECT * FROM public.elite_trial_cap_status();
```

---

## 5. Pilot merchant = canonical data

- Pilot merchant counts as a real Elite-trial slot (durable `elite_trial_granted_at`).
- Pilot merchant and shopper are **not** `is_demo`; demo wipe must not delete them.
- Their deals and redemptions are production truth for the session, not disposable
  harness rows.

---

## 6. What this prep session changed or verified

| Item | Result |
|---|---|
| Elite cap migration on main | Present; local reset applies cleanly; SQL suite A–H green |
| `activate_merchant` + grant-trial asymmetry | Verified via `elite_trial_cap_test.sql` (C vs D) |
| Option C (#140) | Local apply + scenarios A/B/C/D green (A/C catch actor-keyed deletes) |
| Trial sentinel (#139) | Local apply + scenarios A–E green (C fails on pre-fix body) |
| Placeholder Elite seed on prod | Documented as **blocked** (#112) |
| Admin cap visibility | Added on billing + pending merchant detail |
| Approve skip notice | Wired in merchant admin actions |
| Demo mode flip | Explicitly deferred to launch |

---

## Related

- Runbook: `docs/ops/live-pilot-3-person-2026-07-30.md`
- Migrations ops: `docs/ops/supabase-migrations.md`
- Truth audit / D2: `docs/skills/truth-audit-2026-07-30.md`
- Decisions: `docs/maanta-decisions-log.md`
