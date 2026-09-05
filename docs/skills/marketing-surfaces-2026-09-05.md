# The marketing surfaces — design board 1 of 4 (2026-09-05)

**Status:** built. **Authorisation:** the founder chose board 2 first, then asked
for board 1, and ruled on the two questions the board itself asks before code
was written. Node 0 Field Validation Mode freezes speculative engineering; a
board the founder exported and ruled on is specifically authorised work.

Read this before touching `/`, `/shoppers`, `/merchants`, the header CTA, or
anything under `src/components/marketing/acquisition.tsx`.

## The two rulings

| The board asks | The prior decision | Ruling |
|---|---|---|
| Header CTA becomes "Join the waitlist" | D259 (2026-09-03): "Browse deals" is the bar's one amber | **Join the waitlist while `DEMO_MODE` holds.** Gated, so launch flips it back with every other trading claim. Footer's feed link gated the same way |
| The pages are redrawn without the feed mockup, the walkthrough rails and the inline form | HeroShot (2026-08-01), walkthroughs (2026-08-16), early-access form | **As drawn; retire the old sections.** Deleted with their guards, not hidden. One canonical design per page |

## What the three pages are now

- **Home.** Node pill · H1 "Mall deals you claim on your phone and redeem at the
  counter." · one amber button → `/waitlist` · "See how it works →" text link ·
  the code example card. Then the three doors (tracked as audience doors), the
  four-step loop, the Node 0 block with the staffing tiles and their footnote,
  the honest status block on ink (`SHOW_PRELAUNCH_STATUS_BLOCK`), and the
  closing band.
- **/shoppers.** Hero with the four chips and the example deal card (desktop);
  `#how-it-works` with the code tiles under "Claim the deal"; "What a deal looks
  like" with the disclosed card; Where it opens; the four FAQs; closing band →
  `/waitlist?role=shopper`. A sticky bar on mobile repeats the action only after
  the hero has scrolled out, so amber is never on screen twice.
- **/merchants.** Economics up front: the fee on ink, the plan limits, the boost
  price with its Elite qualifier, "Pricing coming soon". The opening offer,
  gated on `isOfferLive`, with the cap, the node and the fee caveat in one
  sentence. "Three things, all from a phone" with the permission chips. Reply
  times. "What we are not telling you." Closing band → `/merchants/join`.

## Rules that shaped the copy

- **Every number from `facts.ts`.** Fee, boost, plan limits, offer amounts,
  dates, staffing model, reply times. The board's literals were replaced one by
  one; `pricing-copy`, `marketing-shell` and `held-claims` all still pass.
- **Nothing invented, and what is invented says so.** The code tiles render
  `SAMPLE_CODE`; the deal card renders `SAMPLE_DEALS[0]`; both carry a visible
  disclosure and an `sr-only` sentence. No counts, ratings, testimonials or
  partners anywhere on the three pages — guarded.
- **The staffing tiles are a model.** The footnote "It is not a count of people
  standing in BBS Mall today" is not optional; two numerals beside a mall's
  name read as a headcount without it.
- **One amber fill per page**, and it is that page's own action. The merchant
  page's KES 30 callout is ink, not amber tint. The permission chips, the
  numbering and the selection states are ink.
- **"Free" never stands alone as a price.** The shopper chip is "Free for
  shoppers"; "30 days of Elite, free" sits inside a sentence that also states
  the cap, the node and the success-fee caveat.

## What was retired, and where its guards went

`HeroShot.tsx`, `ShopperWalkthrough.tsx`, `MerchantWalkthrough.tsx` and
`landing-early-access.tsx` are deleted. `marketing-hero-shot.test.ts` keeps the
`/help` panels guard and the grace-period sweep and drops the three describes
about deleted files. D50 is repointed at the surviving disclosed illustrations.
`marketing-surfaces.test.ts` pins the header target per flag, one amber per
page, the disclosures, the status-block gate, the four files staying absent,
and how-it-works staying a deep link.

## Departures from the board, on purpose

- The merchant page's header CTA is the site-wide "Join the waitlist", not a
  page-specific "Register your shop": one header, one rule.
- "You can leave with one reply" (an SMS idiom) reads "every message has an
  unsubscribe link", because the channel is email until D269 is ruled.
- The KES 30 callout on the merchant page is not amber tint.
- The shopper FAQ's "so we can send your code" reads "so a code can be tied to
  one person and used once" — the code appears on screen; nothing is sent.

## Verified, and not

`tsc` clean · `next lint` clean · full suite green · `next build` green with
`check:tokens`, `check:canonicals` (15 routes), `check:forms`.

Not verified: no browser proof of any of the three pages at 390 or 1280 — the
grids, the sticky bar's appearance timing and the hero's two-column collapse are
reasoned from the board, not observed. Same posture as boards 2 and 3.
