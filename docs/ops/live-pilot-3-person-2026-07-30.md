# Live pilot — 3-person day one (2026-07-30)

**Audience:** founder + one real pilot merchant + one real pilot shopper.
**Product:** production web app (`www.maanta.app`) + Supabase `axrrslqssmbngbataejg`.
**Goal:** prove onboard → Elite trial → deal → claim → redeem → audit, with
canonical (not disposable) data for the pilot merchant and shopper.

Companion prep checklist: `docs/ops/live-pilot-day-one-prep-2026-07-30.md`.

---

## What day one is meant to demonstrate

| # | Proof |
|---|---|
| 1 | A real merchant can self-serve onboard at BBS Mall and be approved by admin |
| 2 | Approving with **Grant Elite trial** consumes **slot 1 of 100** (durable) |
| 3 | Activation also writes the Node 0 **KES 300** opening credit (wallet usable) |
| 4 | Merchant can create a live deal within Elite limits |
| 5 | Shopper can claim on a real phone and redeem in person with OTP |
| 6 | Admin can see the merchant, redemption, wallet ledger, and ops audit |
| 7 | Demo mode stays **on** — flip only at public launch, not before |

Out of scope for day one (leave as founder TODOs if they come up): live Stripe
cutover, IntaSend STK, boost purchase via top-up, raising the Elite cap, wiping
demo data.

---

## Roles

| Role | Person | Account |
|---|---|---|
| Founder / admin | You | Existing admin (`admin@maanta.app` or equivalent) |
| Pilot merchant | Friend/family shop owner | **New** real signup — not a seed/demo merchant |
| Pilot shopper | Friend/family shopper | **New** real signup — not a demo shopper |

Do **not** use `elite.seed*@maanta.app`, `aragagency+*`, or any `is_demo = true`
row as the pilot merchant. Those are rehearsal fixtures.

---

## Surfaces used (must be reachable)

| Act | Surface | Path |
|---|---|---|
| Cap check | Plans & trials | `/admin/billing` (Elite trial launch offer counter) |
| Approve | Merchant detail | `/admin/merchants/[id]` (Approve + Grant Elite trial) |
| Merchant onboard | Wizard | `/merchant/onboard` |
| Merchant deals | Create deal | `/merchant/deals/new` |
| Merchant redeem | OTP entry | `/merchant/redeem` |
| Shopper | Feed / claim | `/feed` → deal → claim |
| Audit | Redemptions + reports | `/admin/redemptions`, `/admin/reports` |
| Ops log | Written by approve / plan actions | `admin_ops_log` (via admin UI actions) |

---

## Preflight (before anyone travels to the mall)

Do these from `docs/ops/live-pilot-day-one-prep-2026-07-30.md` — summary:

1. Merge required PRs (#139, #140, this pilot-readiness PR).
2. `supabase db push` on production; run `SELECT * FROM elite_trial_cap_status();`.
3. Confirm `demo_mode_enabled = true` (do **not** flip).
4. Confirm `/admin/billing` shows remaining Elite slots (expect room for slot 1
   unless backfill already counted rehearsal merchants — see prep note).
5. Confirm auth works on real phones (email/SMS OTP for the chosen strategy).

---

## Act 1 — Merchant onboard + Elite grant (slot 1 of 100)

1. Pilot merchant opens `/merchant/onboard` on their phone, completes signup for
   a **BBS Mall** shop (node must be the launch node).
2. Founder opens `/admin` → pending queue → Review the new shop.
3. On `/admin/merchants/[id]`, confirm the compact Elite cap line shows slots
   remaining.
4. Tick **Grant Elite trial (30 days)** → Confirm approval.
5. Expect:
   - Shop `status = active`, `tier = elite`, `elite_trial_active = true`
   - `trial_ends_at ≈ now() + 30 days`
   - `elite_trial_granted_at` stamped (durable slot)
   - Wallet balance includes Node 0 opening credit (**KES 300**) when still under
     the opening-credit cap and inside the launch window
   - If the offer was already exhausted: shop still goes live on **Standard** and
     the approve UI shows the cap-skip notice — stop and reconcile
     `elite_trial_cap_status()` before continuing the pilot narrative

**Backend path:** `POST /api/admin/merchants/[id]/approve` →
`activate_merchant(..., p_grant_elite_trial := true)` under
`pg_advisory_xact_lock('elite_trial_cap')` + `trg_enforce_elite_trial_cap`.

Prefer approve-with-trial over **Grant trial** on `/admin/billing` for day one:
approve is what writes the opening credit.

---

## Act 2 — Merchant creates a live deal

1. Merchant signs in → `/merchant/deals/new`.
2. Create one standard (or flash) deal with a real photo, price, and expiry.
3. Confirm it appears on `/feed` for node **BBS Mall** (cookie / node picker).

If create is blocked by zero-balance: check wallet — opening credit should have
covered the first fees; top-up is a founder TODO if rails are still sandbox-only.

---

## Act 3 — Shopper claim + in-person redeem

1. Pilot shopper signs up / signs in on their phone.
2. Opens `/feed` at BBS Mall, claims the pilot merchant’s deal.
3. At the counter, merchant opens `/merchant/redeem` and enters the OTP.
4. Expect: redemption `success`, KES 30 success fee ledgered (or arrears if
   wallet cannot cover — verify-anyway still succeeds for the shopper).

---

## Act 4 — Audit trails and reports

1. `/admin/redemptions` — find the pilot redemption; open detail.
2. `/admin/reports` — verified count / fee revenue move in the chosen range.
3. `/admin/merchants/[id]` — Elite trial dates + wallet look right.
4. `/admin/billing` — cap counter advanced by 1 for this real grant (unless the
   merchant already held a stamped slot).

Guardian / fraud / ops rows created during the pilot belong to **real** subjects.
They must survive any future demo wipe (Option C — PR #140). Do **not** run
`wipe_demo_data(TRUE)` against production during the pilot.

---

## Act 5 — Explicit non-actions

| Do **not** | Why |
|---|---|
| Flip `app_config.demo_mode_enabled` to `false` | Still rehearsal; flip only at public launch |
| Run `make demo-wipe` / `wipe_demo_data(TRUE)` on prod | Not needed; Option C retains real-subject trails but wipe is irreversible noise |
| Apply `elite_merchants_100.sql` (PR #112 seed) to prod | Would burn all 100 Elite slots with placeholders |
| Grant Elite to seed/demo merchants “to test the counter” | Wastes durable slots |

---

## Founder TODOs (do not decide in code)

Leave these as explicit decisions if they come up during the session:

- [ ] Accept Stripe sandbox top-ups for the pilot, or wait for live keys
- [ ] Whether IntaSend STK is in scope once credentials land
- [ ] Whether the pilot merchant should purchase a Boost during day one
- [ ] Whether any pre-existing backfilled `elite_trial_granted_at` rows on
      rehearsal merchants should be cleared / reclassified as `is_demo`
      (only with a decisions-log entry — slots are durable by design)

---

## Related

- Prep / merge / push: `docs/ops/live-pilot-day-one-prep-2026-07-30.md`
- Elite cap decision: `docs/maanta-decisions-log.md` (2026-07-30)
- Demo mode: `docs/ops/demo-mode-runbook.md`
- Option C retention: PR #140 / migration `20260730150000_demo_wipe_audit_trail_retention.sql`
- Trial expiry sentinel: PR #139 / migration `20260730140000_trial_expiry_launch_sentinel_null_guard.sql`
