# How far is MAANTA from launch? — 2026-08-01

**Question asked:** how far are we from launching, *excluding* (a) BBS Mall
partnership approval, (b) incorporation, and (c) the M-Pesa payment rail?

**Answer in one line:** engineering is not the blocker. What stands between the
repo and a live BBS Mall pilot is **one human `supabase db push`, one real-device
pilot day, and four founder decisions** — roughly 2–3 working days of elapsed
time, of which maybe half a day is code.

Every production claim below was **read back from production on 2026-08-01**
(Supabase `axrrslqssmbngbataejg`) rather than taken from a doc. The queries are
in §5 so the next session can re-run them instead of trusting this file.

---

## 1. What is genuinely done

Verified today, not inherited from the 2026-07-29 audit:

| Area | Evidence read today |
|---|---|
| Success fee frozen at KES 30 | `app_config.success_fee_kes = 30.00` |
| Elite trial cap enforced and unspent | `elite_trial_cap_status()` → cap 100, granted 0, remaining 100 |
| Trial-expiry cron actually running | `maanta_handle_trial_expiry` active `0 2 * * *`, **three consecutive nightly runs succeeded** (07-30, 07-31, 08-01) — this closes the last open half of **E11** |
| Money path, Guardian, fee reversal, security hardening | E12/E13/E15 done, 16 SQL suites in CI `db-tests` |

The core loop — onboard → approve → deal → claim → redeem → fee → audit — is
built, tested at the RPC level, and deployed. That is the expensive part and it
is behind us.

## 2. The one hard blocker: production ≠ repo (E17)

This is the only item on the list that can produce **wrong money or wrong access
behaviour** in front of a real merchant, and it is confirmed still broken today.

**D25 — the pause gate is not live.**

```
pg_get_functiondef('claim_deal') LIKE '%deal_paused%'  →  false
```

Production `claim_deal` still has no pause gate. A merchant who pauses a deal
sees "No new claims while paused" in the UI, and production will still accept a
claim via deep link, a cached client, or a direct API call. The shopper rails and
the SQL browse filter hide paused deals, but hiding is not enforcing — the RPC is
the enforcement point and it is not enforcing. Both fixing migrations are merged
on `main` and unapplied:

- `20260730180000_restore_claim_deal_pause_gate.sql`
- `20260730190000_paused_deals_discovery_filter.sql`

**D24 — the ledgers disagree, and prod carries SQL this repo does not have.**

| Version | Repo says it is | Production says it is |
|---|---|---|
| `20260730120000` | `correct_success_fee_config_notes` | **`node_scoped_opening_credit_cap`** — no file anywhere in this repo |
| `20260730160000` | *(no such file)* | `correct_success_fee_config_notes` |

Counts: repo 83 migrations, production ledger 82. Production is missing the two
pause-gate migrations and carries one migration whose source is not in version
control. That last part is the real problem — **nobody can currently say what
production's opening-credit rule is by reading this repo**, and the Node 0
KES 300 opening credit is exactly what the pilot merchant's first deals are
funded by.

**What closes it (human, per `docs/ops/supabase-migrations.md` — Claude must not
apply migrations):**

1. Recover the SQL for `node_scoped_opening_credit_cap` from production
   (`pg_get_functiondef` / `pg_dump` of the affected objects) and commit it as a
   real migration file, so the repo describes production.
2. `make db-push` the two pause-gate migrations.
3. Read back: `pg_get_functiondef('claim_deal')` must contain `deal_paused`, and
   the ledger names must match repo filenames.

Until step 3 returns true, E17 stays a gate and D24/D25 stay open.

## 3. The pilot has not happened yet

`docs/ops/live-pilot-3-person-2026-07-30.md` describes a 3-person
friends-and-family day at Node 0. Production says it has not run:

```
merchants where is_demo = false  →  0
```

All 213 merchants, 550 deals and 396 redemptions on production are demo/seed
rows. `elite_trial_cap_status()` showing **granted 0** independently confirms it —
no real merchant has ever been approved with a trial.

So **E2 / E3 / E4** (real-device shopper, merchant and admin smoke tests, all
three marked GATE) are not partially done. They are not started against real
data. This is the second of the two things actually standing between here and
launch, and it is a day of founder time, not engineering time.

Sequence matters: run the pilot **after** §2, or the pilot rehearses a pause
gate that is not enforcing.

## 4. What else is left, by how much work it is

### Founder decisions — no engineering (hours)

| Item | What is needed |
|---|---|
| **O2** (GATE) | Name one human who owns the merchant WhatsApp during onboarding week. Not started. |
| **Stripe** | Accept sandbox card top-ups for the pilot, or cut over live keys. Frozen rule allows either; the decision has never been written down. Distinct from the excluded M-Pesa rail. |
| **E10** (GATE) | Confirm the required-now env values on Vercel Production + `W3W_API_KEY`. Values are not machine-readable, so this is dashboard work per `founder-backend-prod-checklist-2026-07.md`. |
| Incident + agent roster | Who reverts a deploy, who freezes deals, who staffs BBS opening hours. |

### Launch-day switch flips (minutes, but easy to get wrong)

- **D14** — `app_config.demo_mode_enabled` is `true` today (verified). Until it
  flips, the live product shows synthetic shops to every visitor.
- **D18** — the two demo switches flip independently and `make demo-off` touches
  only `app_config`. Turning demo mode off while `MAANTA_DEMO_MODE` stays `true`
  tags **real** events as demo — the exact inversion of the point. Flip both.
- Three demo cron jobs (`maanta_demo_reseed` hourly, `maanta_demo_seed_refresh`
  nightly) are active and will keep manufacturing seed rows after launch unless
  they are disabled in the same pass.

### Engineering worth doing before real users (half a day)

- **D29** — `deals.expires_at` is nullable, `redemptions.expires_at` is
  `NOT NULL`, and `claim_deal` tolerates a NULL deal expiry. A claim on a
  no-expiry deal dies on a raw constraint violation instead of a clean domain
  error. A pilot merchant can create that deal.
- **D41** — `/contact`'s enquiry form does not exist in server HTML (client
  component behind a `Suspense` fallback). A merchant enquiry surface that does
  not render is a live acquisition hole.
- **D54** — every icon size override in the app is silently discarded (`cn()` is
  a plain join with no Tailwind conflict resolution). Cosmetic, but it is on
  every surface a merchant sees.

### Not on the critical path

- **M1–M7** are all "not started" and all marked *GATE (campaign)*, not GATE.
  A 3-person friends-and-family pilot needs none of them. They gate the public
  campaign, which is a separate go-live.
- **E7 / E8** (waitlist → Resend) are campaign gates on the same footing.
- **E9** (SLA-backed FX) is explicitly deferrable while launch is KES-only.
- **E14** (Playwright golden path) is repo-complete and needs a test env — a
  quality investment, not a launch gate.

## 5. Re-run the verification

```sql
-- Is the pause gate live? (must be true before launch)
SELECT pg_get_functiondef(p.oid) LIKE '%deal_paused%'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'claim_deal';

-- Do the ledgers agree? Compare against `ls maanta-app/supabase/migrations/`
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version >= '20260730' ORDER BY version;

-- Has a real merchant ever existed?
SELECT count(*) FROM merchants WHERE COALESCE(is_demo, false) = false;

-- Still in rehearsal?
SELECT key, value FROM app_config WHERE key = 'demo_mode_enabled';

-- Trial expiry actually firing
SELECT j.jobname, d.status, d.start_time
FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname = 'maanta_handle_trial_expiry' ORDER BY d.start_time DESC LIMIT 5;
```

## 6. Critical path, in order

1. Recover `node_scoped_opening_credit_cap` into the repo, push the two pause-gate
   migrations, read back — closes **D24**, **D25**, **E17**. *(human, ~1 hour)*
2. Name the O2 owner; decide Stripe sandbox-vs-live in the decisions log.
   *(founder, ~1 hour)*
3. Confirm Vercel env values — **E10**. *(founder, ~15 min)*
4. Fix **D29** before a real merchant can create a no-expiry deal. *(~1 hour)*
5. Run the 3-person pilot at Node 0 — closes **E2/E3/E4**. *(1 day)*
6. At public launch only: flip both demo switches together and retire the demo
   cron jobs — **D14**, **D18**.

Steps 1–5 are the answer to the question. Nothing in them is blocked on mall
approval, incorporation, or M-Pesa.

## 7. Where the excluded three actually bite

Noted only so the exclusion is not mistaken for "no consequence":

- **O5 / O6** (legal, DPA) are GATE and blocked on incorporation. A
  friends-and-family pilot can proceed on an explicit founder risk-accept
  recorded in `docs/maanta-decisions-log.md`; a public launch cannot.
- **E6** (IntaSend) means launch is card-only. Card-only in a Nairobi mall is a
  commercial constraint on top-up volume, not a technical blocker.

## Related

- `docs/maanta-launch-readiness-tracker.md` — gate status source of truth
- `docs/maanta-drift-register.md` — D14, D18, D24, D25, D29, D41, D54
- `docs/ops/live-pilot-3-person-2026-07-30.md` — the pilot script
- `docs/ops/supabase-migrations.md` — the human apply procedure
