# Contract corrections — audit record (drift D-13)

The mirror was authored in Claude Design and verified manually against `main` on
2026-07-29. Landing it in the repo meant re-reading every frame against the
working tree. Where a frame and the code disagreed, **the code won** (truth
order: Notion → repo → design system) and the frame was corrected.

This file is the reviewable record of every correction: what the contract
claimed, what the repo actually does, and the file that proves it. Layer 1
(`src/lib/design-truth/design-truth.contract.test.ts`) asserts that every frame
id named here exists in `frames.json`, so this table cannot rot into naming
frames that no longer exist.

**Nothing in this table changed app behaviour.** The app changes made in the same
commit are listed separately at the bottom, under *App changes*, and they are
changes that made a declared state or rule real — not changes made to satisfy the
contract.

## Corrections

| Frame | Category | Contract claimed | Repo truth | Proof |
|---|---|---|---|---|
| `8l` | route | `/tickets` | `/my-deals` — `/tickets` serves only `[id]`, there is no index page | `src/app/(shopper)/my-deals/page.tsx` exists; no `src/app/(shopper)/tickets/page.tsx` |
| `8l` | sourceFile | `src/app/(shopper)/tickets/page.tsx` | `src/app/(shopper)/my-deals/page.tsx` | file does not exist / does exist |
| `12a` | sourceFile | `src/app/page.tsx` | `src/app/(public)/page.tsx` — the `(public)` route group was omitted | `src/app/(public)/page.tsx` |
| `12e` | sourceFile | `src/app/pricing/page.tsx` | `src/app/(public)/pricing/page.tsx` — same omission | `src/app/(public)/pricing/page.tsx` |
| `13f` | anchor | heading `Verify your phone` | `Add your phone to claim` (Clerk path) / `Phone verification` (Supabase path) | `src/app/verify-phone/page.tsx` |
| `8f` | anchor | heading `Flash deals` | section heading `Top picks near you`, with "Flash deals — grab them while they last" as its subtitle | `src/app/(shopper)/feed/page.tsx` |
| `8j` | anchor | text `Show this code` | `Show this screen at the counter.` | `src/app/(shopper)/tickets/[id]/page.tsx` |
| `13j` | anchor | text `You can't verify codes` | `You don't have permission to verify codes.` | `src/app/merchant/(app)/redeem/redeem-keypad.tsx` |
| `13e` | anchor | text `Release hold` | `Held for review` is the stable panel label; the button reads `Release & charge fee` | `src/app/admin/redemptions/[id]/page.tsx`, `release-actions.tsx` |
| `13b` | primaryAction | `Send onboarding link` | No such action exists — no route, no send path, no lead→merchant attribution wiring. Now records the shipped action, `Link the shop this lead became`. Intent preserved in **D-14**. | `src/app/agent/leads/[id]/link-merchant.tsx`; `src/app/merchant/onboard/page.tsx` takes no lead param |
| `13f` | state | `verified`, `blocked-at-claim` missing | Both ship: `stage === "done"` renders "Phone verified"; the claim gate redirects on `phone_required` | `verify-phone/page.tsx`; `deals/[id]/claim-flow.tsx` |
| `8f` | state | `empty`, `loading`, `offline` missing | All three ship: `EmptyState`, segment `loading.tsx`, `OfflineBanner` in the shopper layout | `feed/page.tsx`, `(shopper)/loading.tsx`, `(shopper)/layout.tsx` |
| `8g` | state | `expired` missing | Ships as the disabled "Deal ended" sticky bar when `!claimable` | `deals/[id]/page.tsx` |
| `8l` | state | `empty` missing | Ships via `EmptyState` | `my-deals/page.tsx` |
| `13k` | state | `empty` missing | Ships: "No alerts / Wallet and deal alerts show up here" | `merchant/(app)/alerts/page.tsx` |
| `10b` | state | `empty` missing | Ships via `EmptyState` | `merchant/(app)/deals/page.tsx` |
| `13a` | state | `empty` missing | Ships: "No leads yet — lock your first one" | `agent/page.tsx` |
| `11a` | state | `empty` missing | Ships: "No shops waiting for approval" | `admin/page.tsx` |
| `11e` | state | `open`, `resolved` both missing | Both ship as the two views of the support queue | `admin/support/page.tsx` |
| `12e` | state | `standard`, `elite` both missing | Both ship as the two pricing cards | `(public)/pricing/page.tsx` |
| `13e` | state | `released`, `hard-block-appeal`, `fee-reversed` missing | All three ship: release panel, "Declined by Guardian — appeal" panel, and the reversal branch | `admin/redemptions/[id]/page.tsx`, `appeal-actions.tsx`, `reverse-fee-action.tsx` |
| `13b` | state | `new`, `contacted`, `converted`, `lost` missing | `StatusChip` renders any lead status generically, and the converted branch has its own panel | `agent/leads/[id]/page.tsx`; `components/ui/chips.tsx` |
| `R-VERIFY-ANYWAY` | provenance | "One is wrong" between the frames and the claim-and-till mirror | Both behaviours ship, at different geofence bands. See **D-07** — the surviving defect is the preflight 150 m vs Guardian 250 m split, not the outcome. | `supabase/migrations/20260721140000_guardian_v1.sql`, `20260722140000_guardian_thresholds_config.sql`, `api/redemptions/preflight/route.ts` |
| `mirror` | provenance | Mirror lives outside the repo (D-08) | Committed here; Layer 1 validates it on every PR | `src/lib/design-truth/`, `.github/workflows/ci.yml` |
| `D-01` | provenance | "Repo renders All Active Deals" | Repo renders **Deals near me**, which is what the frames wanted. Stale claim; drift reclassified `historical`. | `feed/page.tsx` |

## Deliberately left uncorrected

| Frame | Why |
|---|---|
| `M8` | Recorded `design-ahead` because "the repo create flow has no charge-disclosure step". It **does** — `new-deal-wizard.tsx` ships the mandatory M9 step (decisions log 2026-07-18). Flipping it to `live` moves `status`, `evidenceSource`, `prototypeStatus` and a drift row together, which is a founder ruling, not a cleanup. Tracked in D-13. |
| `11a` `rejected` | `merchants.status` is CHECK-constrained to `pending / active / suspended / churned`. Needs a migration and a ruling on what "rejected" means. Tracked in **D-15**. |
| `12a` `launch-block` | No product concept behind it. `launch-auth.ts` is the sign-up *mix* flag, not a landing gate. |
| `12e` `comparison` | Blocked on unresolved launch-offer copy — the frame's own `captureReadinessReason`. |

## App changes made in the same commit

These are not contract corrections. Each made a state or rule the contract
declares actually render, and each is listed here so a reviewer can tell the two
kinds of change apart.

| Frame | Rule | Change |
|---|---|---|
| `8j` | `R-GRACE` | Frozen validity sentence, plus a real grace-period state (deal ended, code still honourable) on the card and as a persistent alert |
| `13g` | `R-FEED-ORDER` | `nothing-nearby` split from "your filters excluded everything" |
| `10a` | `R-RESOLVE-THEN-CHARGE` | `sr-only` `<h1>Redeem</h1>` — the till had no page heading at all |
| `13j` | `R-VERIFY-PERMISSION` | Gate now names the owner and offers a `tel:` contact instead of dead-ending |
| `13i` | `R-STRIPE-PHASE-1` | Pending is no longer rendered as credited; card is the primary rail; errors are a persistent inline alert |
| `13b` | `R-AGENT-NO-SUBMIT` | `Lead details` heading; the rule stated on screen |
| `12a` | `R-TAGLINE` | The exact frozen tagline, which the tagline frame did not carry |
| `12e` | `R-PLAN-NAMES` | Standard's price was "Free", which the rule forbids |
