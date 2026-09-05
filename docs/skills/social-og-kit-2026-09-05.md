# The social & OG image kit — design board 4 of 4 (2026-09-05)

**Status:** built. **Authorisation:** the founder asked for it directly; the
board itself was never exported (register D273), so this is built from the
brief in `chats/chat1.md` and the founder's answer there — "spec sheet with
rendered examples".

## Shape

- **`lib/marketing/social-kit.tsx`** is the registry and the renderers. Ten
  assets; each declares id, platform, size, safe area (with *why*), use, notes,
  and a `render(ctx)` that returns a `next/og` `ImageResponse`.
- **`/api/brand-kit/<id>[?deal=n]`** (edge) renders one. Public: brand assets
  are the same class as the per-route OG cards, and the founder needs to hand
  a link to whoever uploads them. Unknown id → 404. The only parameter is a
  closed sample-deal index.
- **`/admin/growth/content/kit`** is the spec sheet: every asset rendered live
  with its dimensions, safe area and notes, plus the per-route OG list. Linked
  from the Content & SEO screen.
- **`docs/brand/social-kit.md`** is the durable table.

## Rules (inherited from `og.tsx`)

Typographic, no photographs. Sample deals only, disclosed on the image.
`NODE_STATUS_LINE` at every foot. Colours as literals (edge runtime). Amber on
the badge and the one action; prices ink. No free text from the URL.

## Verified, and not

`tsc` clean · `next lint` clean · suite green · `next build` green. **Not
rendered**: no image in this kit has been opened in a browser or checked pixel
by pixel; the edge runtime's `<img>` loading of the lockup PNGs from the request
origin is the same mechanism the existing OG cards rely on, but it has not been
exercised here. First thing to do on a preview deploy: open the kit page.

## Readiness sweep and the one defect (later the same day)

The founder ordered a readiness sweep of all ten assets against ten checks
(dimensions, safe areas, identity, legibility, proposition, claims, no fake
participation, CTA compatible with collection CLOSED, reusability, Canva
suitability). Result: 1 READY, 4 READY WITH PLATFORM TEST, 5 BLOCKED, 0
missing. Four blocks are governance, not artwork — the waitlist cards send
people to a closed gate, the deal templates have no genuine deal behind them.

The fifth was a defect (register D275): the **LinkedIn company cover clipped
its headline** at 1128×191. `coverDark` set the proposition as one unwrapped
26px line; after the safe-area inset, the lockup and the gap, about 460px
remained. The fix derives the text column's width from the frame and lets the
headline wrap; a source guard in `social-kit.test.ts` pins both. Verified by a
local render: two lines, nothing clipped, right of the logo zone.

Two identity notes from the sweep, recorded but not acted on: the OG template
draws an amber square rather than the mark and prints "MAANTA" twice (shared
with the 13 route cards; a founder decision), and the renders use the image
runtime's default sans rather than the site's DM Sans (Canva masters set in DM
Sans will match the site more closely than the kit).

