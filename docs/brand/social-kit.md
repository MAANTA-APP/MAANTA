# Social & OG image kit — spec sheet

**Date:** 2026-09-05 · **Source of truth:** `maanta-app/src/lib/marketing/social-kit.tsx` ·
**Rendered examples:** `/admin/growth/content/kit` (admin) · **Files:**
`/api/brand-kit/<id>` (PNG, generated on request; nothing is committed as an image)

Design board 4 was never exported from Claude Design — the handoff bundle ends at
board 3. This kit is built from the brief in the design chat ("reusable
specifications for Instagram/TikTok profile imagery, LinkedIn/Facebook covers,
YouTube channel art, OG cards and deal/social templates") and the founder's
answer there: a spec sheet with rendered examples.

## The assets

| id | For | Size | Safe area | Ground |
|---|---|---|---|---|
| `profile-square` | Every platform's profile image | 1080×1080 | middle 80% (circle crop) | amber, mark centred |
| `facebook-cover` | Facebook page cover | 820×312 | centre 640×312 (phone crop) | paper |
| `linkedin-company-cover` | LinkedIn company page | 1128×191 | right of x=380 (logo overlap) | ink |
| `linkedin-personal-cover` | Founder's LinkedIn profile | 1584×396 | right of x=420 (photo overlap) | paper |
| `youtube-channel-art` | YouTube banner | 2560×1440 | central 1546×423 (phone) | ink |
| `og-default` | Any shared link | 1200×630 | whole frame | paper |
| `deal-post` (`?deal=0..2`) | Instagram feed, Facebook, LinkedIn | 1080×1080 | whole frame | paper |
| `deal-story` (`?deal=0..2`) | Stories, TikTok, WhatsApp status | 1080×1920 | y 250–1670 (UI overlays) | paper |
| `waitlist-post` | Feed post | 1080×1080 | whole frame | ink |
| `waitlist-story` | Story | 1080×1920 | y 250–1670 | ink |

Sizes are the platforms' published values on 2026-09-05. **Check them before a
mass upload**; when they move, change the registry and every preview, download
and this table's source follow.

## Rules every card obeys

- **Typographic.** No photographs, no stock, no screenshots of demo data.
- **Nothing invented without saying so.** The deal templates draw
  `lib/marketing/sample-deals.ts` and print "Example — not a real offer" on the
  card, because a social image has no footer for a disclosure to follow it into.
- **No trading claim pre-launch.** Every card's foot is `NODE_STATUS_LINE`,
  which flips with `DEMO_MODE` alongside every other claim on the site.
- **Amber is the badge and the one action.** The profile image's ground and the
  waitlist card's address pill. Prices are ink; nothing else is amber.
- **No free text from the URL.** The only parameter is a closed sample-deal
  index. A brand-stamped image with attacker-chosen words is what an open
  `?headline=` would be.
- **The lockups are the supplied artwork** (`public/brand/`), loaded from the
  request's own origin. The profile image uses the supplied icon; its baked-in
  rounded corners vanish on the amber ground.

## What is deliberately not here

- No X/Twitter header — not in the brief; add a row to the registry if wanted.
- No per-post copy variants. Real deal posts will draw real deals once the feed
  is live; until then there is one card shape and three sample deals.
- No font embedding: the edge image runtime renders `sans-serif`, as the
  per-route OG cards already do. DM Sans would need the font files fetched at
  request time; a decision for when the kit is used at volume.
