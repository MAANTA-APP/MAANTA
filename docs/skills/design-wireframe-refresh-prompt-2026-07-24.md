# Claude Design prompt — refresh S1–S2–S3–M3–M4 wireframes to shipped app

**Created:** 2026-07-24 · **Status:** durable handoff. Paste the fenced block
below into Claude Design. It is product/UX-only (no repo internals) and describes
the app now live in production after the front-end alignment work. Grounded in the
shipped screens and `docs/skills/screen-alignment-2026-07-24.md`.

---

```
You are Claude Design. I need you to update and annotate MAANTA's mobile
wireframes so they match the app as it works today.

## Context — what MAANTA is
MAANTA is a deals app used inside a shopping mall (piloting at BBS Mall, Nairobi).
Shoppers browse deals on their phone and "claim" one, which gives them a 6-digit
code. They walk to the merchant's counter, show the code, staff check it, and the
shopper pays the merchant DIRECTLY IN CASH at the discounted price. MAANTA never
takes payment from a shopper in the app — there is no cart, no checkout, no card
entry anywhere in the shopper experience. MAANTA earns a small flat fee from the
merchant (paid from the merchant's prepaid wallet) each time a code is verified.

There are two audiences:
- Shoppers (screens S1, S2, S3): browse, claim, and present a code.
- Merchants at the till (screens M3, M4): check a code and confirm it.

## Goal
Redraw and annotate the mobile wireframes for these five screens so they reflect
the current shipped behaviour, including all their states. For every screen,
produce the layout, the real on-screen copy, and short annotations that explain
what each element tells the shopper or merchant. Keep MAANTA's existing visual
language — you are updating structure, states, and copy, not restyling the brand.

Money is always shown in plain, un-coloured text (never red/green tinted).
Success screens are calm — no confetti or celebration. There is at most one
highlighted (amber) primary action per screen; disabled actions are grey.

═══════════════════════════════════════════════════════════════════
## Screen S1 — Deals feed (shopper home)
Purpose: the shopper browses live deals in the mall.

Draw these states as separate frames:
1. Loading — placeholder "skeleton" cards while deals load (no spinner-only
   blank screen).
2. Deals list — the normal feed. Show sectioned rails in this order:
   "Flash Deals", "Boosted Deals", "Deals Near Me". Each deal card shows a cover
   image, the shop name, the deal title, and a clear "You pay KES N" price (with
   the original struck-through price where there's a discount).
3. Empty — only when there are genuinely no live deals. Copy:
   "No deals live right now" / "Merchants drop new deals through the day."
4. Error — when deals can't be loaded. Copy: "We couldn't load deals — try again
   in a moment." with a "Retry" action. Annotate that this is distinct from the
   empty state (a problem, not "no deals").

Layout notes: a bottom tab bar is always present (Feed · Search · Deals · You);
the only amber accent there is the small active-tab indicator. Add an annotation:
"Browsing never asks for a phone number or payment."

═══════════════════════════════════════════════════════════════════
## Screen S2 — Add your phone (claim gate)
Purpose: a shopper can browse freely, but CLAIMING a deal requires a verified
phone. This screen only appears when someone taps Claim without a verified phone.

Draw these steps as frames:
1. Enter phone — heading "Add your phone to claim", one short reason line, a
   country-code + phone field, and a single primary "Send code" action.
2. Enter code — a segmented 6-BOX one-time-code input (one digit per box, boxes
   fill left to right). A "Verify" action that stays disabled until all six
   digits are entered. A "Resend code" link that is disabled with a live
   countdown (e.g. "Resend code in 30s") before it becomes tappable, plus a
   "Use a different number" option.
3. Success — a brief confirmation state ("Phone verified — you can now claim
   deals. Taking you back…") shown for about one second before the shopper is
   automatically returned to the deal they were claiming.

Error copy to show: "Couldn't send the code. Check the number and try again." and
"Code didn't match. Check the SMS and try again." Annotate: "This is a one-time
verification gate, not a payment step, and not required just to browse."

═══════════════════════════════════════════════════════════════════
## Screen S3 — Deal detail & claimed ticket
Two related frames.

Deal detail:
- Cover image, shop name, floor/location, and the deal title.
- "YOU PAY KES N" as the single largest, most prominent money value, with the
  original struck-through price and, if relevant, a small "Includes KES X in
  taxes and charges" line. Show the itemised price breakdown ONLY on this screen
  (nowhere else in the app).
- Validity, how many have claimed / are left, and a verified-redemptions count
  for trust.
- A sticky bottom bar with "Claim deal" (the one amber action) and Cancel.

Claimed ticket (what the shopper shows at the counter):
- A "CLAIMED" chip, then a white code card with a gently "breathing"/animated
  amber border, labelled "FOR THE SHOP", containing the 6 large digits and a LIVE
  ticking countdown to expiry.
- The price the shopper will pay appears OUTSIDE that code card.
- A shop location line and a "Navigate" action (walk to the shop), and the line
  "Show this screen at the counter." Annotate: "The live countdown is deliberate —
  a frozen timer means it's a screenshot; the code is presented, never used to
  pay in the app."

═══════════════════════════════════════════════════════════════════
## Screen M3 — Merchant redeem (the till)
Purpose: staff enter the shopper's 6-digit code and confirm it. Two steps:
entering the code checks it and charges nothing; a separate explicit Confirm is
the only thing that charges the merchant's fee.

Draw these states:
1. Keypad (default) — a persistent WALLET HEADER at the top showing the wallet
   balance in plain text with a chevron indicating you can tap through to the
   wallet. Below it, a 6-digit entry with a large number keypad. Include a
   "Checking…" state after a code is entered.
2. Code valid (disclosure, before charging) — a small ink "Code valid" chip (not
   amber), the deal title, and a calm line showing the shopper's phone in MASKED
   form only (e.g. "Shopper phone +254 7xx xxx 678") as a "is this the right
   person?" check. Then THREE clearly separated money elements — keep them
   visually distinct and never merged:
     • "Collect from shopper KES N" — the cash to take from the shopper.
     • the flat MAANTA success fee line — what the merchant pays MAANTA.
     • the wallet balance / balance-after.
   Actions: a single amber "Confirm redemption — KES 30 fee", a "Reject code"
   option, and a text link "Cancel — charges nothing".
3. Invalid / expired code — a distinct dark screen: "Code not valid" with the
   reason and "No fee was charged", plus "Try another code". Annotate that this
   is clearly different from the "Code valid" state.

Important annotations:
- "Collect from shopper" is the cash amount and is completely separate from the
  MAANTA fee and from the wallet balance — three different numbers.
- Confirm is NEVER blocked by a low or empty wallet; if the wallet can't cover the
  fee, that's disclosed as owed/arrears and the redemption still completes.
- The shopper's phone is shown masked only.

═══════════════════════════════════════════════════════════════════
## Screen M4 — Redeemed (success takeover)
Purpose: the full-screen confirmation after staff confirm a valid code.

Draw one calm, full-bleed success frame containing:
- A "Redeemed" header with a simple check (calm — no celebration, no sound).
- "Collect from shopper KES N" as the merchant's next action, with the subtext
  "Cash, collected in person — not an in-app charge".
- The deal title, the shopper's phone in MASKED form, and a "Redeemed at [time]"
  line — label this clearly as the server-recorded time of the verification (the
  moment MAANTA confirmed it), shown in local time.
- The MAANTA fee outcome: either "KES 30 success fee charged" with the new wallet
  balance, OR "recorded as arrears — settles from your next top-up" when the
  wallet was short.
- A short reference code for the transaction, and a note that the screen
  auto-resets back to the keypad after a few seconds.

Annotate: "No payment is taken from the shopper here — this only confirms the code
and tells staff how much cash to collect in person."

═══════════════════════════════════════════════════════════════════
## Constraints (apply to every frame)
- No in-app shopper payment anywhere: never draw a cart, checkout, card field,
  "Pay", or "Buy" in any shopper screen. Shoppers pay merchants in cash, in
  person.
- Phone numbers appear in MASKED form only — never a full number on any screen.
- Any time shown for a redemption is a SERVER-RECORDED event ("Redeemed at …"),
  labelled as such — not a countdown or a device clock reading.
- Keep money visually neutral (plain text), failure screens dark rather than red,
  success screens calm, and at most one amber action per screen.

## Deliverables
1. Updated mobile wireframes for each screen AND each state listed above
   (S1: 4 states; S2: 3 steps; S3: 2 frames; M3: 3 states; M4: 1 frame).
2. Short annotations on each frame explaining what each key element communicates
   to the shopper or the merchant.
3. A one-page "keep-in-sync" checklist a designer can use on future changes, e.g.:
   - If we change the claim gate, update S2 (and the "browsing is free" note).
   - If we change what the till sees before confirming, update M3's three money
     elements and the masked-phone line.
   - If we change the success confirmation, update M4's "Redeemed at" time,
     masked phone, and the cash-only subtext.
   - If any shopper screen ever gains a payment element, stop — that contradicts
     the cash-only model and needs product sign-off first.
```

---

## Grounding (shipped behaviour, for the author's reference — not for the prompt)
- S1 states, rails, empty vs error copy: feed page + error boundary.
- S2 6-box OTP, resend cooldown, 1.2s success dwell, error strings: verify-phone.
- S3 YOU PAY emphasis, breakdown-only, breathing ticket card: deal detail + ticket.
- M3 wallet header + chevron, "Code valid" chip, masked phone, three distinct
  money blocks, "Cancel — charges nothing", verify-anyway: redeem keypad.
- M4 "Redeemed", cash subtext, masked phone, server "Redeemed at": redemption
  result takeover. Full detail in `docs/skills/screen-alignment-2026-07-24.md`.
