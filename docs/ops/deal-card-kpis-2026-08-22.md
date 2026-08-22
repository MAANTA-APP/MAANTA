# Deal card decision KPIs (2026-08-22)

**Status:** shipped. **Trigger:** founder, from a `/search` screenshot — "the
deal cards need to be longer and include KPIs to help the shopper identify if
they want to claim the deal."

## What was wrong

`/search` used `DealCardHorizontal`, the thinnest card in the app: image, tag,
truncated title, YOU PAY, verified count. Missing everything a shopper actually
decides on — **no was-price, no time left, no scarcity** — so "is this worth
walking to?" required a tap into the deal.

## What ships

A shared `DealKpis` row (`components/ui/claude/deal-kpis.tsx`) on the three tall
card variants (`lead`, `row`, `vertical`), in decision order:

| KPI | Renders when | Example |
|---|---|---|
| Discount | a compare-at price sits above YOU PAY | `40% off` |
| Scarcity | the merchant capped the deal | `12 left` / `Fully claimed` |
| Proof | a verified count is known | `7 verified` |

`/search` moves from the thin legacy card to the same `row` card the feed uses,
so it gains the was-price and the live countdown as well as the KPIs. The feed
now loads verified counts (one query over the shops actually on screen) so the
proof KPI is populated rather than silently absent.

**The 17.5rem `horizontal` rail card is deliberately excluded** — a KPI row
would crowd it, and a rail is for glancing, not deciding.

## Honesty rules, because a KPI is a claim

- Nothing is invented: each fact renders only when its input exists. A deal with
  none renders no row at all rather than a padded one.
- Discount is arithmetic over the same `lib/pricing` figures the card shows, so
  it can never disagree with YOU PAY.
- Scarcity counts **down** (`left`), because that is what decides a walk. Deal
  detail keeps the merchant-facing `claimed` framing; both derive from the same
  two numbers.
- `0 verified` is stated plainly rather than hidden — matching what the card
  already did before this change.
- Frozen rules hold: no coloured numbers, no amber, verified is icon + word so
  it survives greyscale.

Guard: `maanta-app/src/components/__tests__/deal-kpis.test.ts` — arithmetic,
rounding, every omission case, the colour ban, the variant count, and that the
thin card cannot return to `/search`.

## `0 verified` — asked and answered

At pilot start **every** shop has zero verified redemptions, so every card reads
`0 verified`. That was raised as possibly discouraging at exactly the moment the
pilot needs its first claims.

**Founder ruling 2026-08-22: it stays, for honesty and trust.** A shopper is not
told that a shop has a track record it has not earned yet, and the number
becomes meaningful precisely because it was never inflated. This is the same
principle the ranking rests on — a deal rises because someone actually walked in
— so hiding a zero would undercut the thing that makes the count worth showing
at all.

Do not "fix" this by hiding the zero, substituting a `New` badge, or omitting
the KPI for new shops. Any of those is a reversal of a ruling and needs a new
decisions-log entry.
