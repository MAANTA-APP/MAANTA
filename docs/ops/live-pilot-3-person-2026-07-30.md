# Live 3-person pilot — BBS Mall (Node 0)

Created 2026-07-30. **Audience:** founder running the session, plus the engineer
doing pre-flight. This is a **live run on production** (`https://maanta.app`,
Supabase `axrrslqssmbngbataejg`, Clerk auth) with **real people on real phones** —
not the seeded rehearsal. For the seeded single-operator walkthrough see
`docs/maanta-node0-rehearsal-checklist.md`; that document's `aragagency+*`
accounts do **not** apply here.

## Cast

| Role | Who | Account | Needs |
|---|---|---|---|
| Founder / admin / agent | You | `admin@maanta.app` (Clerk) | `/founder`, `/admin/*`, `/agent/*` |
| Merchant | Volunteer 1 | Their **own** email + phone | Signs up, self-onboards a shop |
| Shopper | Volunteer 2 | Their **own** email + phone | Signs up, verifies phone, claims |

**The volunteers must use their own real email and real phone.** Production runs
Clerk, and every seeded `@maanta.app` test account (`merchant.a.owner@`,
`shopper.everyday@`, `agent@`, `founder@`, the 150 `seed.nairobi*`) has **no
`clerk_user_id`** — none of them can sign in on maanta.app. Only
`admin@maanta.app` is Clerk-linked. Phone verification is **required to claim**
(`/verify-phone`, S2 ruling), so the shopper needs a phone that can receive SMS.

Use three separate devices (or one normal + two incognito windows) so the
sessions don't evict each other.

## Verified production state (2026-07-30)

| Fact | Value | Why it matters |
|---|---|---|
| Merchants | **213, all `is_demo = true`** (210 active, 3 pending) | Your volunteer's shop will be the **first real merchant** in prod |
| Real deals | **0** | Your volunteer's deal will be the first real deal |
| `demo_mode_enabled` | **true** | Feed shows demo **+** real deals; the volunteer's deal appears among ~210 demo shops |
| Node 0 opening credit | **0 / 100 used** | The volunteer merchant **will** get the KES 300 credit at approval — demo merchants were seeded directly, not via the activation RPC, so no slots were burned |
| Success fee | KES 30 | Debited at merchant verification |
| Elite trial slots | **0 / 100 used** | Cap enforced in prod as of 2026-07-30 (pre-flight 3); a trial granted in the run costs slot 1 |
| `/founder` gate | `role === 'admin'` | `admin@maanta.app` passes |

## Pre-flight

Items 1–3 were **settled on 2026-07-30** by founder ruling; item 4 is a per-session
choice. What was actually done is recorded inline under each.

### 1. One admin Clerk identity — DECIDED

`admin@maanta.app` has **two** Clerk-linked rows in `public.users`, both
`role = 'admin'`:

| `users.id` | Clerk user | Name | Created |
|---|---|---|---|
| `16cb15b5-…cd8f` | `user_3Gnt64ilh3nQMquyDqgWdcfgFL9` | Mohamed Elmi | 2026-07-22 |
| `d8c1aa1e-…1409` | `user_3H1aBdhhqgLzMgXUsVYDqGYWlg7` | Mo Elmi | 2026-07-26 |

Either one gets you into `/founder` and `/admin/*`, so this does not block the
run — but every approval, dispute ruling and fee reversal is stamped with
whichever row you happened to sign in as.

**Ruling 2026-07-30: `user_3Gnt64ilh3nQMquyDqgWdcfgFL9` ("Mohamed Elmi",
`users.id 16cb15b5-…cd8f`) is the founder account.** Sign in as that one for the
whole session. The `user_3H1aBdhhq…` / "Mo Elmi" row is still present and still
`role = admin` — it is **not** yet retired, so signing in with the wrong Clerk
identity will still work and will still split the audit trail. Retiring it is
open follow-up work (`docs/skills/full-state-audit-2026-07-29.md` §6).

### 2. Agent writes — DONE

`/agent/*` **pages** allow `role ∈ {agent, admin}`, so you can browse them. But
every agent **write** (`/agent/leads/new`, visit logging) goes through
`requireActiveAgentApi()`, which requires an **active row in `public.agents`
linked to your `users.id`**. The only agent row in prod belongs to
`agent@maanta.app` — a non-Clerk account you cannot sign in as.

Result as things stand: you can open `/agent` and read, and **lead capture
returns 404 "No active agent profile."** The merchant onboarding wizard's "Were
you helped by a Maanta agent?" picker will also offer only **"Agent Demo"**, not
you.

**Fixed 2026-07-30:** an active `public.agents` row
(`d8ae654c-cbb3-4e7f-aba8-0a12f7e18a66`, `weekly_target` 15, default) now exists for
`users.id 16cb15b5-…cd8f`. Agent writes work, and the onboarding wizard's picker
offers **"Mohamed Elmi"** alongside "Agent Demo" — have the volunteer pick you.

Side effect worth knowing: `activate_merchant` sets `onboarded_by` to
`(SELECT id FROM agents WHERE user_id = p_admin_user_id)`, so from now on
approvals you perform are attributed to this agent row. That is the intended
behaviour — it is how field attribution is meant to work — but it starts now, not
at launch.

### 3. Pending migration — APPLIED

`20260730130000_enforce_elite_trial_first_100_cap.sql` (merged in #135) had not
reached prod: prod sat at `20260730120000`, `elite_trial_cap_status()` did not
exist, and the first-100 cap `/pricing` advertises was unenforced.

**Applied to prod 2026-07-30** (via MCP, in sections — no Supabase CLI in the
session container — then `supabase_migrations.schema_migrations` was stamped with
version `20260730130000` so prod and the repo agree). Verified afterwards:

- `elite_trial_cap_status()` → **cap 100, granted 0, remaining 100**
- the backfill stamped **101** merchants with `elite_trial_granted_at`, **all of
  them demo**, so they are correctly excluded from the count
- `trg_enforce_elite_trial_cap` present on `public.merchants`

So the volunteer merchant, if granted an Elite trial, will consume **slot 1 of 100**
and be counted.

Unrelated drift noticed while stamping: prod records version `20260730120000` under
the name `node_scoped_opening_credit_cap`, while the repo file at that version is
`correct_success_fee_config_notes.sql`. Same version, different name — pre-existing,
not introduced here, worth reconciling separately.

### 4. Demo-data posture — LEAVING DEMO MODE ON (ruling 2026-07-30)

Demo mode is **on**, so the shopper's feed will show the volunteer's real deal
mixed into ~210 demo shops with a disclosure banner. Two options:

- **Leave it on** — the feed looks alive, which is the honest test of what a real
  shopper sees at launch-minus-demo-data. Real rows stay distinguishable by
  `is_demo = false`.
- **Turn it off** for the run (`demo_mode_enabled = false` in `app_config`) — the
  feed shows only the volunteer's real deal. Clean signal, empty-looking feed.

**Decision: leave it on** for the shopper's first impression. Read the money
assertions from the DB, where demo rows are filtered out anyway. Nothing to change
before the run — `demo_mode_enabled` is already `true`.

One consequence to expect at the counter: the daily demo reseed cron
(`20260730010000_demo_seed_deal_refresh`) will keep refreshing demo deals during
and after the session. It only touches `is_demo = true` rows, so the volunteer's
deal and claim are untouched — but the feed will not look identical from one hour
to the next, which is worth knowing before you read anything into a changed rail.

## The run

Roughly 45–60 minutes with three people. Do the acts in order — each depends on
the last.

### Act 1 — Merchant signs up and onboards (volunteer 1)

1. `/sign-up` with their own email → Clerk OTP.
2. `/merchant/onboard` — the wizard asks for shop name, floor, unit,
   **what3words address**, phone, WhatsApp, entrance notes, and "were you helped
   by a Maanta agent?".
   - Use the shop's **real ///what3words address**, standing in the shop if you
     can. A placeholder makes every later geofence check meaningless.
   - Pick **you** in the agent picker (requires pre-flight 2).
3. Expected: submission succeeds, shop lands as **`pending`**, merchant sees a
   "waiting for approval" state.

### Act 2 — Founder approves (you)

4. `/founder` → **Merchant approvals** (or `/admin/merchants`) → find the shop.
   It is the only non-demo one; the 3 pending demo shops are named "(Demo …)".
5. Approve. Expected, in one transaction:
   - status → `active`
   - wallet → **KES 300** (Node 0 opening credit, first-100 offer, ledger row
     tagged `node0_opening_credit`)
6. Optionally grant the Elite trial (30 days). The cap is now enforced in prod, so
   this consumes **slot 1 of 100** and stamps `elite_trial_granted_at` — a slot
   that is never freed, including if the trial is later ended or converted.
   Elite also unlocks flash deals and more than one active deal, which makes Act 3
   richer; decide whether that is worth one launch slot.

### Act 3 — Merchant creates a deal (volunteer 1)

7. `/merchant/dashboard` → create a deal. Standard plan = 1 active deal, no
   flash; Elite = more, plus flash.
8. Expected: the deal saves and the wallet balance is untouched (KES 300 — nothing
   is charged at deal creation). The zero-balance gate is enforced in the DB, so
   this step is exactly what the KES 300 credit exists to unblock.

### Act 4 — Shopper claims (volunteer 2)

9. `/sign-up` with their own email → pick **BBS Mall** → `/feed`.
10. Open the volunteer merchant's deal → **Claim**. Expected: an email-only
    session is bounced to **`/verify-phone`** first (phone SMS OTP), then back to
    the claim.
11. Expected after claiming: a **6-digit code** ticket, also under `/tickets`. A
    second claim on the same deal is blocked with "already have an active claim".

### Act 5 — Redemption at the counter (both volunteers, in person)

12. Merchant: `/merchant/redeem` → type the shopper's 6-digit code.
13. Expected on the **resolve** screen — nothing charged yet:
    - the fee disclosure (KES 30)
    - **"Collect from shopper KES N"** — the shopper's YOU PAY price, display-only.
      The shopper pays the merchant **in cash, directly**; MAANTA never charges
      the shopper in-app.
    - a **masked** shopper phone (`+254 7xx xxx 678`) as a sanity check
    - the persistent "Wallet KES 300" header
14. Tap **Confirm redemption**. Expected:
    - success screen, KES 30 fee, copyable reference ID, **"Redeemed at HH:MM"**
    - wallet **300 → 270**
    - a `success_fee` ledger row under `/merchant/wallet` carrying that same
      reference

### Act 6 — Founder reads the money (you)

15. `/founder`: **Verified (7d)** = 1, **Fee revenue (7d)** = KES 30, **Live deals
    now** includes the real deal, **Merchant accounts** +1.
16. `/admin/redemptions`: the redemption is listed as success with the Guardian
    signals it fired (a real GPS + real ///address pair is what makes the geofence
    check meaningful — this is the part only an on-site run can produce).
17. `/admin/reports`: the 14-day chart picks up the redemption.

### Optional Act 7 — Arrears (the frozen G1 rule)

Worth doing if the volunteers have time, because it is the rule most likely to be
misunderstood at a real counter. Have the merchant redeem a **second** claim after
their wallet drops below KES 30 (or set their balance low first). Expected: the
keypad **never** blocks — verification still succeeds, and the KES 30 is recorded
as **arrears** (`success_fee_arrears` row + `outstanding_arrears` on the merchant),
settled at the next top-up. Top-up is Stripe **sandbox**: card
`4242 4242 4242 4242`, any future expiry/CVC.

## Capture while you run

Per act, note: what the person expected, what they did, where they hesitated, and
the exact screen text if something read wrong. The two highest-value observations
are (a) whether the shopper understood that they pay the merchant in cash and
MAANTA never charges them, and (b) whether the merchant understood the KES 30 fee
before tapping Confirm.

Also record: real ///what3words address used, the reference ID from Act 5, and
whether every SMS/email OTP landed on the first try (Clerk + Resend
deliverability is still an open tracker item).

## After the run

- The volunteer rows are **real data** (`is_demo = false`) in production. Either
  keep them as your first genuine Node 0 records, or delete them deliberately —
  do not let a demo wipe be the thing that removes them, because the demo tooling
  only touches `is_demo = true` rows.
- The KES 300 credit and any Elite trial slot the volunteer consumed are **durably
  spent** — `elite_trial_granted_at` is never cleared and the opening credit is
  idempotent per merchant. Budget for it: this run costs 1 of 100 launch slots.
- File the observations, and open decisions-log entries for anything that
  contradicts a frozen rule.

## Known latent issue found during pre-flight

`node0_opening_credit_on_activation` counts consumed slots as
`COUNT(*) FROM merchant_transactions WHERE provider_reference LIKE
'node0_opening_credit:%'` — with **no `is_demo` exclusion**, unlike the Elite trial
cap, which explicitly excludes demo rows. Today the count is 0, so nothing is
wrong in practice. But if demo merchants are ever activated through the RPC rather
than seeded directly, synthetic shops will silently eat real launch-offer slots.
Fix alongside the next opening-credit change.
