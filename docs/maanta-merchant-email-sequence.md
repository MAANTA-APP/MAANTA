# MAANTA — Merchant Email Sequence

Trigger: contact created with tag `merchant`. Cadence: signup, +2 days,
+5 days, +8 days, +12 days. Tone: businesslike, numbers-forward, respectful
of a shop owner's time. Every email: one CTA. Replies route to the founder
(or onboarding support once O2 in the readiness tracker is staffed) —
a reply is the highest-intent signal we have (+30 lead score).

## Email 1 — Welcome (immediately on signup)

- **Subject:** You're on the MAANTA merchant launch list
- **Goal:** Confirm, position MAANTA as pay-on-results, set the timeline.
- **Body beats:**
  - Thanks — you're on the launch list for BBS Mall.
  - One-liner: MAANTA sends shoppers to your shop and you only pay when a
    deal is actually redeemed at your counter.
  - Timeline: onboarding starts before the November launch; we'll walk you
    through it.
- **CTA:** Reply with your shop name and floor if we don't have it.

## Email 2 — How MAANTA drives redemptions (+2 days)

- **Subject:** Footfall you can count, not guess
- **Goal:** Explain the verified-redemption model as the differentiator.
- **Body beats:**
  - Shoppers claim your deal in the app and get a 6-digit code.
  - They redeem in person; your staff verifies the code on the spot.
  - Every redemption is verified (location-checked at your shop) — you see
    exactly how many customers MAANTA brought you. No bots, no fake clicks.
- **CTA:** See how verification works (link to explainer page).

## Email 3 — Pricing and operations (+5 days)

- **Subject:** What it costs: KES 30 per customer who shows up
- **Goal:** Full pricing transparency; pre-empt the "what's the catch" question.
- **Body beats:**
  - **KES 30 success fee** per verified redemption — that's the model.
    Nobody redeems, you pay nothing.
  - You preload a **wallet balance**; fees come out of it automatically.
    Top up by M-Pesa or card.
  - **Boosts:** KES 500 puts your deal at the top for 24 hours.
  - **Elite:** premium tier — and every launch merchant gets a **30-day
    Elite trial free**.
- **CTA:** Question about pricing? Just reply.

## Email 4 — What onboarding requires (+8 days)

- **Subject:** 15 minutes to get launch-ready
- **Goal:** Remove onboarding friction by listing exactly what's needed.
- **Body beats:**
  - What we need: shop name, floor/unit, phone, your shop's precise
    location (we capture it with you), and one person on your staff who
    will verify codes.
  - What you do at onboarding: create your account, load your first deal,
    top up your wallet.
  - We (or our on-ground agent) do it with you at your shop.
- **CTA:** Book your onboarding slot.

## Email 5 — Book or reply (+12 days)

- **Subject:** Launch list closes soon — lock in your onboarding
- **Goal:** Convert remaining intent before the launch push.
- **Body beats:**
  - Onboarding slots before launch are limited by agent time on the floor.
  - Restate: 30-day Elite trial for launch merchants, pay-on-redemption model.
  - If now's not right, reply and tell us when.
- **CTA:** Book onboarding — or reply for support.

## Post-sequence routing

- Score ≥ 50 (see segmentation plan): move to founder/agent personal
  follow-up list, stop automated emails.
- Booked: hand off to the onboarding process in `maanta-launch-ops-runbook.md`.
- Unengaged: one re-permission email at launch − 7 days, then suppress.
