# S1/S2/S3/M3/M4 screen alignment to wireframes — 2026-07-24

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
