# S1/S2/S3/M3/M4 screen alignment to wireframes — 2026-07-24

> **Design truth:** for *current-state* screens, routes and runtime rules the
> canonical source is `maanta-app/design/current-reality/` (see
> `docs/design-truth-protocol.md`). This document is a dated handoff — treat it
> as provenance and design intent, not as current-state authority.

**Mode:** Builder · **Branch:** `claude/maanta-wireframes-prompt-nc7h4c`.
Aligned the shipped shopper + merchant screens to the organized wireframes.
UI/copy only — no money-path RPC, fee, wallet, or API-shape change. Checks:
typecheck ✅, lint ✅, `npm test` ✅ 138/25, `npm run build` ✅ (with a Clerk key).

## Screen ↔ wireframe mapping + what changed

| Screen | Route → file | Change |
|---|---|---|
| S1 deals feed | `/feed` → `src/app/(shopper)/feed/page.tsx` | Empty-state copy → "No deals live right now" / "Merchants drop new deals through the day." Rails already ship in the Flash · Boosted · Deals-Near-Me order. |
| S2 phone-at-claim | `/verify-phone` → `src/app/verify-phone/page.tsx` | Heading → "Add your phone to claim"; error copy → "Couldn't send the code. Check the number and try again." / "Code didn't match. Check the SMS and try again."; added a 30s **Resend code** cooldown. |
| S3 detail + claim | `/deals/[id]` → `page.tsx` + `claim-flow.tsx`; ticket at `/tickets/[id]` (`claimed-code.tsx`) | Already matches: "YOU PAY" (uppercased via CSS) as the largest value, itemised breakdown only here, validity + claims-left + verified count, sticky Claim + Cancel, Navigate on the ticket, breathing amber code card. No change needed. |
| M3 redeem disclosure | `/merchant/redeem` → `page.tsx` + `redeem-keypad.tsx` | Resolved eyebrow → a **"Code valid"** chip (ink + verified check, not amber); footer text → **"Cancel — charges nothing"**. Collect block + fee/wallet block already present and distinct; Confirm still never disabled by wallet (verify-anyway). |
| M4 success | takeover state in `redeem-keypad.tsx` → `src/components/ui/redemption-result.tsx` (M5 dark failure = same component) | Header → **"Redeemed"**; collect box gains subtext **"Cash, collected in person — not an in-app charge"**; added optional deal-title + verify-time line (deal title from the verify response; time client-side). Calm, zero amber preserved. |

## Invariants held
- Shoppers never pay in-app — no payment/checkout UI or endpoint added; only
  merchant top-ups exist.
- "Collect from shopper KES N" renders on M3 and M4 from the `amount_kes` →
  `collectAmount` snapshot, distinct from the KES 30 fee and wallet, omitted for
  null/0/negative.
- Phone-at-claim: unchanged gate (`currentUserHasVerifiedPhone` + `phone_required`
  403 + `claim-flow` → `/verify-phone`); blocks claiming only, never browsing.
- Two-step redeem + verify-anyway unchanged; no "paused until cleared" copy.

## Lockstep + deferrals
- Renaming M4 "Verified" → "Redeemed" also updated the assertion in
  `e2e/golden-path.spec.ts` (was `getByText("Verified")`).
- **Kept the shipped shopper TabBar** (Feed · Search · Deals · You) rather than
  reducing it to the wireframe's two-tab sketch — the shipped bar already honours
  "amber active bar is the only amber". Repo is source of truth over the sketch.
- **Deferred (need a new data surface, out of this UI-only scope):** masked
  shopper phone on M3/M4 and a server timestamp — `preflight`/`verify` don't
  return shopper PII; M4 uses the deal title it does return plus a client time.
  A persistent wallet-in-header with chevron on M3 (wallet is shown in the tablet
  aside + inline low-balance alerts today) is a layout change left for a
  dedicated pass.

## Tests
- `src/components/ui/__tests__/redemption-result.test.ts` — added: "Redeemed"
  header, cash subtext present, subtext omitted with no collect amount (kept the
  collect-omit-for-null/0/negative cases).
- `src/components/ui/__tests__/fee-disclosure.test.ts` — new: funded wallet shows
  balance-after; short wallet discloses arrears + "settled from your next top-up"
  and never a paused/blocked gate; money never brand-coloured.
- Phone gate both-sides already covered by
  `src/app/api/redemptions/__tests__/route.test.ts` (blocks phone-less, passes
  verified-phone).

## Run it
From `maanta-app/`: `npm run dev` (needs Clerk + Supabase env), `npm test`.
A production build needs `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set (CI uses a dummy
key; without it, static prerender of Clerk pages fails — an env gap, not a code
defect).

---

## Follow-up UX refinements — 2026-07-24 (second pass)

A focused second pass on loading/empty/error/success states. UI + one read-path
helper only — no money-path, fee, Guardian, or API-shape change. All on the
feature branch (repo), not a claim about prod being hardened.

**S1 `/feed`**
- `getLiveDeals` (`src/lib/data.ts`) now **throws on a hard query error** instead
  of swallowing it into an empty result — so a transient DB failure is no longer
  indistinguishable from "no deals".
- New **error boundary** `src/app/(shopper)/feed/error.tsx` renders the retryable
  copy **"We couldn't load deals — try again in a moment."** (via the shared
  `ErrorState`), with a Retry action. No status codes / provider names leak.
- Loading skeleton (`feed/loading.tsx`) already existed; the empty state now
  shows **only** on a genuine zero-deal result.

**S2 `/verify-phone`**
- Added a brief **success state** ("Phone verified — you can now claim deals.
  Taking you back…") shown for **1.2s** before redirecting back to the deal.
  *(1.2s is a chosen default — flag if a different dwell is wanted.)*
- Resend cooldown already disables the control and counts down
  ("Resend code in Ns"); send-vs-verify error strings remain distinct.

**M3 `/merchant/redeem`** — verified already-correct, locked with tests (no code
change): preflight `checking` loading state, dark `rejected` error state distinct
from the "Code valid" chip, and `reset()` restoring a calm keypad on
"Cancel — charges nothing" (no lingering "Code valid").

**M4 takeover** — rapid successive redemptions are safe: `reset()` clears the
code + `submitting` ref and `router.refresh()`es before a new resolve; the 3s
auto-reset is unchanged.

**Tests added**
- `src/lib/__tests__/get-live-deals.test.ts` — throws on error vs empty-on-zero
  vs correct flash/boosted/nearMe partition.
- `src/app/(shopper)/feed/__tests__/feed-error.test.ts` — error copy + Retry, no
  technical leakage, not the empty copy.
- `src/__tests__/cash-only-and-copy.test.ts` — **cash-only guardrail** scanning
  every shopper + merchant-redeem screen for payment-UI phrasing
  (checkout / add card / pay now / card number …), plus copy locks for the feed
  empty + error states, verify-phone heading/success/resend, and the M3
  calm-cancel / code-valid strings.

**Checks:** typecheck ✅, lint ✅, `npm test` ✅ **158/28**, `npm run build` ✅
(with a dummy Clerk key).

---

## Merge readiness + pre-rehearsal FE backlog — 2026-07-24 (third pass)

**Branch vs main:** `claude/maanta-wireframes-prompt-nc7h4c` sits directly on top
of `origin/main` — its merge-base **is** `origin/main` (`2dfdd4f`, which already
includes #70 and #71), 6 ahead / 0 behind. So it's a clean fast-forward merge:
**no rebase and no conflicts** to resolve (main has not advanced past the base).
Re-verified green after the check: typecheck, lint, 158 vitest, build (dummy key,
81/81 pages).

**Remaining front-end items to weigh before the BBS rehearsal** (NOT implemented —
some carry product-decision boundaries; listed for a ruling):

| # | Screen/route | Item | Type |
|---|---|---|---|
| 1 | M3 `/merchant/redeem` disclosure + M4 takeover | Show a **masked shopper phone** next to the resolved code (spec sketched "code + masked shopper phone"). Needs `preflight`/`verify` to return a masked number, and a masking-format ruling (e.g. `+2547•• ••• 123` vs last-4). | **needs API** + decision |
| 2 | M3 `/merchant/redeem` | **Persistent wallet balance in the header with a chevron** to `/merchant/wallet`. Today wallet shows in the tablet-only right aside + inline low-balance alerts. | **UI-only** (layout) |
| 3 | M4 takeover | Use a **server-issued timestamp** instead of the client clock on the "Redeemed" line (audit-accurate). | **needs API** (small `verify` field) |
| 4 | S2 `/verify-phone` | Optional **6-box segmented OTP input** to match the wireframe sketch (today a single numeric field; fully functional with Clerk). | **UI-only** (cosmetic) |

No shopper-payment UI exists anywhere on S1–S3/M3–M4 (cash-only guardrail test
green). Shopper↔merchant money language is intentionally distinct and consistent:
shopper "You pay" (cash they hand over) vs merchant "Collect from shopper"
(display-only) + the KES 30 success fee + wallet balance as three separate lines.

Repo→prod boundary unchanged: everything above is repo state on the branch; it
asserts nothing about prod env being hardened.

---

## Backlog implemented — 2026-07-24 (fourth pass)

All four pre-rehearsal items are now built. UI + two read-only route fields only;
no fee/Node 0/Guardian/arrears/wallet-logic change.

- **Masked shopper phone (M3 + M4).** New `src/lib/phone-mask.ts` `maskPhone()`
  derives a masked string **server-side** from `users.phone` (looked up by
  `redemptions.user_id`); the full number never reaches the client. Format
  (Kenya default): `+254 7xx xxx 678` (country code + first national digit +
  last 3). `preflight` and `verify` routes now return `maskedPhone` (null when
  the shopper has no stored phone). Rendered as a calm muted line: M3 "Shopper
  phone …" under the deal title, M4 "Shopper phone …" in the metadata. Omitted
  when null. Tests: `src/lib/__tests__/phone-mask.test.ts` + route tests assert
  the masked value and that the raw number is never in the payload.
- **Server verify timestamp (M4).** `verify` returns `verifiedAt` (server UTC
  ISO — the verify-confirmation instant, distinct from claim-time
  `redeemed_at`). `redeem-keypad` formats it to the device-local time (EAT at the
  counter) and `RedemptionResult` shows "Redeemed at 5:32 PM". Falls back to the
  client clock only if the field is absent. Route test asserts a valid ISO
  `verifiedAt`.
- **Wallet header + chevron (M3).** New presentational `src/components/ui/
  wallet-header.tsx` shows "Wallet KES N" in ink + a chevron linking to the
  existing `/merchant/wallet` — read-only affordance, **no new top-up/withdraw
  flow**. Shown at the top of the redeem keypad on phone (`lg:hidden`; the tablet
  layout already shows the balance in its right pane). Test:
  `wallet-header.test.ts`.
- **Segmented 6-box OTP (S2).** New `src/components/ui/otp-input.tsx` — a
  controlled 6-box input over the same OTP string the verify flow already
  submits (auto-advance, backspace, paste, arrow keys). Digit maths are exported
  pure helpers (`sanitizeOtp` / `replaceOtpCharAt` / `removeOtpCharAt`) and
  unit-tested. `/verify-phone` now renders it instead of the single field; the
  verify endpoint is unchanged.

**Cash-only guardrail** extended to scan the two new UI files; no payment-UI
phrasing anywhere. **Checks:** typecheck ✅, lint ✅, `npm test` ✅ **180/31**,
`npm run build` ✅ (dummy Clerk key, 81/81 pages). Still repo-only — no prod
assertion.

### Masking-format note (decision recorded, not blocking)
The Kenya default `+254 7xx xxx 678` reveals only country code + one leading
digit + last 3. If a different reveal is wanted (e.g. last-4, or masking the
country code), it's a one-line change in `maskPhone` — flag it.
