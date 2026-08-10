# MAANTA Marketing Site — Launch Readiness Audit

**Date:** 2026-08-10 · **Mode:** Reviewer, then Builder (audit first, remediation
after — see the last section) ·
**Repo state:** `main` @ `8b7f147`, audited from branch
`claude/maanta-launch-audit-rn5a89` ·
**Production measured:** `https://maanta-nuia.vercel.app` (the production alias;
last READY production deployment `dpl_B7iuEWUkrn5cKue99WECD2uCRdtq`, `main` @
`8b7f147`), build ID `TYB8C64eU03ti48YalbI6`.

This audit answers a 20-item pre-launch checklist.

**The audit pass itself changed no application code** — it produced only this
file and three rows in `docs/maanta-drift-register.md` (**D83**, **D84**,
**D85**). A **remediation pass followed on the same branch**, and the checklist
table below still describes production as it was measured, not as the branch now
stands. What has since been fixed, and what deliberately has not, is in
[Remediation status](#remediation-status) at the end. Nothing in that pass is
live: production is unchanged until the branch merges and deploys.

---

## Scope reviewed

**Repository (source of truth).** All 17 `page.tsx` files under
`maanta-app/src/app/(marketing)/`, the marketing shell
(`(marketing)/layout.tsx`, `SiteHeader`, `SiteFooter`), the shared marketing
libraries (`src/lib/marketing/{facts,nav,page-metadata,og,analytics,analytics-events,demo,legal-docs,scenario}.ts`),
the four legal markdown sources in `src/content/legal/`, the Next.js file
conventions (`src/app/{robots.ts,sitemap.ts,not-found.tsx,layout.tsx,global-error.tsx}`),
the six `opengraph-image.tsx` files, the marketing guard suites under
`src/lib/__tests__/`, and the three post-build scripts in `maanta-app/scripts/`.

**Production (verification, not authority).** All 17 marketing routes plus
`/how-it-works`, `/feed`, `/robots.txt` and a synthetic 404 path were fetched
and their rendered HTML parsed. The apex domain `www.maanta.app` is blocked by
this environment's egress proxy, so measurement went through the Vercel
deployment alias instead; `curl` and `WebFetch` against the apex return 403 and
should not be attempted from a session container.

**Operating context.** `docs/maanta-launch-readiness-tracker.md` (gate status),
`docs/maanta-drift-register.md` (18 open rows at time of audit),
`docs/ops/IMPLEMENTATION-REPORT.md`, and the four marketing-finish documents
under `docs/ops/`.

**Deliberately out of scope.** The shopper, merchant, admin, agent and founder
app surfaces, except where a marketing-site concern reaches into them — which it
does twice, at items 10 and 19, and both are reported.

---

## Executive assessment

**The marketing site is in materially better shape than a 20-item checklist
usually finds, and its weaknesses are concentrated in machine-readable metadata
rather than in content or craft.** Seventeen routes each carry a unique title,
a unique description and a self-referential canonical; the four legal routes are
correctly `noindex, nofollow`; the demo-data banner correctly stays off every
marketing route; no `{{TOKEN}}` placeholder survives into rendered output; and
the site publishes a specific, four-tier response-time commitment at a stage
when most products publish none. The honesty engineering is unusually good: a
visible DRAFT banner on all four legal routes, placeholder regulatory
identifiers rendered as badges rather than hidden, a regulatory-status
disclosure in the footer, and a `held-claims` guard that actively scans for
claims the company has decided not to make.

**Three things should be fixed before a public launch, and only one of them is
large.**

First, **the entire signed-out shopper application is crawlable while it is
serving synthetic data.** `robots.txt` disallows the merchant, admin, agent and
founder surfaces but not `/feed`, `/browse`, `/map`, `/deals`, `/my-deals`,
`/tickets`, `/search`, `/shops/*`, `/you`, `/login` or `/sign-up`. I fetched
`/feed` as an anonymous client: HTTP 200, 156 rendered `KES` price strings from
demo data, no `noindex`, and the homepage's own title and description. It is the
destination of the site's single most prominent call to action, in both the
header and the homepage hero. `sitemap.ts` already states in its own comment
that these are "authenticated or shopper-session surfaces, not indexable
content" — `robots.ts` simply never acted on it.

Second, **the pre-launch "not yet trading" discipline leaks in ten places, and
the guard that should catch it tests a different string than its name claims.**
The sharpest of them is that `SiteFooter.tsx` renders "Live at BBS Mall,
Eastleigh · Nairobi" beside an amber status dot and, sixty-four lines later in
the same component, "MAANTA APP is not yet trading" — so every page on the site
carries both claims in its own footer. Four hero status lines, the home page's
own meta description (overriding a root description that is correctly gated),
`/about`'s description and Open Graph description, and `/about`'s Open Graph
image repeat it. That last one bypasses the `OG_STATUS_LINE` constant that
`src/lib/marketing/og.tsx` gates for exactly this reason, in a docblock that
records two reviewers raising it on PR #153.

Third, **the legal documents are unreviewed drafts and that is a blocked
launch gate** (`O5` in the readiness tracker, blocked on incorporation
decisions). This is correctly disclosed today and is not an engineering task.

**Nothing in this audit calls for inventing proof.** MAANTA has no completed
pilot, so it has no case studies and no reviews; the correct number of both is
zero, and the site already ships the honest substitutes. There is no verified
public office, so there should be no map and no `LocalBusiness` schema. There is
no founder photograph, and that is an asset the founder supplies or
deliberately declines — not something to source or generate.

**The clearest single gap is structured data:** there is no `application/ld+json`
anywhere on the site, while `/faq` already server-renders 16 question/answer
pairs that a `FAQPage` block would make eligible for rich results at no content
cost and no honesty cost.

---

## Checklist results

| # | Item | Status | Evidence | Gap / risk | Recommended next step | Owner |
|---|---|---|---|---|---|---|
| 1 | Custom 404 page | Partial | `maanta-app/src/app/not-found.tsx` (14 lines); production returns HTTP 404 with `x-next-error-status: 404` and `<meta name="robots" content="noindex">` | Renders no header, footer or nav — a lost visitor gets one link ("Back to home"). Inherits the root layout's metadata, so the 404 serves the homepage `<title>`, description and `og:url=https://www.maanta.app` | Wrap it in the marketing shell (or add `(marketing)/not-found.tsx`), give it its own `metadata`, and offer 3–4 recovery links (Shoppers, Merchants, FAQ, Contact) | eng |
| 2 | Primary CTA above the fold | Implemented | Home hero `primary={{ label: "Browse live deals", href: "/feed" }}`, `(marketing)/page.tsx:90`; header CTA `nav.ts:22`; `/merchants` hero `merchants/page.tsx:87` and closing CTA `:434` | One amber primary per screen, consistent with frozen UI rule 1. The destination `/feed` currently serves demo data — see item 10 and blocker 1 | No change to the CTA. Fix what it lands on | eng |
| 3 | Internal links between relevant pages | Implemented | `src/lib/marketing/nav.ts:15–72` (header, three footer columns, legal bar); body cross-links at `merchants/page.tsx:353`, `faq/page.tsx:70,114`, `help/page.tsx:40`, `shoppers/page.tsx:268,288,295`, `EnquiryRouter.tsx:212` | No orphans: all 17 routes reachable from the persistent header or footer. `nav.ts` is a single source feeding header, footer and sitemap | None | eng |
| 4 | Thank-you / confirmation page after lead or contact submission | Partial | Inline success region, `EnquiryRouter.tsx:229–242` (`role="status"`, `aria-live="polite"`, "✓ Message sent"); same inline pattern on `/waitlist` and `/merchants/join` | No dedicated confirmation URL on any of the three forms, so there is nothing bookmarkable, shareable, or usable as a destination-URL conversion goal. Partly mitigated: `marketing_form_submitted` fires (`analytics-events.ts:18`), so conversions are measurable by event | Keep the inline state (it is good UX) and add a thin `/contact/thank-you` style route for the three forms, or register the event as the conversion goal and record that decision. Do not remove the inline confirmation | eng |
| 5 | Breadcrumbs, where appropriate | Not applicable yet | No breadcrumb code anywhere: a case-insensitive grep for `breadcrumb` across `maanta-app/src/` returns nothing. Of 17 routes only two are two segments deep (`/merchants/join`, `/malls/bbs-mall`); both are reachable from the persistent header | 15 of 17 routes are depth-1, where a crumb would read "Home / Pricing" — noise, and exactly the template furniture the `CLAUDE.md` UI bar rules out. Note also that `/malls` has **no** `page.tsx` and 404s, so a naive "Home / Malls / BBS Mall" trail would ship a broken middle crumb | Skip visible breadcrumbs. The part that would pay is `BreadcrumbList` JSON-LD on `/merchants/join` — fold into item 17, and only once `/malls` is a real page | eng |
| 6 | Case studies | Not applicable yet | No case-study route or section exists. Readiness tracker `E2`–`E4` are in progress; the 3-person friends-and-family pilot at Node 0 has not produced a result | Pre-launch: there is no outcome to write up. Fabricating one is the failure mode this repo's `held-claims.test.ts` exists to prevent | Ship nothing now. The honest substitutes are already live (`/merchants` mechanics, `/mall-operators`, `/about` founder story, `/faq`). After the pilot, a "What partners can measure" page rendered through `ScenarioStat`/`ScenarioNotice` is the correct vehicle | founder |
| 7 | At least five useful FAQs | Implemented | `(marketing)/faq/page.tsx` — 16 Q&A pairs, server-rendered as `<details>/<summary>`: 6 shopper, 6 merchant, 4 mall-operator | Well past the bar, and specific rather than filler (success fee, grace period, dishonoured deals, staff verification, top-ups, cancellation, POS integration, cost to the mall) | None for the copy. Add `FAQPage` JSON-LD — see item 17 | marketing |
| 8 | Clear response-time promise for enquiries/support | Partial | `(marketing)/contact/page.tsx:154–159`, rendering `RESPONSE_TIMES`: same day (WhatsApp), 1 business day (form and email), 2 business days (mall operators), DPA-2019 period (privacy requests); founder ruling 2026-07-31 | The promise is specific and server-rendered — but `/help`, the other support entry point and a footer link, states no turnaround at all. Two support doors, two different implied commitments | Mirror the `RESPONSE_TIMES` block onto `/help` from the same constant. Copy already ruled; no new commitment needed | eng |
| 9 | Sticky mobile CTA | Missing | No `fixed bottom-*` / `sticky bottom-*` element in `(marketing)/` or `components/marketing/`; confirmed absent in production HTML on all 17 routes. The only sticky element is the header (`sticky top-0 z-30`) | The hero CTA scrolls away on the long conversion pages (`/merchants` is ~440 lines). This market is mobile-dominant, so the primary action is off-screen for most of the scroll depth | Add a sticky bottom CTA to `/merchants` and `/shoppers` only, reusing each page's existing hero target. It must **replace** the visible amber CTA while shown, not add a second one — frozen UI rule 1 caps a screen at one amber action | design |
| 10 | `robots.txt` | Partial | `maanta-app/src/app/robots.ts`; served correctly in production with absolute `Sitemap:` and `Host:`. Disallows `/api/`, `/admin`, `/agent`, `/founder`, `/merchant/`, `/onboarding`, `/otp`, `/select-mall`, `/verify-phone`, `/app-bootstrap`, `/sentry-example-page` | **The whole signed-out shopper surface is crawlable**: `/feed`, `/browse`, `/map`, `/deals`, `/deals/[id]`, `/my-deals`, `/tickets`, `/search`, `/shops/[id]`, `/you`, `/notifications`, `/profile`, `/login`, `/sign-up`, `/demo`. Measured: `/feed` → HTTP 200 anonymous, 156 `KES` strings of demo data, no `noindex`, homepage title. `sitemap.ts:18–20` already states these are not indexable content | Extend the disallow list to the shopper and auth surfaces, mirroring `sitemap.ts`'s stated rationale; belt-and-braces, `noindex` them while `DEMO_MODE`. Add a guard so the two files cannot disagree again. Opened as **D85** | eng |
| 11 | Unique page titles | Implemented | Verified in rendered production HTML for all 17 routes — all unique, all descriptive, none templated. Guarded by `marketing-a11y.test.ts:86` | Two caveats worth knowing: the guard checks *presence*, not *uniqueness* or length, so a future duplicate would pass; and `/download` is titled `Install Maanta`, the only route without the `— MAANTA` suffix and the only one lower-casing the wordmark | Fix the `/download` title for convention. Optionally tighten the guard to assert uniqueness | eng |
| 12 | Unique meta descriptions | Implemented | Verified in rendered production HTML for all 17 routes — all present, all unique, none inheriting the root description | Uniqueness and presence are fully met; two quality issues sit behind that. **Length:** `/about` (171 chars) and `/waitlist` (170) exceed the ~160-char snippet window and truncate — in `/about`'s case cutting "Here is how it works and how we make money.", the sentence doing the persuading — while seven descriptions sit under 120 and waste the space. No guard checks length or uniqueness in either direction. **Content:** the `/` and `/about` descriptions assert "Live at BBS Mall, Eastleigh." while the footer says MAANTA is not yet trading — see blocker 2 | Trim `/about` and `/waitlist` to ≤160; extend the short ones on `/malls/bbs-mall` and `/help`. Resolve the "Live at" question separately (blocker 2) | eng |
| 13 | Social-share / Open Graph image and metadata | Partial | `og:url`, `og:title`, `og:description`, `og:site_name=MAANTA`, `og:type=website`, `og:locale=en_KE`, `twitter:card/title/description` on **all 17**. `og:image` (1200×630, distinct `og:image:alt`, `twitter:image` mirrored) on **6 of 17**: `/`, `/shoppers`, `/merchants`, `/mall-operators`, `/about`, `/contact` | **11 routes declare `twitter:card=summary_large_image` and ship no image**, so a share renders an empty large card — including `/pricing` and `/merchants/join`, the two commercial conversion pages, in a market where `og.tsx`'s own docblock notes WhatsApp is how these pages get shared. Separately, `about/opengraph-image.tsx:13` hardcodes `subline: "Live at BBS Mall, Eastleigh, Nairobi."`, bypassing the `OG_STATUS_LINE` gate — opened as **D83** | Add `opengraph-image.tsx` for at least `/pricing`, `/merchants/join`, `/waitlist` and `/malls/bbs-mall` (five working templates already exist). Replace `/about`'s hardcoded subline with copy that makes no trading claim | eng |
| 14 | Maps and directions, if MAANTA has a public physical location | Not applicable yet | MAANTA is **not incorporated** (`CO-DEMO-0000-NOT-INCORPORATED`, `src/lib/marketing/demo.ts:43`). Its only physical presence is a desk inside BBS Mall, a venue it does not own. `/malls/bbs-mall` carries no address, hours, floor guide or map | Publishing a map or address for MAANTA would assert a public place of business that does not exist | Add no map and no address for MAANTA. Once the pilot opens, directions to **BBS Mall** — clearly attributed to the mall, not to MAANTA — are a legitimate shopper aid on `/malls/bbs-mall`; the founder supplies the verified details | founder |
| 15 | Real customer or partner reviews | Not applicable yet | No testimonial, review, rating or partner-logo content renders on any route. `src/lib/__tests__/held-claims.test.ts` actively scans page source and `src/content/legal/*.md` for claims the company has decided not to publish | Correct for the stage: there are no customers yet, so there is no review that could be real | Add none. Revisit only when the pilot yields named merchants who consent to be quoted — at which point the quote must be attributable and checkable | founder |
| 16 | Meaningful alt text on all content images | Not applicable yet | There are **no content images**: zero `<img>`/`<Image>` in `(marketing)/` or `components/marketing/` source, and zero `<img>` in rendered HTML across all 17 production routes. All artwork is inline SVG | Nothing to caption. The SVG treatment is correct: the two shell logos are `aria-hidden="true"` inside `<a aria-label="MAANTA home">`, page glyphs are decorative `aria-hidden="true"`, and no `<svg role="img">` exists anywhere | No action. This item becomes live the moment the first photograph ships (see item 20) — add the alt-text requirement to that change, not before | eng |
| 17 | Appropriate organization and local-business structured data/schema | Missing | Zero `application/ld+json` in `maanta-app/src/`, confirmed absent in rendered HTML on all 17 production routes. No `Organization`, no `WebSite`, no `FAQPage`, no `BreadcrumbList` | Free, honest search wins are unclaimed — most obviously `FAQPage` over 16 already-marked-up Q&A pairs. `LocalBusiness` is a separate matter and is **not applicable**: it requires a verified public address MAANTA does not have | Ship the honest subset: `FAQPage` on `/faq`, `WebSite` on `/`, and a minimal `Organization` carrying only `name`, `url` and `logo`. No `address`, no `LocalBusiness`, no `aggregateRating`. Defer any identifier-bearing schema until incorporation and ODPC registration land | eng |
| 18 | Privacy Policy page | Partial | `(marketing)/privacy/page.tsx` rendering `src/content/legal/privacy-policy.md` — 15 substantive sections including lawful basis, automated processing, retention, rights, complaints, cross-border transfer and children. Linked from every footer. `noindex, nofollow` while `DEMO_MODE`, guarded by `marketing-a11y.test.ts:110` | The page is honest, not finished: it renders a visible DRAFT notice ("NO LEGAL STANDING… has **not** been reviewed by a lawyer… Registration and licence numbers shown are placeholders") and a visible `ODPC-DEMO-0000-NOT-REGISTERED`. Readiness tracker **`O5` is a blocked GATE**; **`O6`** (Kenya DPA cross-border basis for Supabase `eu-west-1`) is not started | Not an engineering task. Unblock `O5` via counsel review and the incorporation decision, and rule on `O6`. The disclosure machinery to flip at launch already exists and is gated on one flag | legal |
| 19 | Analytics implementation, consent-aware if required | Partial | PostHog initialised site-wide in the root layout (`PostHogClientProvider` confirmed in the production RSC payload), proxied via `/ingest`; named marketing events in `src/lib/marketing/analytics-events.ts`. Consent posture is deliberate: `persistence: "memory"` (`src/components/posthog-provider.tsx:38`, founder ruling 2026-07-31), so nothing is written to an anonymous visitor's device — which is why no banner ships, and `src/content/legal/cookie-notice.md:41` says exactly that | Two gaps. (a) No mechanism exists for a signed-in user to exercise the choice `/cookies` and `/privacy` §7 describe. (b) **A live defect:** `src/lib/analytics-identity.ts:21–23` states it requires default cookie persistence and that `memory` leaves "no cookie to read" — which is the shipped config. So `serverPosthogDistinctId()` returns `null` on every signed-out request and server events fall to `distinct_id_source: 'none'`. Open row **D22** treats this as a future risk; it is already realised. Opened as **D84** | Do not add a banner or a provider without a founder decision on provider, measurement ID, lawful basis and jurisdictions. Do resolve D84: either restore cookie persistence with consent, or retire the cookie-reading path and accept unattributed signed-out events explicitly | eng |
| 20 | Authentic team/founder photo or an intentionally appropriate alternative | Implemented | `/about` carries a named, substantive founder section (Mohamed Elmi, Founder) — biography, why Eastleigh, and `admin@maanta.app` — with **no photograph**. The image-free treatment is demonstrably intentional, not unfinished: there is no `<img>` on any of the 17 routes, `public/` holds only `icon.svg` and the manifest, the hero is a CSS mockup rather than a screenshot, and the OG images are generated programmatically | Reads as the "intentionally appropriate alternative" the item allows: a real, named person with a specific story, on a consistently typographic site. The residual cost is mild — a named founder with no face on the page investors and mall operators read most | No engineering action. A real photograph remains an optional founder-supplied upgrade; if it is added, it needs meaningful alt text (item 16 re-opens with it). Do not source stock or generate a likeness | founder |

**Status counts:** Implemented 6 · Partial 7 · Missing 2 · Needs founder input 0 ·
Not applicable yet 5.

No single checklist item is blocked purely on a missing asset — but eight
decisions are open, and three of them gate a public launch. They are listed
under *Needs founder content or decision* below; read that section as the real
founder queue, not this row of counts.

Two of these calls are judgment rather than measurement, and are flagged so they
can be overruled cheaply. **Item 8** is marked Partial rather than Implemented
because `/help` — a footer-linked support door — states no turnaround while
`/contact` states four; the promise itself is unambiguous where it appears.
**Item 20** is marked Implemented rather than Needs founder input because the
image-free treatment is consistent across all 17 routes and paired with a real
named founder story, which is what makes it an intentional alternative rather
than an omission.

---

### Fix before public launch

Genuine blockers for discoverability, trust, conversion or legal clarity.

1. **Close the crawl on the signed-out shopper app (item 10).** Add the shopper
   and auth surfaces to `robots.ts`, mirroring the rationale `sitemap.ts`
   already states, and `noindex` them while `DEMO_MODE` holds. Without this, a
   crawler can index fabricated deals under MAANTA's brand — and indexed URLs
   outlive the demo data that produced them. Small diff, high consequence.
   Drift **D85**.
2. **Resolve the "Live at" contradiction (items 12, 13).** Four surfaces assert
   trading while the footer of every page denies it, and the guard named for
   this catches none of them. Needs a founder ruling first (is "Live at BBS
   Mall" acceptable pre-launch?), then alignment of the homepage hero,
   `/about`'s description and OG description, and `/about`'s OG image — plus a
   guard whose assertion matches its name. Drift **D83**.
3. **Unblock the legal gate (item 18).** `O5` is blocked on incorporation
   decisions. The drafts are correctly bannered and `noindex`ed today, which is
   honest but is not a public launch state.
4. **Give the four highest-value shareable routes an OG image (item 13).**
   `/pricing`, `/merchants/join`, `/waitlist`, `/malls/bbs-mall` currently
   promise a large image card and deliver an empty one. Five working templates
   already exist; this is a copy-and-adapt job.
5. **Rebuild the 404 as a recovery page (item 1).** Marketing chrome, its own
   metadata, and a few real onward links. It currently advertises itself as the
   homepage in every metadata field.

### Fix soon after launch

Useful, not required for a first credible public release.

6. **`FAQPage` + `WebSite` + minimal `Organization` JSON-LD (item 17).** The
   highest ratio of search benefit to honesty risk on this list, provided the
   `Organization` block carries no address or identifier.
7. **Sticky mobile CTA on `/merchants` and `/shoppers` (item 9)**, replacing
   rather than duplicating the visible amber action.
8. **Mirror the response-time block onto `/help` (item 8).** Same constant, no
   new commitment.
9. **A confirmation route for the three forms (item 4)**, keeping the inline
   success state.
10. **Small correctness items:** `/download`'s title convention and wordmark
    casing; `/help`'s missing `<h1>` (its first heading is an `<h2>`); the
    subject–verb error in `/about` ("the agents **works** the floor"); and
    `/malls/bbs-mall`, which is a three-paragraph stub carrying a "LIVE NOW"
    badge while being linked from every footer as the Node 0 page.

### Defer until evidence exists

11. **Case studies (item 6)** — until the Node 0 pilot produces a verified
    result. Then build a measurement-methodology page, not a testimonial page.
12. **Reviews and testimonials (item 15)** — until named merchants consent to
    be quoted.
13. **Maps, directions and `LocalBusiness` schema (items 14, 17)** — until
    there is a verified public location. Directions to BBS Mall, attributed to
    the mall, are the honest earlier step.
14. **Founder photograph (item 20)** — a founder asset decision.
15. **Consent banner (item 19)** — do not build one until provider, lawful
    basis and target jurisdictions are decided. The current cookieless posture
    is defensible and its copy matches its behaviour.

---

## High-priority launch blockers

**1 · The signed-out shopper application is indexable while serving demo data.**
`robots.txt` protects the merchant, admin, agent and founder surfaces and leaves
the shopper surface open. Measured directly: `GET /feed` as an anonymous client
returns HTTP 200, renders 156 `KES` price strings drawn from demo data
(`app_config.demo_mode_enabled` is `true` — open row **D14**), emits no
`noindex`, and carries the homepage `<title>` and description. `/feed` is the
target of the header CTA (`nav.ts:22`) and the homepage hero CTA
(`(marketing)/page.tsx:90`), so it is the most linked destination on the site and
the most likely to be crawled. `sitemap.ts:18–20` already articulates the
correct policy; `robots.ts` never implemented it. Recorded as **D85**.

**2 · Pre-launch trading claims leak past a mis-scoped guard.** Every page
footer renders "MAANTA APP is not yet trading" alongside a regulatory-status
disclosure, and the company is neither incorporated nor ODPC-registered. Against
that, **ten** surfaces assert the opposite:

> **Correction, 2026-08-10.** The first version of this report said five. The
> full count is ten, and the one it missed matters most: `SiteFooter.tsx:57`
> renders `Live at {FACTS.launchMall} · {FACTS.city}` beside an amber status
> dot, and the same component renders `PrelaunchNotice` — "MAANTA APP is not
> yet trading" — sixty-four lines further down. Both claims are in one
> component, so **every page on the site carries the contradiction in its own
> footer**, not just the four pages originally listed. The undercount came from
> auditing the pages and not the shell they all mount.

| # | Surface | Where |
|---|---|---|
| 1 | Footer status line — **on every page** | `components/marketing/SiteFooter.tsx:57` |
| 2 | Home meta description | `(marketing)/page.tsx:52` |
| 3 | Home hero status line | `(marketing)/page.tsx:115` |
| 4 | `/shoppers` hero status line | `(marketing)/shoppers/page.tsx:73` |
| 5 | `/merchants` hero status line | `(marketing)/merchants/page.tsx:92` |
| 6 | `/mall-operators` hero status line | `(marketing)/mall-operators/page.tsx:96` |
| 7 | `/mall-operators` "Live at … since" line | `(marketing)/mall-operators/page.tsx:88` |
| 8 | `/about` meta description | `(marketing)/about/page.tsx` |
| 9 | `/about` `ogDescription` | `(marketing)/about/page.tsx:58` |
| 10 | `/about` OG image subline | `(marketing)/about/opengraph-image.tsx:13` |

Number 2 is worth dwelling on, because the root layout's description **is**
correctly `DEMO_MODE`-branched (`src/app/layout.tsx`) and guarded by
`prelaunch-consistency.test.ts`. A per-route description overrides the root one,
so the homepage — the most-served page on the site — reintroduces in its own
metadata precisely the claim the root was gated to avoid. This is the shape
**D46** closed on 2026-08-01 for the OG status line and the root description,
recurring one layer down.

Number 10 is the sharpest. `src/lib/marketing/og.tsx:28–53` gates
`OG_STATUS_LINE` specifically so that an OG image — "the one surface where the
disclosure provably cannot follow the claim" — makes no trading claim while
`DEMO_MODE` holds, and the docblock records that two reviewers raised this on
PR #153 and that it was dismissed once. `/about` reintroduces it one segment
over, and its image now carries the careful gated status line at the foot and
the ungated claim 24 pixels above it.

`prelaunch-consistency.test.ts:72` is named *"keeps 'Live at' out of every
marketing page body while pre-launch"* but asserts
`/\b(now live at|already live)\b/i`, which matches none of the four. This is the
same vacuous-guard pattern as **D38**. Recorded as **D83**.

**3 · Legal documents are unreviewed drafts (blocked gate `O5`).** Disclosed
correctly and `noindex`ed, so this is honest today — but publishing a site that
solicits merchant sign-ups against unreviewed terms is a founder and counsel
decision, not something engineering can close. `O6` (Kenya DPA cross-border
basis for Supabase `eu-west-1`) is not started and belongs in the same
conversation.

---

## Quick wins

Ordered by benefit per unit of effort; none requires a product decision.

1. **`FAQPage` JSON-LD on `/faq`** — 16 Q&A pairs already exist and are already
   semantic `<details>/<summary>`. Pure gain, no new claims.
2. **Four `opengraph-image.tsx` files** copied from the five working templates,
   for `/pricing`, `/merchants/join`, `/waitlist`, `/malls/bbs-mall`.
3. **Response times mirrored onto `/help`** from `RESPONSE_TIMES`.
4. **`/help` gets an `<h1>`** — its heading order currently starts at level 2.
5. **`/download` title** brought onto the `… — MAANTA` convention with the
   wordmark cased consistently.
6. **The `/about` grammar fix** ("the agents works the floor").
7. **`WebSite` + minimal `Organization` JSON-LD** — name, url, logo only.
8. **Meta-description lengths** — trim `/about` (171 chars) and `/waitlist`
   (170) under the ~160 snippet window, and extend `/malls/bbs-mall` (99) and
   `/help` (90), which currently leave snippet space unused.

---

## Needs founder content or decision

| # | Decision or asset | Why it cannot be resolved in the repo |
|---|---|---|
| 1 | **Is "Live at BBS Mall" acceptable pre-launch?** | A commercial and legal positioning call. Engineering can align all ten surfaces either way, but not choose. Blocks **D83** |
| 2 | **Lawyer review of the four legal drafts, and the incorporation decision behind it** | Readiness tracker `O5`, blocked. Gates the removal of the DRAFT banners and the placeholder identifiers |
| 3 | **Kenya DPA cross-border basis for Supabase `eu-west-1`** | Readiness tracker `O6`, not started. Determines what `/privacy` §12 may honestly say |
| 4 | **Analytics consent posture for signed-in users** | Provider, measurement ID, lawful basis and target jurisdictions must be settled before any banner or opt-out is built. The current cookieless anonymous posture is already ruled and is fine |
| 5 | **Founder photograph — optional upgrade, not a gap** | The text-only treatment already reads as intentional (item 20). A real photograph would strengthen `/about`; it is an asset the founder supplies or declines, and must not be sourced or generated |
| 6 | **BBS Mall verified address, opening hours and floor detail** | Needed before `/malls/bbs-mall` can stop being a stub. Attributable to the mall, not to MAANTA |
| 7 | **Whether the pilot may be written up, and by whom** | Determines when items 6 and 15 stop being deferred |
| 8 | **Drift-row numbering** | **D83** and **D84** are also claimed by unmerged branches. Per the convention recorded on the PR #185 branch, whichever lands on `main` second renumbers; the contiguity guard in `drift-register.test.ts` forbids skipping ahead to avoid the clash |

---

## Not applicable / defer

- **Breadcrumbs (5)** — a two-level, 17-page site with a persistent header. The
  `BreadcrumbList` markup is worth having; the visual component is not.
- **Case studies (6)** and **reviews (15)** — no pilot result and no customers.
  The correct count of each is zero, and the site already ships the honest
  substitutes.
- **Maps and directions (14)** and **`LocalBusiness` schema (17, in part)** —
  no verified public location; the company is not incorporated.
- **Alt text (16)** — no content images exist. Re-opens with the first
  photograph.
- **Consent banner (19)** — the cookieless anonymous design removes the need,
  and the cookie notice describes it accurately.

---

## Recommended implementation order

**Sequenced so each step is independently shippable and nothing waits on a
decision it does not need.**

1. **`robots.ts` disallow list + `noindex` on shopper surfaces**, with a guard
   pinning `robots.ts` and `sitemap.ts` to the same policy. *(blocker 1, D85)*
2. **Founder ruling on "Live at"**, then align the homepage hero, `/about`
   metadata and OG description, and `/about`'s OG image; fix
   `prelaunch-consistency.test.ts:72` so its assertion matches its name.
   *(blocker 2, D83)*
3. **404 rebuild** — marketing shell, own metadata, real recovery links.
4. **Four OG images** for the commercial and acquisition routes.
5. **JSON-LD**: `FAQPage`, `WebSite`, minimal `Organization` — no address, no
   identifiers, no `LocalBusiness`.
6. **`/help` parity**: response times from the shared constant, plus an `<h1>`.
7. **Copy and convention fixes**: `/download` title, `/about` grammar.
8. **Sticky mobile CTA** on `/merchants` and `/shoppers`, replacing the visible
   amber action while shown.
9. **Confirmation route** for the three forms, keeping the inline success state.
10. **Resolve D84** — decide whether signed-out server-side attribution is
    restored or explicitly retired.
11. **`/malls/bbs-mall` build-out** — gated on founder-supplied mall detail.
12. **Legal review (`O5`) and the DPA decision (`O6`)** — parallel track,
    founder and counsel owned; unblocks the `DEMO_MODE` flip.

Steps 1 and 3–7 need no decision and can start immediately. Step 2 needs one
ruling. Steps 11 and 12 are founder-gated throughout.

---

## Evidence inspected

**Rendered production HTML** (via the Vercel deployment alias): all 17 marketing
routes, `/how-it-works`, `/feed`, `/robots.txt`, and a synthetic 404 path.
Extracted per route: status, `<title>`, description, canonical, the full
`og:*`/`twitter:*` set, `robots`, `ld+json`, forms, images, sticky elements and
consent UI.

**Repository files opened:**
`maanta-app/src/app/robots.ts` · `sitemap.ts` · `not-found.tsx` · `layout.tsx` ·
`(marketing)/page.tsx` · `(marketing)/about/page.tsx` ·
`(marketing)/about/opengraph-image.tsx` · `(marketing)/merchants/page.tsx` ·
`(marketing)/faq/page.tsx` · `(marketing)/contact/page.tsx` ·
`(marketing)/privacy/page.tsx` ·
`src/lib/marketing/{nav,facts,og,analytics,analytics-events,demo,legal-docs}.ts` ·
`src/lib/{app-url,analytics-identity}.ts` ·
`src/components/posthog-provider.tsx` ·
`src/components/marketing/{EnquiryRouter,RegulatoryStatus,SiteFooter}.tsx` ·
`src/content/legal/{privacy-policy,cookie-notice}.md` ·
`src/lib/__tests__/{marketing-a11y,prelaunch-consistency,prelaunch-disclosures,held-claims,analytics-identity,drift-register}.test.ts`

**Operating documents:** `CLAUDE.md` · `docs/maanta-launch-readiness-tracker.md`
(gate table, `E`/`M`/`O` rows) · `docs/maanta-drift-register.md` (18 open rows,
of which **D14**, **D22**, **D39**, **D50**, **D51** bear on this audit).

**Deployment state:** Vercel project `maanta-nuia`
(`prj_9ZcvFgpVsaUpP9hv2UlNoU5Sdw4c`, team `maanta`); production alias resolves to
`main` @ `8b7f147`, deployment `dpl_B7iuEWUkrn5cKue99WECD2uCRdtq`, `READY`.

**Not measured, and why.** Drift **D39** (`/how-it-works`) is *not* closed by
this audit. The redirect target was confirmed — the path serves `/shoppers` with
a correct self-referential canonical, and no canonical anywhere points at
`/how-it-works` — but the Vercel fetch tool follows redirects transparently and
exposes only the final response, so the 308 status code and `Location` header
were still not observed. D39 needs the `curl -sI` with redirect-following off
that it has always asked for, run from a network that can reach the apex domain.
This session could not: the egress proxy blocks `www.maanta.app`.

**Verified good, for the record.** Canonical present and self-referential on all
17 routes · `noindex, nofollow` on exactly the four legal routes and nowhere
else · DRAFT banner on all four · demo-data banner correctly absent from every
marketing route · unique titles and descriptions throughout · `og:locale=en_KE`
and `og:site_name` consistent · skip-to-content link and `aria-label="Primary"`
nav on every page · no `{{TOKEN}}` placeholder in any rendered output · no
orphan routes.

---

## Remediation status

Everything below is **on `claude/maanta-launch-audit-rn5a89` and not live.** The
checklist table above still describes production, which is unchanged until this
branch merges and deploys. Verified locally: `next lint` clean, `tsc --noEmit`
clean, vitest **589/589 across 78 files**, and `npm run build` green including
all three post-build gates.

### Fixed

| Item | What changed | Verified by |
|---|---|---|
| 10 · robots.txt | `NON_INDEXABLE_PREFIXES` now lives in `nav.ts` beside `SITEMAP_ROUTES`, and `robots.ts` reads it. The shopper surfaces (`/feed`, `/browse`, `/map`, `/search`, `/deals`, `/my-deals`, `/tickets`, `/shops`, `/notifications`, `/profile`, `/you`), the auth entry points and `/demo` are disallowed | Built `robots.txt` read back; new `marketing-crawl-policy.test.ts` |
| 10 · robots.txt | The guard found a route the audit missed: bare `/merchant` was uncovered, because the existing `/merchant/` rule needs its trailing slash to avoid also disallowing `/merchants`. Fixed with the `$` end-anchor | `marketing-crawl-policy.test.ts` |
| 17 · Structured data | `FAQPage` on `/faq` (all 16 Q&A), `Organization` + `WebSite` on `/`. Organization carries name, url and logo only — no address, no `LocalBusiness`, no identifiers, no `aggregateRating` | JSON-LD parsed out of the built HTML and validated |
| 13 · Social cards | OG images added for `/pricing`, `/merchants/join`, `/waitlist`, `/malls/bbs-mall`, `/faq`, `/help`, `/download`. The four `noindex` legal routes now declare `twitter:card=summary` instead of claiming a large card they should not fill | Built HTML: **0 routes** declare a large card without an image, down from 11 |
| 1 · Custom 404 | Rebuilt with the marketing shell, its own title and description, four recovery links and a skip link. `openGraph: null` clears the inherited home-page card | Built `_not-found.html`: own title, one `robots` tag, zero `og:` tags |
| 8 · Response time | `/help` now states the same commitment as `/contact`, read from `RESPONSE_TIMES` | Source + build |
| — | `/help` had no `<h1>` (its first heading was an `<h2>`) | Built HTML |
| 11 · Titles | `/download` was `Install Maanta` — the only route off the `… — MAANTA` convention and the only one lower-casing the wordmark | Built HTML |
| 12 · Descriptions | `/about` and `/waitlist` trimmed under the snippet window; `/help` and `/malls/bbs-mall` extended into it | Recomputed lengths |
| — | `NODE_TEAM.agentRole` was singular behind a plural subject, rendering "the agents works the floor" on `/about` and `/mall-operators` | Both call sites read "The agents {agentRole}" |

Two guards were added rather than one fix each, because in both cases the defect
was two files disagreeing rather than one file being wrong:
`marketing-crawl-policy.test.ts` asserts that **every** route in the app is
either in `SITEMAP_ROUTES`, or a `noindex` legal route, or disallowed — so a new
route cannot land in the gap `/feed` was in — and that no route claims a large
social card without an image.

### Deliberately not fixed

| Item | Why |
|---|---|
| **D83** — the ten "Live at" surfaces | Needs a founder ruling first. Engineering can align them either way but must not choose. One instance was touched incidentally by the `/about` description trim and was **restored**, so all ten stay consistent for one decision to settle at once |
| **D84** — signed-out analytics attribution | Needs a decision: restore cookie persistence behind consent, or retire the cookie-reading path and accept unattributed server events. A guard alone would go red immediately, which is a decision made by omission |
| 18 · Legal drafts (`O5`, `O6`) | Blocked on counsel review and the incorporation decision. Not an engineering task |
| 9 · Sticky mobile CTA | Frozen UI rule 1 caps a screen at one amber action, so a sticky bar must **replace** the visible CTA rather than add to it. That is a design decision about which surfaces get one |
| 4 · Confirmation routes | The inline success state works and conversions are already measurable via `marketing_form_submitted`. A dedicated URL changes three conversion flows and wants its own review |
| `/malls/bbs-mall` build-out | Needs founder-supplied mall detail — address, hours, floor guide |
| 6, 14, 15, 20 | Deferred pending pilot evidence, a verified location, consenting merchants, and a founder asset |
