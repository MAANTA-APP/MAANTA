# The Nairobi pilot repositioning (2026-09-05)

**Status:** implemented on branch `nairobi-pilot-truth`, not merged, not deployed.
**Authorisation:** founder direction of 2026-09-05, delivered as a standalone
engineering brief after the presence-asset readiness sweep.
**Register:** D276.

## What changed, in one sentence

The public website stops presenting BBS Mall as a secured launch location and
markets a truthful **Nairobi pilot whose location and date are not confirmed**,
with a preferred-location funnel that treats a visitor's answer as a preference
rather than as evidence of a mall relationship.

## The rule that governs every surface

BBS Mall in Eastleigh is **one potential location**. It may be named only with
that qualification, and no surface may imply a partnership, permission, desk,
staff presence, launch date or operating presence there. `pilot-status.ts` holds
the approved sentences; `live-claims.ts` resolves its pre-launch branches to
them, so a page cannot invent its own wording.

## Where the truth now lives

| Concern | Module |
|---|---|
| Pilot status, eyebrow, potential-location and demo disclosures, location list, booking action | `maanta-app/src/lib/marketing/pilot-status.ts` |
| Every sentence that says where MAANTA is or whether it trades | `maanta-app/src/lib/marketing/live-claims.ts` |
| The candidate mall, the planned offer, the staffing model | `maanta-app/src/lib/marketing/facts.ts` |
| Header, footer and crawl policy | `maanta-app/src/lib/marketing/nav.ts` |

`FACTS.launchMall` is **gone**, renamed `candidateMall`/`candidateMallProse`. The
rename is the point: a constant called "launch mall" is a claim, and every call
site had to be re-read rather than mechanically updated.

## What each audience is now asked to do

- **Shoppers** — explore demo deals, join the Nairobi waitlist.
- **Merchants** — explore demo deals, join the merchant waitlist, book a pilot conversation.
- **Mall operators** — discuss hosting a future pilot.
- **Everyone** — read that MAANTA is built but has not launched commercially.

The header carries all three actions: **Explore demo deals** (the one amber
element, into the real feed), **Join waitlist**, and **Sign in**, on desktop and
in the mobile sheet.

## The demonstration feed

"Explore demo deals" goes to `/feed`, the product's own feed, which serves
demonstration rows while `app_config.demo_mode_enabled` holds. Three things make
that honest, and all three are guarded:

1. `DemoFeedNotice` renders **above the first rail**, so the disclosure is on
   screen before any deal can be touched, and carries a link back to the site.
2. Every synthetic card carries a **"Demo"** badge — `is_demo` now travels with
   the deal row, because a screenshot of one card has no banner in it.
3. `/feed` stays disallowed to crawlers.

## The pilot-interest form

Minimum fields only: **email, audience, preferred shopping location, consent.**
No phone, no name, no interests — email is the one activated channel (D269) and
one message is the whole promise.

The location list is central (`PILOT_LOCATION_OPTIONS`), capped at ten, and the
**server validates against the same values**: an unlisted value is refused, never
defaulted. Before this change both endpoints tested only `mall === "other"` and
silently filed anything else as BBS Mall.

**"Other" as an audience is not offered.** `waitlist_signups.segment` is
constrained to shopper, merchant and mall_operator; a fourth value needs a
migration, which is separate founder authorisation. The form says so rather than
improvising.

## The form-safety gate

Collection stays **CLOSED** (D274). The gate's own rule already required it, and
the safety gate independently reached the same answer: storage and readers are
proven, but **no in-product deletion path exists** for either table, and the
privacy notice is a draft with a placeholder retention section. The closed panel
now states the true reason and offers demo access instead:

> Waitlist registration is temporarily unavailable while we verify the
> data-handling process.

No synthetic or real submission was made during this work.

## Booking

`NEXT_PUBLIC_PILOT_BOOKING_URL` holds a founder-configured Calendly event URL
that creates a Google Meet link after booking. **It is not configured**, so
`pilotBookingAction()` returns the contact-form fallback labelled "Start a pilot
conversation" — never a booking CTA that goes nowhere. No account was created on
the founder's behalf.

## The offer

The fixed 31 October 2026 deadline is **removed**: a date on an offer for a pilot
with no confirmed location is a promise about a calendar nobody controls. The
offer renders framed as **planned**, with the first-100 cap the database
enforces, and "final eligibility and dates will be confirmed before onboarding".

## Guards

`maanta-app/src/lib/__tests__/nairobi-pilot-truth.test.ts` — fifteen behavioural
groups over the whole public tree, plus resolved-value checks on `live-claims`
(its source holds both branches by design, so only the resolved value is a
claim). Six mutations were each restored individually and each turned the
intended guard red.

## What this change deliberately did not do

No redesign: the visual system, typography, spacing, components and responsive
behaviour are unchanged. No Supabase schema change. No deployment. The one
accessibility fix is the funnel back control, raised from 36px to 44px.
