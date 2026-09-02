# First merchant loop test

**Status:** DRAFT — written 2026-08-22, **updated 2026-09-01** (counter QR and
arrival check-in, which shipped after this protocol was written). Not yet run
against a real merchant.

**Owner:** field operator (node manager or agent) running the visit.
**Run:** once per newly activated merchant, at their shop, before they are
told they are live.
**Companions:** `docs/ops/merchant-welcome-pack.md` (what you leave with the
merchant), `docs/ops/field-operator-day-sheet.md` (the day around this visit),
`docs/ops/live-pilot-3-person-2026-07-30.md` (the founder-run day-one
narrative this protocol generalises).

> **For a full Merchant 01 run, use `docs/ops/merchant-01-pilot-runsheet.md`.**
> It sequences onboarding, QR placement, staff setup, arrival, the counter and
> evidence classification end to end. This file remains the authority on the
> **seven money proofs** below, and the runsheet defers to it for those.

---

## What this proves

One real shop, one real shopper, one real code, one real fee. The loop is only
proven when money has actually moved at a counter:

| # | Proof | Where you see it |
|---|---|---|
| 1 | The shop exists, is `active`, and is attached to Node 0 | `/admin/merchants/[id]` |
| 2 | The shop's wallet can cover a fee | `/merchant/wallet` |
| 3 | The merchant can publish a deal themselves | `/merchant/deals` |
| 4 | A real shopper can claim it on their own phone | shopper's `/my-deals` |
| 5 | Staff can verify the code at the counter | `/merchant/redeem` |
| 6 | The KES 30 success fee debited the wallet, once | `/merchant/wallet` ledger |
| 7 | The redemption is auditable afterwards | `/admin/redemptions` |

If any one of these cannot be shown, the loop is **not** proven. Record which
one failed and stop — do not tell the merchant they are live.

Three further **observations** were added 2026-09-01. They are not proofs and the
loop is proven without them — record them, do not gate on them:

| # | Observation | Where you see it |
|---|---|---|
| 8 | The counter QR is printed and placed at entrance and till | `/merchant/qr/print`, then the wall |
| 9 | A shopper's scan recorded an arrival | the Shopper queue on `/merchant/redeem` |
| 10 | The result is classified as genuine **external** evidence | `docs/ops/evidence-classification-guide.md` |


---

## Before you travel

- [ ] The shop is **approved and active** in `/admin/merchants/[id]`. Approval
      is an admin action; a field operator cannot self-approve.
- [ ] The wallet shows a balance. At activation this is normally the Node 0
      **KES 300 opening credit** — ten redemptions at KES 30 before the shop
      spends anything of its own.
- [ ] You know who answers a merchant question today, and the merchant will be
      given that contact. **This owner is not yet assigned** — readiness gate
      **O2** in `docs/maanta-launch-readiness-tracker.md` is open. Do not
      invent a support number; use whatever the founder has told you and say
      the response window plainly (target: first response within 2 business
      hours during mall opening hours).
- [ ] Your own phone and the shopper's phone both work on mall wifi or data.
- [ ] You have the merchant welcome pack to leave behind.

**Do not use a rehearsal fixture as the merchant.** Any `aragagency+*` account
or any row with `is_demo = true` is scaffolding, not a shop. The pilot merchant
is a real signup.

---

## The hazard that will bite you first

**Demo mode is ON in production.** The shopper feed shows a large synthetic
marketplace — hundreds of demo shops and deals — alongside anything real. There
is **no demo guard in `claim_deal`**: a tester browsing `/feed` can claim a
synthetic deal by mistake, and no real merchant can ever verify that code.

So, during the test:

> **The shopper opens the merchant's deal by direct link — `/deals/{id}` — not
> by browsing the feed.**

Get the link from the merchant's own `/merchant/deals` list after step 3. If
the shopper ends up holding a code the merchant's till rejects with
"not found", check first whether they claimed a demo deal.

---

## The loop

### 1 — Merchant publishes a deal (merchant does it, you watch)

The merchant creates it on their own phone at `/merchant/deals/new`. You may
coach; do not take the phone. If they cannot do it unaided, that is a finding
worth writing down.

Set a **short expiry** — long enough to finish the visit, short enough that a
forgotten test deal does not sit live in the mall afterwards.

If deal creation is blocked, the wallet is empty: the zero-balance gate stops
**new deals** (it never stops verification). Resolve the balance first.

### 2 — Shopper claims it

The shopper opens the direct deal link, signs in, and claims. They should now
see a **6-digit code** in `/my-deals`, with the time it stays valid.

Note the claim is held until the deal expires **plus a 15-minute grace period**.

### 2b — Arrival check-in (optional, and never a gate)

If the shop's counter QR is up, the shopper can scan it with their phone camera
on arrival and will appear in the **Shopper queue** on the till screen.

- **The QR records arrival. It never redeems**, never charges, and never
  completes anything.
- **The queue is not redemption state.** Dismissing a row does nothing to the
  claim, and rows lapse on their own after about 10 minutes without affecting it.
- With `fast_visit_enabled = false` (its value on production as of 2026-09-01)
  **no points are awarded and no reward eligibility is stamped.** Do not tell
  anyone a reward is available.
- If the scan fails for any reason, **carry straight on to step 3**. The 6-digit
  path is complete on its own. A failed scan is a finding, not a blocked test.

### 3 — Counter verification (the real proof)

At the till, on the merchant's device, `/merchant/redeem`:

1. Staff type the 6 digits — or tap the shopper's queue row, which fills the same
   keypad and charges nothing either. **Neither action charges anything.**
2. The screen resolves and shows the deal, what the shopper pays, the **KES 30
   success fee**, and the wallet balance — *before* anything is charged.
3. Staff press **Confirm redemption**. That is the only action that charges.
4. The shopper pays the shop **in person**, the way they always would. MAANTA
   never touches that money.

### 4 — Read the money back

On `/merchant/wallet`, the ledger should show one **success fee −KES 30** entry
for this redemption, and a balance reduced by exactly that. One redemption,
one fee.

Then on `/admin/redemptions`, find the redemption and confirm it reads as
verified with the right shop and time.

---

## When it does not go cleanly

The counter screen is designed so the shopper never waits on a billing problem.
That is the frozen **verify-anyway** rule: **finish the shopper's redemption,
sort the money out afterwards.**

| What the till says | What it means | What you do |
|---|---|---|
| Code not found / already used | Wrong code, or already redeemed — or a demo deal was claimed | Have the shopper re-read the code from `/my-deals`; check for a demo claim |
| Code expired | Past the deal expiry plus the 15-minute grace | Cannot be verified. The merchant may honour the offer off-platform; that is their call, and no fee is charged |
| Fee shows as owed / arrears | Wallet could not cover the KES 30 | The redemption still completes. The fee is recorded as arrears against the wallet — say so plainly, do not hide it |
| Fee outcome unknown | The debit result was uncertain | The redemption **still completes** and a fraud-review task is opened for admin. Do not retry the verification — a retry risks a second fee |
| Merchant disputes the fee afterwards | — | Route to admin. Disputes are resolved within **72 hours**: upheld → the redemption is reversed and the KES 30 credited back; rejected → the fee stands |

Never resolve a money question by editing a balance. The ledger is the record.

---

## Payments — what not to promise

Card top-ups run against **Stripe in sandbox** during testing, and the M-Pesa
STK path (IntaSend) is prepared but its availability **must not be assumed**.

For the first loop test this means: **the loop runs on the opening credit**, not
on a real top-up. Do not promise a merchant that they can top up by M-Pesa today
unless the founder has confirmed that rail is live. If they ask, say it is being
prepared and that the opening credit covers their first ten redemptions.

---

## What to record

One row per merchant, wherever the node keeps its day sheet:

- shop name, floor/unit, what3words, date and time of the visit
- who ran the visit
- each of the seven proofs above: pass / fail
- the deal used, and whether it was ended after the test
- anything the merchant could not do unaided
- anything you promised them, and by when

### After the visit

- [ ] End or let expire the test deal — do not leave it live.
- [ ] Merchant welcome pack left with them, contact written on it.
- [ ] Failures written up the same day; anything touching money or the mall
      relationship goes to the founder same-day.

---

## What this document does not decide

- **Who owns merchant support** (gate O2) — founder's call, still open. Founder
  direction 2026-08-22: **"good for now"** — the pilot is not blocked on it.
  Use the contact the founder gives you, write it on the pack, and do not treat
  the open gate as a reason to postpone a visit.
- Whether the pilot proceeds past this merchant — the readiness tracker is the
  gate status, not this file.
- Anything about fees, the credit, the grace period or the dispute SLA: those
  are frozen rules recorded in `docs/maanta-decisions-log.md`. This protocol
  reports them; it does not set them.
