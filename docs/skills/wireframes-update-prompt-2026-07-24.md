# Claude Design wireframe-update prompt (post PRs #68/#70/#71)

**Created:** 2026-07-24 · **Author:** Claude (Builder mode) · **Status:** durable
handoff. This file is the exact prompt to paste into **Claude Design** to bring
MAANTA's wireframes into line with the product now on `main`. It is grounded in
repo state, not recollection — sources are listed at the bottom.

The prompt is written to be self-contained: copy everything inside the fenced
block into Claude Design with no edits.

---

```
You are Claude Design, updating an existing low-fidelity wireframe set. Do NOT
start a redesign — you are reconciling wireframes to shipped behaviour: fixing
structure, labels, states, and copy while preserving the existing visual
language, grid, and component vocabulary.

## Context — what MAANTA is
MAANTA is an in-mall deals platform, piloting at BBS Mall, Nairobi. Shoppers
browse deals and claim them in the app, which issues a 6-digit code. They walk to
the merchant's counter, show the code on their phone, staff verify it, and the
shopper pays the merchant DIRECTLY IN CASH at the discounted rate. Merchants pay
MAANTA a flat KES 30 "success fee" per verified redemption out of a prepaid
wallet. Admins approve merchants and review fraud/disputes. Currency is KES.

## The single most important truth to get right
MAANTA NEVER charges a shopper inside the app. There is no shopper checkout, no
card entry, no in-app payment, no cart. All shopper payment is cash, in person,
off-app, after staff accept the code. Any "pay in app", "checkout", "add card",
or "pay now" element in the current wireframes for the SHOPPER is wrong and must
be removed. (Merchants DO pay in-app — wallet top-ups by M-Pesa/card — but that
is a separate audience.)

## Key behaviour facts the wireframes must reflect
1. Shopper payment is cash-only and off-app. The app's job for the shopper ends
   at "show this code at the counter".
2. "Collect from shopper KES N" — the cash amount the shopper owes the merchant
   (the shopper's "You pay" total, snapshotted at claim time). It must appear on
   TWO merchant screens: the pre-confirm disclosure screen AND the post-verify
   success screen. It is a DISTINCT amount from (a) the KES 30 success fee and
   (b) the merchant's wallet balance — never merge or stack these three into one
   figure. Omit the line entirely when the amount is missing, zero, or negative.
3. Agent-assisted onboarding: the merchant onboarding wizard asks "Were you
   helped by a Maanta agent?" (Yes/No) and, on Yes, shows an agent picker. This
   is attribution only — the merchant is always the one submitting; the agent is
   just credited. This step only appears when field agents exist.
4. Phone-at-claim gate: a shopper can sign up / sign in with email OR phone, but
   CLAIMING a deal requires a verified phone. An email-only shopper who taps
   Claim is routed through a phone SMS-OTP verification screen, then returned to
   the deal to finish. Browsing never requires a phone; only claiming does.
5. Healthz + FX are ops/admin-internal concerns, not shopper- or merchant-facing
   UI. Healthz is a JSON liveness/env-status endpoint (see admin/ops section).
   FX (non-KES → KES conversion for card top-ups) is an internal money-path
   detail with NO user-facing surface — do not invent an FX screen or a currency
   selector for shoppers.

## Screen-by-screen guidance

### 1. Shopper — browse & deal detail
- Keep the deal browse list/grid and deal-detail layout.
- Each deal shows a "You pay KES N" figure (the discounted price the shopper
  will pay in cash), optionally with a struck-through "Was KES N" and a "includes
  taxes and charges" note. This is informational — it is NOT a price the app
  collects.
- The primary action is "Claim deal", never "Buy", "Pay", or "Checkout".
- Remove any cart, basket, payment-method, or card-entry elements from shopper
  screens if present.

### 2. Shopper — claim → code ticket
- Tapping "Claim deal" opens a small confirm bottom sheet ("Claim: <deal> —
  <merchant>", note that the code is valid until the deal expires plus a short
  grace period, Confirm / Cancel).
- On Confirm, a full-screen "Checking you're at BBS Mall…" location-check
  takeover appears briefly (with the merchant's what3words chip and a Cancel).
  Location is best-effort and never blocks the claim.
- Result is the claimed-code ticket — the hero of the shopper experience:
  - A large 6-digit code in a white card labelled "For the shop", with a LIVE
    ticking countdown ("until this code expires") beneath it.
  - "You pay KES N" shown as the cash amount to hand over at the counter.
  - Merchant name / floor / what3words chip + a "Navigate" action.
  - Footer copy: "Show this screen at the counter" and "If the timer isn't
    moving, it's a screenshot." The moving timer is an anti-screenshot device —
    keep it; do not replace the code with a static image or QR-only view.
- The code is something the shopper PRESENTS; it is never scanned-to-pay.

### 3. Shopper — phone verification (claim gate)
- Add a phone-verification screen reached only when an email-only shopper taps
  Claim: "Add your phone to claim" → enter phone → enter the SMS OTP code →
  return to the same deal to finish claiming.
- Make clear this is a one-time gate to claim, not a payment step and not a
  general sign-up wall for browsing.

### 4. Merchant — redeem keypad (pre-confirm DISCLOSURE screen)
- The redeem flow is strictly two-step: entering the code RESOLVES it and charges
  nothing; a separate explicit Confirm is the only thing that charges. Reflect
  both states.
- Keypad state: 6-box code entry + numeric keypad, "Enter the customer's 6-digit
  code". On a tablet-at-the-till (wide) layout, the keypad stays LEFT and large;
  a right-hand pane is information-only (wallet balance + how the fee works) and
  holds NO primary action.
- After the code resolves, show the DISCLOSURE screen with, in this order:
  - "Code resolved" + the deal title.
  - "Collect from shopper  KES N" — the cash to take from the shopper, in a
    bordered row, visually distinct and above the fee. (Omit if no amount.)
  - An optional geofence warning ("Claimed away from your shop") when the claim
    location looks off.
  - A fee-disclosure block showing the KES 30 success fee AND the wallet balance
    (these are the merchant's cost + balance — separate from the collect amount).
  - Actions: "Confirm redemption — KES 30 fee" (primary), "Reject code", and a
    text "Cancel". Confirm is NEVER disabled by a low/empty wallet (verify-anyway:
    an unfunded fee is recorded as arrears, disclosed in the copy).
- Also show the "Checking…" in-between state and a "Confirming…" spinner state.

### 5. Merchant — redeem SUCCESS takeover
- A full-bleed dark-green "Redeemed" takeover (flat fill, white check — no
  confetti, no celebration; money moved, it is not a party).
- Show, clearly separated:
  - "Collect from shopper  KES N" in its own bordered box — the merchant's next
    action (take this cash). (Omit if no amount.)
  - The KES 30 success fee line: either "KES 30 success fee charged" + "Wallet
    balance KES N", OR (when the wallet couldn't cover it) "KES 30 success fee
    recorded as arrears · Settled from your next top-up."
  - A copyable reference id for the movement.
  - A "sent to MAANTA for review" note when the redemption was auto-flagged.
  - "Resetting in 3…" auto-return to a fresh keypad.
- A rejected/invalid code uses a DARK screen (icon + "Code not valid"), NOT red,
  with "No fee was charged".

### 6. Merchant — onboarding wizard (with agent attribution)
- A short multi-step wizard: Business details → Location (what3words, must
  validate to continue) → Floor & unit → Wallet (explains the KES 30 success fee
  and suggested top-up) → Review & submit → Submitted-for-verification.
- On the Review step, add the agent-attribution block (only when agents exist):
  "Were you helped by a Maanta agent?" with a Yes/No pair, and on Yes a "Which
  agent?" dropdown. Helper copy: "So we can credit the field agent who signed you
  up. You're still submitting this yourself." Submit stays disabled until this is
  answered. Do NOT depict the agent as logging in or submitting on the merchant's
  behalf — it is a credit/label only.
- Wallet top-up (M-Pesa or card) happens AFTER submission — show it as a
  follow-on, not a blocking in-wizard payment.

### 7. Fee reversal (merchant/admin trust control)
- Where a redemption or fee detail is shown to admin/merchant, a "Reverse fee"
  action must require a written reason/note before it can be submitted (an empty
  note is rejected). Represent it as a trust/ops control with a mandatory note
  field, not a one-tap button.

### 8. Admin / ops — healthz & FX (internal, minimal)
- If the wireframes have an admin/ops or system-status area, represent healthz as
  a simple status/liveness readout: a public "liveness" state (status OK, uptime,
  build/commit) plus an admin-only, boolean-only "env presence" checklist grouped
  by rail (Supabase, Auth, Payments, Monitoring, Email, Push, Geo) — showing only
  whether each key is SET, never any secret value. It is diagnostic, not a
  dashboard with metrics.
- FX is internal only: merchant top-ups are charged in KES; a non-KES card
  top-up is converted to KES behind the scenes. Do NOT add any FX/currency-picker
  UI for shoppers or merchants. Mention it, if at all, only as an internal note
  on the merchant top-up flow ("charged in KES").

## Constraints (hold these firm)
- Low-fidelity only: boxes, labels, states, and copy. No color exploration, no
  final visual polish, no imagery.
- Do NOT introduce any in-app shopper payment, checkout, cart, or card-entry
  flow. Shopper payment is always cash, off-app.
- Preserve the existing visual language and component set — you are updating
  structure and copy, not redesigning. Keep money figures visually neutral (not
  colour-coded), keep the failure screen dark rather than red, and keep the
  success screen calm (no celebration).
- Keep the three merchant money figures — "Collect from shopper", the KES 30
  success fee, and the wallet balance — visually distinct and never conflated.
- Where an amount could be missing/zero, show the omitted state (no empty "KES 0"
  rows).
- Annotate each changed screen with a short note on WHAT changed and WHY, so a
  reviewer can diff against the old wireframes.
```

---

## Sources this prompt was grounded in (repo state on `main`, 2026-07-24)

- `maanta-app/src/app/merchant/(app)/redeem/redeem-keypad.tsx` — two-step
  resolve→confirm, disclosure screen, collect line, verify-anyway, tablet layout,
  dark rejected screen.
- `maanta-app/src/components/ui/redemption-result.tsx` — success takeover, collect
  box distinct from KES 30 fee, arrears vs charged, reference id.
- `maanta-app/src/app/api/redemptions/preflight/route.ts` &
  `.../verify/route.ts` — `collectAmount` (amount_kes) surfaced on both screens,
  read-only, null-omitted.
- `maanta-app/src/app/merchant/onboard/onboard-wizard.tsx` — wizard steps + agent
  attribution radiogroup/picker.
- `maanta-app/src/app/(shopper)/deals/[id]/claim-flow.tsx` — claim bottom sheet,
  location-check takeover, `phone_required` → `/verify-phone`.
- `maanta-app/src/app/(shopper)/tickets/[id]/claimed-code.tsx` & `page.tsx` —
  code hero, live countdown, "You pay", "show this screen at the counter".
- `maanta-app/src/lib/health.ts` & `src/app/api/healthz/route.ts` — liveness +
  admin-gated boolean env presence.
- `maanta-app/src/lib/fx/**` & `src/lib/currency.ts` — internal →KES conversion.
- `docs/skills/launch-audit-2026-07-24.md`, `docs/skills/agent-attribution.md`,
  `docs/skills/clerk-auth.md`, `docs/skills/fx-provider.md`.
