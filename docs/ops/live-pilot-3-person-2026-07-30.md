# Live 3-person pilot — BBS Mall (Node 0)

Created 2026-07-30, revised same day (Elite baseline). **Audience:** the founder
running the session. This is a **live run on production** (`https://maanta.app`,
Supabase `axrrslqssmbngbataejg`, Clerk auth) with **real people on real phones**.

For the seeded single-operator walkthrough see
`docs/maanta-node0-rehearsal-checklist.md`; its `aragagency+*` accounts do **not**
apply here. Fill in `docs/ops/live-pilot-founder-summary.md` as you go — it is the
deliverable this session leaves behind.

> **Read once before the session, then run off §5 (the act checklists) alone.**
> Everything you need is repeated there so you never have to come back to code.

---

## 1. Founder decisions in force

| # | Decision | Consequence |
|---|---|---|
| D-a | **Grant Elite to the pilot merchant** | Consumes **slot 1 of 100**, treated as a real slot. Trial ends ~**2026-08-29**, then 7-day grace, then auto-downgrade |
| D-b | **Canonical admin = the agent-linked "Mohamed Elmi" user** | Clerk `user_3Gnt64ilh3nQMquyDqgWdcfgFL9`, `users.id 16cb15b5-…cd8f`, `role = admin` + active `agents` row `d8ae654c-…8a66` |
| D-c | The older **"Mo Elmi"** admin row is legacy | Still `role = admin` and still usable — **not** retired. Do not sign in with it. Retire after the pilot |
| D-d | Volunteers use **their own emails + real SMS-capable phones** | No seeded account can sign in (see §3) |
| D-e | **Demo mode stays on** | Feed shows the real deal among ~210 demo shops, with the disclosure banner |

## 2. What Elite actually buys — measured, not assumed

Worth calibrating before you promise your friend anything:

| Capability | Standard | Elite | Enforced by |
|---|---|---|---|
| Active deals | **1** | **2** | `enforce_deal_limit` trigger, `BEFORE INSERT ON deals` |
| Flash deals | ❌ raises *"Flash deals are only available on the Elite plan."* + a `tier_flags` row | ✅ | same trigger |
| `flash` feed rail | — | ✅ when `deal_type='flash'` and no active boost | `vw_*` feed view: `deal_type='flash' AND tier='elite'` |
| `priority` feed rail | — | ✅ **but only with a paid boost** | needs a `boost_flags` row **and** `tier='elite'` |

Two things this means for the pilot:

- **Elite is 2 active deals, not "multiple".** A third deal raises `Deal limit reached.`
- **The priority rail is out of reach in this session.** A boost costs **KES 500**
  (`app_config.boost_fee_kes`), `purchase_boost` **hard-fails** with
  `insufficient_balance` below that — it does *not* fall back to arrears the way
  the success fee does — and the merchant's wallet after the opening credit is
  **KES 300**. To demo the priority rail you must first top up (Stripe sandbox,
  `4242 4242 4242 4242`). Decide in advance whether that is part of the test.

## 3. The three actors

### Admin / founder / agent — you

- **Sign in as:** `admin@maanta.app`, choosing the Clerk identity whose profile
  name is **"Mohamed Elmi"** (D-b). If the app greets you as "Mo Elmi", sign out —
  you are on the legacy row and the audit trail will split.
- **Roles:** `role = admin` (gates `/founder`, `/admin/*`, and read access to
  `/agent/*`) **plus** an active `public.agents` row, which is what makes agent
  *writes* work.
- **Where your attribution lands:**
  - `activate_merchant` stamps `merchants.onboarded_by` with your **agent id**
    (`d8ae654c-…8a66`) on approval.
  - Every admin action writes an audit row via `logAdminOp` as
    `merchant.<action>` against your **user id**.
  - If the merchant picks you in the onboarding wizard's "were you helped by a
    Maanta agent?" step, that is captured as onboarding attribution.

### Shopper — your cousin (tech-savvy)

- **Sign-up:** `/sign-up`, own email, Clerk email code.
- **Then:** pick **BBS Mall** → lands on `/feed`, whose main section is titled
  **"Deals near me"**, with the flash rail above it.
- **What to have them try:** browse `/feed`, open a deal, **claim** it (they will be
  bounced through `/verify-phone` for an SMS code first), find the code again under
  `/tickets`, then try claiming the same deal twice.
- **They will never pay in the app.** There is no shopper payment or top-up surface
  in MAANTA, by design — the shopper pays the merchant in cash at the counter. If
  your cousin goes looking for a checkout, that is a finding about the copy, not a
  missing feature.

### Merchant — your friend

- **Sign-up:** `/sign-up`, own email, Clerk email code.
- **Onboard:** `/merchant/onboard` — shop name, floor, unit, **what3words address**,
  phone, WhatsApp, entrance notes, agent attribution. Use the shop's **real
  ///address**; a placeholder makes every geofence check meaningless.
- **Then:** receives Elite at approval, creates deals (incl. a flash deal), works
  the till at `/merchant/redeem`, watches `/merchant/wallet`.

---

## 4. The Elite grant path — exactly how it works

There are **two** paths that grant a trial. Both are gated by the same DB trigger.

### Path A — at approval (use this one)

`/admin/merchants/[id]`, while the shop is `pending`:

1. Tick the checkbox **"Grant Elite trial (30 days)"** — it sits next to the
   Approve/Reject buttons.
2. Click **Approve** → confirmation modal → confirm.

Under the hood: `activate_merchant(p_merchant_id, p_admin_user_id,
p_grant_elite_trial := true)`. In one transaction it flips `status → active`,
stamps `onboarded_by`/`onboarded_at`, takes an advisory lock, checks
`elite_trial_slot_available()`, and if a slot is free sets
`tier='elite'`, `elite_trial_active=true`, `trial_ends_at = NOW() + 30 days`. The
`trg_enforce_elite_trial_cap` trigger then stamps **`elite_trial_granted_at`** —
the durable slot marker, never cleared. The **KES 300 opening credit** is written in
the same transaction.

> ⚠️ **Ticking the box is not a guarantee.** If the offer were exhausted,
> `activate_merchant` deliberately activates the shop on **Standard and says
> nothing** — a promo running out must not block a merchant going live. And
> `elite_trial_cap_status()` is **not read anywhere in the app** (verified by grep),
> so the admin UI cannot warn you either — despite a code comment in the migration
> claiming it does. Today there are 100 free slots so this will work; **verify after
> approving** rather than assuming (§5, Act 2).

### Path B — after the fact (fallback)

`/admin/billing` → **Grant trial** → `POST /api/admin/plans/[id]`
`{action:'grant-trial'}`. This writes the trial columns directly; the trigger
enforces the cap and the route surfaces exhaustion as a **409** with plain copy.
Use this only if you forget to tick the box in Path A.

`downgrade` on that same screen does **not** free the slot — by design.

### Verification query (run right after approval)

```sql
select * from public.elite_trial_cap_status();
-- expect: cap 100 | granted 1 | remaining 99

select merchant_name, status, tier, elite_trial_active,
       elite_trial_granted_at, trial_ends_at, account_balance
  from public.merchants where is_demo = false;
-- expect: active | elite | true | <today> | ~2026-08-29 | 300.00
```

---

## 5. The six acts — run off this

Roughly 45–60 minutes. Each act depends on the last.

### Act 1 · Merchant signs up and onboards — *merchant*

Screens: `/sign-up` → `/merchant/onboard`

- [ ] Signs up with own email, Clerk email code arrives first try
- [ ] Completes the wizard with the shop's **real ///what3words address**
- [ ] Picks **"Mohamed Elmi"** in the agent-attribution step
- [ ] Shop lands as **`pending`**; merchant sees a waiting-for-approval state

**Money:** nothing moves. No wallet exists yet.
**Audit:** `merchants` row created with `status='pending'`, agent attribution stored.

### Act 2 · Founder approves **with Elite** — *you*

Screens: `/founder` → **Merchant approvals** → `/admin/merchants/[id]`

- [ ] Find the shop — it is the **only** non-demo one (the 3 pending demo shops are named "(Demo …)")
- [ ] **Tick "Grant Elite trial (30 days)"** ← the decision, do not skip
- [ ] **Approve** → confirm in the modal
- [ ] Status flips to **active**, tier shows **Elite**, wallet shows **KES 300**
- [ ] Run the §4 verification query → **granted 1, remaining 99**

**Money:** +KES 300 exactly once — a `topup` / `manual` ledger row with
`provider_reference = node0_opening_credit:<merchant_id>` (UNIQUE, so it can never
double-credit). Nothing else moves.
**Audit:** `logAdminOp` row `merchant.approve`; `onboarded_by = d8ae654c-…8a66`;
`elite_trial_granted_at` stamped.

### Act 3 · Merchant creates deals — *merchant*

Screens: `/merchant/dashboard` → deal creation

- [ ] Create a **standard** deal → saves
- [ ] Create a **flash** deal → saves (this is the Elite capability made visible)
- [ ] Attempt a **third** active deal → expect `Deal limit reached. elite plan allows 2 active deal(s).`
- [ ] Wallet still **KES 300** — deal creation is free

**Money:** nothing moves. The zero-balance gate is what the KES 300 unblocked.
**Audit:** a `tier_flags` row appears on the rejected third deal (`deal_limit_exceeded`).

> Optional, only if you decided to spend it: top up via Stripe sandbox, then buy a
> **KES 500** boost to light up the `priority` rail. Skip and the rail stays untested.

### Act 4 · Shopper claims — *shopper*

Screens: `/sign-up` → mall picker → `/feed` → deal detail → `/verify-phone` → `/tickets`

- [ ] Signs up with own email; lands on `/feed` after picking BBS Mall
- [ ] **"Deals near me"** shows the real deal; the **flash rail** sits above it
- [ ] Opens the deal → **Claim** → is bounced to `/verify-phone` for an SMS code → back to the claim
- [ ] Gets a **6-digit code**; the same code is under `/tickets`
- [ ] Second claim on the same deal is refused — *"already have an active claim"*

**Money:** nothing moves. **The shopper is never charged in-app.**
**Audit:** a `redemptions` row in claimed state, tied to shopper + deal.

### Act 5 · Redemption at the counter — *both, in person*

Screens: `/merchant/redeem`

- [ ] Merchant types the shopper's 6-digit code → **resolve** screen appears
- [ ] Resolve screen shows: KES 30 fee disclosure · **"Collect from shopper KES N"**
      (the YOU PAY price, display-only, cash) · a **masked** shopper phone
      (`+254 7xx xxx 678`) · persistent **"Wallet KES 300"** header
- [ ] **Nothing has been charged yet** — confirm this is legible to the merchant
- [ ] Tap **Confirm redemption**
- [ ] Success: KES 30 fee, copyable **reference ID**, **"Redeemed at HH:MM"**
- [ ] Wallet **300 → 270**
- [ ] `/merchant/wallet` shows a `success_fee` row carrying that same reference

**Money:** −KES 30 from the wallet, once, at merchant confirmation. The shopper's
cash payment happens outside MAANTA and is never recorded as a platform charge.
**Audit:** `redemptions.status='success'`, `redeemed_at` server-stamped, ledger row
reference-matched to the success screen.

### Act 6 · Founder reads the money — *you*

Screens: `/founder` → `/admin/redemptions` → `/admin/reports`

- [ ] `/founder`: **Verified (7d)** = 1 · **Fee revenue (7d)** = **KES 30** ·
      **Merchant accounts** +1 · **Live deals now** includes the real deals
- [ ] `/admin/redemptions`: the redemption listed as success, with whatever Guardian
      signals fired (real GPS + a real ///address is what makes the geofence check
      meaningful — only an on-site run produces this)
- [ ] `/admin/reports`: the 14-day chart picks up the redemption

**Money:** read-only. Fee revenue must equal exactly KES 30 — more means a
double-charge, less means the fee did not land.

### Optional Act 7 · Arrears — the frozen G1 rule

The rule most likely to be misread at a real counter.

- [ ] Drop the wallet below KES 30, then redeem a second claim
- [ ] The keypad **never blocks** — verification still succeeds
- [ ] KES 30 is recorded as **arrears** (`success_fee_arrears` row +
      `outstanding_arrears` on the merchant), settled at the next top-up

---

## 6. What to capture

Per act: what the person expected, what they did, where they hesitated, and the
exact on-screen wording if something read wrong. The two highest-value observations:

1. Did the **shopper** understand they pay the merchant in cash and MAANTA never
   charges them?
2. Did the **merchant** understand the KES 30 fee *before* tapping Confirm?

Also record: the real ///address used · the Act 5 reference ID · whether every
email/SMS code landed first try (Clerk + Resend deliverability is still an open
tracker item) · the `elite_trial_cap_status()` output after Act 2.

## 7. After the run

- The volunteer rows are **real data** (`is_demo = false`). Keep them as your first
  genuine Node 0 records or delete them deliberately — the demo tooling only touches
  `is_demo = true` rows, so a demo wipe will **not** clean them up.
- **Slot 1 of 100 is spent for good.** `elite_trial_granted_at` is never cleared, so
  ending or converting the trial does not give the slot back.
- Diary the trial dates: trial ends ~**2026-08-29**, then a 7-day grace, then
  auto-downgrade to Standard. See §8 for the edge case that lands with it.
- Fill in `docs/ops/live-pilot-founder-summary.md` and open decisions-log entries for
  anything that contradicts a frozen rule.

## 8. Known issues found while preparing this

1. **Cap status is invisible in the app.** `elite_trial_cap_status()` is not read by
   any admin surface, so nobody can see remaining slots without SQL — and if the cap
   were full, Path A would silently activate on Standard with no warning. The
   `activate_merchant` comment asserting "the admin UI reads elite_trial_cap_status()
   before ticking the box" describes behaviour that does not exist.
2. **Downgrade does not reconcile existing deals.** `enforce_deal_limit` is
   `BEFORE INSERT` only. When this pilot merchant auto-downgrades to Standard after
   the trial, their **2 active deals and any live flash deal keep running** until
   they expire, even though Standard allows 1 and no flash. Watch for this around
   2026-09-05.
3. **Opening-credit counter ignores `is_demo`.** It counts
   `provider_reference LIKE 'node0_opening_credit:%'` with no demo exclusion, unlike
   the Elite trial cap which explicitly excludes demo rows. Currently harmless (0
   used before this pilot), but demo merchants activated through the RPC would eat
   real launch slots.
4. **Migration history drift at `20260730120000`.** Prod records that version as
   `node_scoped_opening_credit_cap`; the repo file at that version is
   `correct_success_fee_config_notes.sql`. Pre-existing, unreconciled.
