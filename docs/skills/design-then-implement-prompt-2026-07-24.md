# Claude Design → Claude Code prompt (organize wireframes, then emit an implement prompt)

**Created:** 2026-07-24 · **Mode:** Builder · **Status:** durable handoff.
An optimised, repo-grounded rewrite of a two-part Claude Design prompt: Part 1
organizes/annotates the existing MAANTA wireframes (S1/S2/S3/M3/M4); Part 2 has
Claude Design emit a Claude Code implementation prompt. Route/component paths are
corrected to the ACTUAL repo (the original draft used `/deal/[dealId]`, `/`, and a
`/merchant/redeem/success` route that don't exist). Paste the fenced block into
Claude Design.

## Repo-truth corrections folded in (why the paths changed)
- S1 shopper home/deals list = **`/feed`** → `src/app/(shopper)/feed/page.tsx`.
  `/deals` just `redirect("/feed")`s; `/` is the public landing
  (`src/app/(public)/page.tsx`), not the deal list.
- S3 deal detail + claim = **`/deals/[id]`** → `src/app/(shopper)/deals/[id]/page.tsx`
  + `claim-flow.tsx` (not `/deal/[dealId]`).
- S2 phone gate = **`/verify-phone`** → `src/app/verify-phone/page.tsx`.
- M3 redeem disclosure + keypad = **`/merchant/redeem`** →
  `src/app/merchant/(app)/redeem/page.tsx` + `redeem-keypad.tsx`.
- M4 success = a **takeover STATE inside `redeem-keypad.tsx`** rendering
  `RedemptionResult` from **`src/components/ui/redemption-result.tsx`** (lowercase).
  There is NO `/merchant/redeem/success` route.
- All five screens already exist and are implemented — Part 2 is "align existing
  files to the wireframes," not greenfield build.
- Brand/UI tokens live in `maanta-app/tailwind.config.ts`; frozen UI rules in
  `docs/skills/frozen-ui-overall-handoff.md` + `frozen-ui-locked-rules-audit.md`.

---

```
You are Claude Design working on MAANTA. This is a two-part task. In PART 1 you
organize and annotate MAANTA's existing wireframes into an implementation-ready
set. In PART 2 you use that organized set to write a single implementation prompt
I can paste into Claude Code. Do Part 1 fully before Part 2.

## MAANTA context and invariants (hold these fixed)
MAANTA is a deals platform for BBS Mall, Nairobi.
- Shoppers NEVER pay in-app. They present a 6-digit code and pay the merchant
  directly in cash at the discounted rate. No cart, checkout, or card entry exists
  on any shopper screen.
- Merchants verify the code, accept the discounted rate, collect the cash, and pay
  MAANTA a flat KES 30 success fee from a prepaid wallet.
- "Collect from shopper KES N" appears on BOTH the merchant disclosure screen (M3)
  and the merchant success takeover (M4). It is display-only and DISTINCT from the
  "KES 30 success fee" and the "Wallet balance" — never merge the three. It is
  omitted when the amount is null, zero, or negative.
- Phone-at-claim: browsing is free; claiming a deal requires a verified phone via
  the `/verify-phone` OTP flow. The gate blocks claiming only, never browsing.

IMPORTANT repo reality (these screens already exist — you are aligning wireframes
to them and them to the wireframes, not inventing new routes):
- S1 shopper home / deals list → route `/feed`, file
  `src/app/(shopper)/feed/page.tsx`. (`/deals` redirects to `/feed`; `/` is the
  public landing, not the deal list.)
- S3 deal detail + claim → route `/deals/[id]`, files
  `src/app/(shopper)/deals/[id]/page.tsx` + `claim-flow.tsx`.
- S2 phone-at-claim gate → route `/verify-phone`, file
  `src/app/verify-phone/page.tsx`.
- M3 merchant redeem disclosure + keypad → route `/merchant/redeem`, files
  `src/app/merchant/(app)/redeem/page.tsx` + `redeem-keypad.tsx`.
- M4 merchant redeem success → NOT a separate route. It is a full-screen takeover
  STATE inside `redeem-keypad.tsx` that renders `RedemptionResult` from
  `src/components/ui/redemption-result.tsx`.

=====================================================================
PART 1 — Organize and annotate the wireframes
=====================================================================

Step 1 — List and name the screens. For each: a short id + one-line purpose.
At minimum cover:
- S1 — Shopper home / deals feed: browse live deals.
- S2 — Phone-at-claim gate ("Add your phone to claim"): verify a phone before
  claiming.
- S3 — Deal detail + claim: see the deal + "You pay" amount and claim a 6-digit
  code.
- M3 — Merchant redeem disclosure: resolve a code and see what to collect + the
  fee before confirming.
- M4 — Merchant redeem success takeover: confirmation of a verified redemption.
Add any other key screens you find (e.g. the claimed-code ticket the shopper
presents, merchant onboarding, admin/ops) and label them the same way.

Step 2 — For every screen, capture:
- Hierarchy: header / main / footer, and the primary CTA(s) (e.g. "Claim deal",
  "Verify phone", enter code → "Confirm redemption").
- Elements + copy (use real copy where known, good draft copy otherwise):
  - S1: deal cards with discount + "You pay" figure, feed sections, browse/search
    entry. Empty state when there are no deals.
  - S2: phone input, "Send code", OTP input, "Verify", status/error messages,
    return-to-deal behaviour.
  - S3: deal details, "You pay KES N", "Claim deal" (primary) + "Cancel"; the
    claimed-code result (6-digit code, live countdown, "show this screen at the
    counter").
  - M3: 6-digit keypad + code boxes, "Code resolved" + deal title,
    "Collect from shopper KES N" row, "KES 30 success fee" line, "Wallet balance",
    "Confirm redemption — KES 30 fee" (primary), "Reject code", "Cancel".
  - M4: "Verified" header, "Collect from shopper KES N" box, fee line
    (charged OR "recorded as arrears"), wallet balance, copyable reference id,
    auto-reset.
- Behaviour and rules to annotate on the relevant screens:
  - Cash-only: confirm NO cart/checkout/card anywhere in shopper screens; add the
    note "Shoppers pay merchants directly in cash" on S1/S3/M3/M4.
  - "Collect from shopper KES N": confirm it is on BOTH M3 and M4; annotate it as
    display-only and distinct from the KES 30 fee and the wallet balance; omitted
    for null/0/negative.
  - Phone-at-claim: annotate the flow S1 (browse, ungated) → S3 "Claim" → S2
    verify phone if not already verified → back to S3 to finish. Browsing is never
    gated.
  - Error/empty states: no deals (S1), OTP send/verify failure (S2), invalid /
    expired / already-used code (M3 → dark "Code not valid, no fee charged"),
    network errors.

Step 3 — Map each screen to its route + component (use the repo paths above), and
for each add a one-line note on how its hierarchy/rules translate into the
component. Flag explicitly that M4 is a takeover state of the M3 component
(via `RedemptionResult`), not a standalone route.

Output Part 1 as a compact structured summary: the screen list, then per-screen
hierarchy/elements/rules, then the route↔component table.

=====================================================================
PART 2 — Emit the Claude Code implementation prompt
=====================================================================

Using the Part 1 summary, write ONE self-contained prompt I can paste into Claude
Code. It must:

1. Open with: "You are Claude Code working in the MAANTA repo."
2. State the goal: align the S1/S2/S3/M3/M4 screens to the organized wireframes so
   visitors to maanta.app see them — updating the EXISTING Next.js/React files
   listed below (read each before editing; do not create parallel routes).
3. List routes → components to update:
   - `/feed` → `src/app/(shopper)/feed/page.tsx` (S1 deals feed)
   - `/deals/[id]` → `src/app/(shopper)/deals/[id]/page.tsx` + `claim-flow.tsx` (S3)
   - `/verify-phone` → `src/app/verify-phone/page.tsx` (S2)
   - `/merchant/redeem` → `src/app/merchant/(app)/redeem/page.tsx` +
     `redeem-keypad.tsx` (M3)
   - M4 success = the takeover state in `redeem-keypad.tsx` rendering
     `src/components/ui/redemption-result.tsx` (no new route)
4. Carry over the behaviour rules, grounded in the existing code:
   - Shoppers never pay in-app: do NOT add any payment endpoint or checkout UI; the
     only payment surfaces are merchant top-ups (`/api/topup`, `/api/topup/stripe`).
   - "Collect from shopper KES N": use the redemption's `amount_kes` snapshot,
     already surfaced as `collectAmount` by `POST /api/redemptions/preflight` (M3)
     and `POST /api/redemptions/verify` (M4). Render on M3 and M4, distinct from
     the fee and wallet, and omit when null/0/negative.
   - Phone-at-claim: reuse the existing gate — `currentUserHasVerifiedPhone()` in
     `src/lib/auth.ts`; the claim route (`POST /api/redemptions`) returns
     `403 { code: "phone_required" }`; `claim-flow.tsx` routes to
     `/verify-phone?next=/deals/[id]` and back. Block claim only, never browse.
   - Wire UI to the existing APIs (deals/feed, claim, preflight, verify, phone
     auth) — do not change money-path RPCs or fees.
5. Reference the MAANTA brand & UI spec: tokens in
   `maanta-app/tailwind.config.ts` and the frozen UI rules in
   `docs/skills/frozen-ui-overall-handoff.md` +
   `docs/skills/frozen-ui-locked-rules-audit.md` (money is never colour-coded;
   failure screens are dark, not red; the success takeover is calm — no
   celebration). Use the existing card, button, and input components.
6. Give Claude Code concrete tasks: per route, update the component to match the
   wireframe layout + copy and confirm the API wiring; add/extend Vitest for the
   phone gate and the merchant redeem screens (assert the collect line renders and
   is omitted for null/0/negative, and that the phone gate blocks claim but not
   browse); update the Playwright golden path only if a layout change alters an
   important flow.
7. End by asking Claude Code to report: files changed/added; a one-line
   screen↔wireframe mapping for each; and the commands to run the dev server and
   tests (`npm run dev`, `npm test`) to see the UI.

## Constraints for both parts
- Wireframe/spec level for Part 1 (copy, labels, states, annotations) — not a
  visual redesign.
- Never introduce an in-app shopper payment flow.
- Treat the repo as the source of truth for routes, components, and API shapes;
  if a wireframe implies a route that doesn't exist, map it to the real one above
  rather than inventing a new path.
```

---

## Sources (repo state on `main`, 2026-07-24)
- Routes: `src/app/(shopper)/feed/page.tsx`, `(shopper)/deals/page.tsx`
  (redirect→`/feed`), `(shopper)/deals/[id]/page.tsx` + `claim-flow.tsx`,
  `verify-phone/page.tsx`, `merchant/(app)/redeem/page.tsx` + `redeem-keypad.tsx`,
  `components/ui/redemption-result.tsx`, `(public)/page.tsx` (landing).
- Collect amount: `api/redemptions/preflight/route.ts` + `…/verify/route.ts`
  (`collectAmount` from `amount_kes`).
- Phone gate: `src/lib/auth.ts` (`currentUserHasVerifiedPhone`),
  `api/redemptions/route.ts` (`phone_required`), `claim-flow.tsx`.
- Brand/UI: `maanta-app/tailwind.config.ts`, `docs/skills/frozen-ui-*`.
