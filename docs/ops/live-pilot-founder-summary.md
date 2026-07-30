# Live pilot — founder summary

Companion to `docs/ops/live-pilot-3-person-2026-07-30.md`.

**Status: PRE-RUN.** Sections 1–3 are settled and can be read as final. Sections
4–6 are deliberately blank — they are the observation record, and they get filled
during and after the session with what actually happened. Nothing in them is
pre-written, because a summary of a pilot that has not run yet would be fiction.

- Pilot date: `______`
- Present: founder (admin/agent) · shopper (cousin) · merchant (friend)

---

## 1. What is now decided

| Decision | Value | Where it lives |
|---|---|---|
| Elite for the pilot merchant | **Granted** — real slot, 1 of 100 | Runbook §1 D-a, §4 |
| Canonical admin identity | Agent-linked **"Mohamed Elmi"** (`users.id 16cb15b5-…cd8f`, agent `d8ae654c-…8a66`) | Runbook §1 D-b |
| Legacy admin row | **"Mo Elmi"** — do not use, retire after pilot | Runbook §1 D-c |
| Volunteer credentials | Own emails, real SMS-capable phones | Runbook §1 D-d, §3 |
| Demo mode during pilot | **On** | Runbook §1 D-e |

Applied to production 2026-07-30 in preparation: the founder's `agents` row was
created, and migration `20260730130000` (Elite trial first-100 cap) was applied and
verified at **cap 100 / granted 0 / remaining 100**.

> "Retention option C" appears in the founder instruction as already decided, but no
> such option is defined anywhere in `docs/` — no retention A/B/C set exists in the
> decisions log, roadmap, or ops docs. It is therefore **not** recorded here as
> decided. Say what option C is and it goes in §1; otherwise it belongs in §6.

## 2. Calibration going in — what Elite actually buys

Measured from the schema, not from the pricing copy:

- **2** active deals (not unlimited). A third raises `Deal limit reached.`
- **Flash deals** unlocked; on Standard they raise *"Flash deals are only available
  on the Elite plan."*
- The **`flash` feed rail** is reachable. The **`priority` rail is not** — it needs a
  **KES 500** boost, `purchase_boost` hard-fails below balance, and the wallet holds
  **KES 300** after the opening credit. Priority placement is untestable in this
  pilot without a Stripe-sandbox top-up.

## 3. Money model the pilot must prove

| Event | Expected movement |
|---|---|
| Onboarding | nothing |
| Approval with Elite | **+KES 300** once (`node0_opening_credit:<id>`, UNIQUE) |
| Deal creation (×2) | nothing |
| Shopper claim | nothing — **the shopper is never charged in-app** |
| Merchant confirms redemption | **−KES 30** once, at confirmation |
| Founder dashboard | Fee revenue (7d) = **exactly KES 30** |

Anything else that moves is a finding.

---

## 4. What happened — per act

*Fill during the session. One or two lines each; the checkboxes in the runbook are the detail.*

| Act | Outcome | Notes / exact wording if something read wrong |
|---|---|---|
| 1 · Merchant signup + onboard | | |
| 2 · Approve with Elite | | `elite_trial_cap_status()` after: `______` |
| 3 · Deals (standard + flash + limit) | | |
| 4 · Shopper claim | | code: `______` |
| 5 · Counter redemption | | reference ID: `______` |
| 6 · Founder reads the money | | fee revenue (7d): `______` |
| 7 · Arrears (optional) | | ran? y/n |

Deliverability: every email/SMS code first try? `______`
Real ///what3words address used: `______`

## 5. What worked well

*Fill after. Cover: signup + code delivery, feed and "Deals near me", Elite
capabilities, the redemption two-step, audit trails.*

-

## 6. What felt fragile or confusing

*Fill after. Prompts, not conclusions — leave any that did not actually come up:*

- Demo deal density — did ~210 demo shops help or bury the real deal?
- Did the shopper look for a way to pay in the app?
- Was the KES 30 fee legible to the merchant **before** Confirm?
- Admin UX: could you tell Elite had actually been granted without running SQL?
- Anything about the two admin identities that bit you.

-

## 7. Will do — committed follow-ups

1. **Retire the legacy "Mo Elmi" admin row** once the pilot confirms no hidden
   dependencies. Check before deleting: `admin_audit` rows authored by it, and any
   `merchants.onboarded_by` pointing at an agent row linked to it.
2. **Reconcile the `20260730120000` migration-history drift** — prod records
   `node_scoped_opening_credit_cap`, the repo file is
   `correct_success_fee_config_notes.sql`. Decide which name is authoritative and
   make the two agree so the next `db push` is clean.
3. **Update Notion + ops docs** with what the pilot actually showed, and open
   decisions-log entries for anything that contradicts a frozen rule.
4. **Surface `elite_trial_cap_status()` in the admin UI** so remaining slots are
   visible where trials are granted, and fix the false comment in
   `activate_merchant` that claims the UI already does this.
5. **Diary the trial lifecycle:** trial ends ~**2026-08-29** → 7-day grace →
   auto-downgrade. Watch for the deal-limit gap in item 2 of §8 below.

## 8. Plan — decisions to make, with the facts needed

1. **Elite slots to spend on pilots before launch.** 99 remain and a slot is never
   recoverable. Proposal to react to: cap pilot spend at **3 slots total**, and use
   *paid* Elite (`mark-paid`) rather than a trial for any further internal testing,
   since that consumes no launch slot.
2. **When `demo_mode_enabled` flips off.** Suggested rule: flip off once real
   merchants at Node 0 can fill the feed on their own — concretely, **≥10 active
   non-demo merchants with ≥1 live deal each** — and always off for any session where
   a real shopper's first impression is being measured. Until then the flip is a
   per-session choice, not a standing state.
3. **Next three founder decisions**, from what this pilot surfaces:
   - **Pricing offer:** does the KES 3,500/month Elite price survive the merchant's
     reaction to what 2 deals + flash actually delivers? (Price is under review
     Feb 2027; the KES 30 fee is explicitly not.)
   - **Retention on downgrade:** what should happen to a Standard merchant still
     holding 2 active deals and a live flash after trial expiry — grandfather until
     expiry (today's behaviour, by accident), or reconcile at downgrade?
   - **Demo deal density:** if the real deal gets buried among ~210 demo shops,
     the question is density and placement, not whether demo mode exists.

## 9. Still to decide before broadening the test

- What "retention option C" refers to (§1).
- Whether the priority rail gets tested at all, i.e. whether a Stripe-sandbox top-up
  plus a KES 500 boost is in scope for the next pilot.
- Whether volunteer rows stay as genuine Node 0 records or get deleted — they are
  `is_demo = false`, so no demo wipe will remove them.
- Whether the next test adds a **second** merchant, which is what makes feed ranking,
  the flash rail and boost competition meaningful in the first place.
