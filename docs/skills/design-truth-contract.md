# Skills: the design-truth contract

Last updated: 2026-07-29 · Status: **landed and validated in CI.**

The audited current-reality frames now live in the repo at
`maanta-app/design/current-reality/`, and `maanta-app/src/lib/design-truth/`
validates them on every PR. This file is the handoff for anyone touching either.

## What the contract is

`design/current-reality/frames.json` — 21 audited frames, each with `route`,
`role`, `status`, `job`, `primaryAction`, `runtimeRule`, `states`,
`stateCoverage`, `prototypeStatus`, `prototypeRef`, `captureReadiness`,
`evidenceSource`, `sourceFiles`. A `runtimeRules` map holds the business rules by
id; a frame **references** a rule and never restates it, so the rule text has one
home.

It was **authored in Claude Design, not extracted from the repo** — the schema
enforces that the `provenance` string says so. It is a dated, manual audit, and
it will rot. That is what Layer 1 is for.

**Truth order is fixed:** Notion (product / current state) → repo
(implementation) → design system (visual, may describe an ideal ahead of what
shipped). When a frame and the code disagree, the code wins and the frame gets
corrected — not the other way round.

## The three layers

| Layer | Where | Runs |
|---|---|---|
| 1 — static contract | `src/lib/design-truth/` (19 vitest assertions) | every PR, `ci.yml`, before the main suite |
| 2 — behavioural smoke | `e2e/design-truth-smoke.spec.ts` (one test per `smoke: true` frame) | opt-in job in `e2e.yml`, gated on `E2E_DESIGN_TRUTH` |
| 3 — process | `npm run test:design-truth{,:smoke,:all}` | — |

Layer 1 is pure (filesystem only, no network/db/browser). The assertion that
earns its keep: **every `route` resolves to a real page under `src/app`**, with
route groups dropped and `[id]` matched positionally. That is what catches a
stale route, which is the failure mode where a frame points at `/tickets` for a
year after the route became `/my-deals` and every reviewer trusts it.

Layer 2 is generated from the contract and never re-declares a route. Layer 1
asserts that it still is — including a check that fails if a route literal is
hardcoded in the spec, because that is the only way the two could disagree while
both stayed green.

## Rules to keep

- **Change a screen → update its frame in the same commit.** If a frame's
  `route`, `primaryAction`, `states` or `runtimeRule` no longer matches what
  shipped, the contract is lying. Layer 1 catches routes and files; it cannot
  catch a stale `primaryAction`.
- **Never soften a rule to make a test pass.** If the app cannot honour a
  `runtimeRule`, that is a finding, not a reason to reword the rule.
- **`design-ahead` frames are not smoke-tested** — smoke asserts shipped
  behaviour. The schema refuses the combination.
- **Founder and admin frames are `internal-only`** by schema rule. Never
  screenshot an ops surface for marketing.
- **A missing test role fails loudly** (`missing test role: agent`). A smoke run
  that quietly covers 9 of 14 frames is worse than none, because the green tick
  reads as coverage. The one legitimate skip is "nothing configured at all".

## What landing it changed in the app

The mirror was re-read against the working tree rather than copied. The repo won
every disagreement; the frames were corrected (drift **D-13**). Nine app changes
were needed to make declared states and rules real:

| Frame | Change |
|---|---|
| 8j claimed code | Frozen validity sentence ("Valid until the deal expires, plus a 15-minute grace period.") plus a real **grace-period** state — the card and a persistent rust alert both say the deal has ended and the code still works. Was: a bare mm:ss and a wall-clock time. |
| 13g browse | **nothing-nearby** as its own empty state, distinct from "your filters excluded everything" — no filter change fixes an empty mall, so the copy must not send the shopper back to the filters. |
| 10a redeem | An `sr-only` `<h1>Redeem</h1>`. The till had no page heading at all, so a screen reader (and the contract anchor) had nothing to bind to. |
| 13j staff gate | The gate now names **who can fix it**: shop name, a `tel:` "Contact the owner" action, and the masked shop number. Was a dead end at the counter with a customer waiting. |
| 13i top-up | **Pending is no longer rendered as credited** — see below. Card is the primary action; errors are a persistent `InlineAlert`. |
| 13b agent lead | A `Lead details` heading (the rows were unlabelled), and R-AGENT-NO-SUBMIT stated on the screen: the owner submits onboarding themselves. |
| 12a landing | The frozen tagline **Discover, Claim and Redeem.** — R-TAGLINE's own frame did not carry it; it only existed on `/onboarding`. |
| 12e pricing | Standard's price was **"Free"**, which R-PLAN-NAMES forbids — the plans are Standard and Elite, and naming one "Free" hides the success fee. Now `KES 0` / "per month · pay only when a redemption is verified". |

### The top-up fix is a money-trust fix, not a copy fix

Returning from Stripe Checkout with `?stripe=success` used to render a green tick
and "Top-up received" with `added: 0`. The shopper had paid; the **wallet had
not been credited** — that happens when the webhook lands. A success tick against
an unsettled top-up is exactly the class of lie the money rules exist to prevent.

Now: a return renders **`waiting-card`** (its own screen, so a merchant who has
already paid is not dropped back on a form that invites paying twice), polls the
wallet, and only promotes to **`credited`** when the balance actually rises. If it
does not settle inside the wait window it becomes **`unsettled`** — "Top-up still
pending", never "not completed", because a card payment that already went through
Checkout says nothing about failure by timing out. An STK push that times out
*is* a non-payment, so that one still reads as failed.

## Open decisions this work did not make

- **D-07 verify-anyway — the one to resolve first.** `design/claim-and-till/README.md`
  documents verify-anyway (a location mismatch still redeems, the dispute routes
  to admin review). The frames show wrong-shop as a hard rejection with no fee.
  **The shipped code implements verify-anyway** — `redeem-keypad.tsx` shows a rust
  "Claimed away from your shop" warning, leaves Confirm enabled, and records an
  override reason; `frozen-ui-overall-handoff.md` states the same. So the frames
  are the side that disagrees with production. Neither branch was touched. A
  smoke test written against the wrong branch would cement the error.
- **M8 create-deal (in D-13).** The frame is recorded `design-ahead` because "the
  repo create flow has no charge-disclosure step" — but `new-deal-wizard.tsx`
  ships a mandatory charge-disclosure step (the `price` step; decisions-log
  2026-07-18). Either M8 is `live` or the frame describes something else. Not
  flipped unilaterally: `evidenceSource` and the drift row move together.
- **D-06 payment order.** Card is primary on `/merchant/topup` because Stripe is
  the only rail that completes while IntaSend credentials are outstanding.
  `TODO(D-06)` in `topup-flow.tsx` marks the reorder to M-Pesa-primary.
- **D-14 agent onboarding link.** Frame 13b recorded a "Send onboarding link"
  primary action with nothing behind it — no route, no send path, no lead→merchant
  attribution wiring. Not built; it needs an attribution decision.
- **D-15 admin rejected state.** Frame 11a declares a `rejected` state, but
  `merchants.status` is CHECK-constrained to `pending / active / suspended /
  churned`. Showing it needs a migration and a ruling on what "rejected" means,
  so the state is left uncovered rather than faked against `suspended`.
- **12a `launch-block` and 12e `comparison`** stay uncovered — one has no product
  concept behind it, the other is blocked on unresolved launch-offer copy.

## Palette note

The prompt that drove this work specified paper `#F5F2EB`, grey `#737373`,
borders `#E2E2E2` and flash red `#E8431F`. The repo ships **Frozen UI (Pass 2)**
tokens: paper `#FAFAF8`, secondary `#3D3D3D` / muted `#5C5C5C`, line `#E5E2DA`,
error `flame #8C1D18`, warning `rust #9A4A0C`. Those are a decisions-logged,
contrast-tuned palette with a static ratchet (`frozen-ui-rules.test.ts`) behind
them, and `#E8431F` on paper does not clear the contrast floor the same prompt
demands for money. Truth order puts repo implementation above the design system
on visuals, so **no hex was swapped**. Gold `#FDBF2D`, ink `#111111`, ink-900
`#141414`, success `#0A5C34`, the radii and the ≤1-gold-action rule already match.

## Handoff checklist for the next session

1. Read this file, `design/current-reality/README.md`, and
   `docs/skills/frozen-ui-overall-handoff.md`.
2. Changing a screen? Update its frame in the same commit and run
   `npm run test:design-truth`.
3. Adding a frame? The schema will refuse it unless the anti-fake-sync rules are
   satisfied — that is the point, not an obstacle.
4. Resolving D-07, M8, D-14 or D-15? Add a `maanta-decisions-log.md` entry first,
   then close the drift row in the same commit as the code.
