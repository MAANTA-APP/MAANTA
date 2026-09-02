# MAANTA — counter card for shop staff

**Status:** DRAFT — written 2026-08-23, **updated 2026-09-01** to cover the
counter QR and the shopper queue, which shipped after this card was first
written. Not founder-reviewed and not lawyer-reviewed. Where this card and the
live **Merchant terms** (`/merchant-terms`) differ, the terms win.
**Audience:** the person at the counter who types in customers' codes.
**Left behind by:** the field operator, when the staff seat is set up
(`docs/ops/first-merchant-loop-test.md`).
**Companion:** the owner's copy is `docs/ops/merchant-welcome-pack.md`. Every
rule here comes from it — this card is the counter-side extract, not new policy.

One page. Keep it by the till.

---

## What MAANTA is, in one line

Shoppers see this shop's deal on their phone, claim it, and bring you a 6-digit
code — you check the code here, and they pay you in person as normal.

## Your job

Check the code, and take the payment. That's it. **You never handle a MAANTA
payment** — the customer pays the shop directly, in cash, the way they always do.

---

## Doing it

1. **Open MAANTA and tap "Redeem"** — it's in the bar at the bottom of the screen.
2. **The customer shows you a 6-digit code** on their phone.
3. **Type the six digits.** Checking a code costs the shop nothing.
4. The screen shows you the deal, **what to collect from the customer**, and the
   shop's fee — *before* anything is charged.
5. **Tap "Confirm redemption".**
6. **Take the money at the till**, in full, as normal.

### What a good one looks like

A green screen with a tick and the word **"Redeemed"**, then:

- **"Collect from shopper"** and an amount — this is the cash to take
- the deal name, and **"Redeemed at"** with the time
- a partly-hidden customer phone number, so you can sanity-check it's the right person

The screen clears itself after a few seconds, ready for the next customer.

**About the fee:** confirming records a **KES 30 success fee** against the shop's
MAANTA wallet. That is normal, expected, and already agreed between the shop and
MAANTA. **It is not a decision for you at the counter, and never a reason to
delay or refuse a customer.** If the wallet is empty the screen may say the fee
is *recorded as arrears* — the verification still worked, and it is not your
problem to solve.

---

## The shopper queue, and the QR at the door

Your shop may have a **MAANTA QR sticker** at the entrance and at the till. It is
the same code in both places.

**What it does:** a shopper scans it when they arrive, and their name appears on
your Redeem screen under **Shopper queue** — oldest first, with the deal and the
time they arrived.

**What it does NOT do — this is the important part:**

- **Scanning does not redeem anything.** A shopper in the queue has **not** been
  served, has **not** used their code, and the shop has **not** been charged.
- **The queue is not a payment or a receipt.** Nothing has happened yet.
- **You still ask for the 6-digit code.** Every time. Seeing someone in the queue
  is never a reason to skip the code.

**How to use it:**

- Tapping a shopper's row fills in their code for you — it saves typing, nothing
  more. You still see the deal, the amount to collect and the fee, and you still
  press **Confirm redemption**. Tapping charges nothing.
- **Dismiss** removes someone from the list — a shopper who left, or a row you
  have already served. **It does nothing to their deal.** They can still redeem.
- Rows drop off the list on their own after about **10 minutes**. That does not
  cancel anyone's deal either.
- The keypad always works. If the queue is empty, slow, or shows an error, just
  **type the six digits** — nothing is lost.

**Scanning is optional for the shopper.** Plenty will just walk up and show you a
code. That is completely normal. Never turn someone away for not scanning.

**If a shopper asks about points or rewards:** there are none right now. The
honest answer is *"there's no reward on this yet."* Do not promise one.

---

## When the code won't go through

| The screen says | What it means | What you do |
|---|---|---|
| **Invalid or already-used code** | Wrong digits, or that code has already been redeemed | Ask the customer to read it again from their phone. Try **once** more |
| **Expired past grace period** | The deal has ended | It can't be verified. Whether to still honour the offer is the **owner's** call, not yours. The shop is charged nothing |
| **Could not verify** / **Network error** | Something went wrong between the shop and MAANTA | Tap **Try again** once. If it fails again, serve the customer and report it |
| **Claimed away from your shop** | MAANTA isn't sure the customer is really here | Only continue if the customer **is standing in front of you**. If they are, confirm it. If not, stop |

**The rule the shop holds itself to:**
> **A customer never waits at the counter because of a problem between the shop
> and MAANTA.**

If MAANTA is being slow or awkward, serve the customer and sort it out afterwards.

---

## Never do these

- **Never guess or invent a code.** Only type what the customer shows you.
- **Never retry over and over.** Two attempts, then stop and report it.
- **Never confirm a redemption unless the customer is physically at the counter.**
  Not for a friend collecting, not over the phone, not "they'll come later."
  Confirming means *this person came to this shop* — that is the whole point of
  MAANTA, and confirming without them here is a false record.
- **Never let a MAANTA problem become the customer's problem.** No arguing at the
  till, no making them wait while you investigate.

---

## If something goes wrong

1. **Serve the customer first.** Let them finish and leave.
2. **Write it down** while it's fresh: the time, what the screen said (the exact
   words), and what the customer was trying to do. A photo of the screen is ideal.
3. **Tell the owner or your MAANTA contact.**

**Do not turn the counter into a help desk.** Reporting it is enough — someone
else fixes it.

**MAANTA contact:** ________________________________________

---

## The short version

- Tap **Redeem**, type the 6 digits (or tap them from the queue), check the
  screen, tap **Confirm redemption**.
- Checking a code costs nothing. Only a confirmed one counts.
- **"Redeemed"** in green, then collect the cash shown.
- Won't work? Two tries, then serve the customer and report it.
- **Only ever confirm with the customer standing in front of you.**
- A name in the queue is **not** a redemption. Always ask for the code.
