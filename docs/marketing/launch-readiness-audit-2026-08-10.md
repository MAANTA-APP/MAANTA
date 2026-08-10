# MAANTA Marketing Site — Launch Readiness Audit

**Date:** 2026-08-10 · **Mode:** Reviewer, then Builder (audit first, remediation
after — see the last section) ·
**Repo state:** `main` @ `8b7f147`, audited from branch
`claude/maanta-launch-audit-rn5a89` ·
**Production measured:** `https://maanta-nuia.vercel.app` (the production alias;
last READY production deployment `dpl_B7iuEWUkrn5cKue99WECD2uCRdtq`, `main` @
`8b7f147`), build ID `TYB8C64eU03ti48YalbI6`.

This audit answers a 20-item pre-launch checklist.

**Read the table as current state, not as the original findings.** This document
has been through three passes on 2026-08-10:

1. **Audit** — read-only. Produced this file and rows **D87**, **D88**, **D89**
   in `docs/maanta-drift-register.md`.
2. **Remediation** — implemented under founder authorization, merged as PR #196
   and #197, and **deployed to production** (`main` @ `77983b6`, Vercel
   `dpl_5626CAFiu9zrNx6mjqJcZpAfuBWT`, READY 2026-08-10 16:28:47 UTC).
   Verified against `https://www.maanta.app`. D87, D89 and D90 closed on that
   evidence.
3. **Re-verification** — this pass. All 20 items re-checked against the current
   repo and the live domain; the checklist table below now reflects what is
   true today. **No code, content, metadata, asset, analytics or deployment
   change was made in this pass.**

The original findings are preserved as narrative: the executive assessment and
launch-blocker sections below describe the site *as first audited*, and
[Remediation status](#remediation-status) records what changed and why. Where
the two disagree, the table wins.

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

Second, **the pre-launch "not yet trading" discipline leaks in twenty-one
places, and the guard that should catch it tests a different string than its
name claims.** (This paragraph first said five, then ten; the final count from
implementing the fix is twenty-one — see the D87 section at the end for why a
string search kept undercounting it.)
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
| 1 | Custom 404 page | Implemented | `maanta-app/src/app/not-found.tsx` — marketing shell (`SiteHeader`/`SiteFooter`), own `metadata`, four recovery links, skip link, `openGraph: null`. Production `_not-found` returns 404 with its own title and a single `robots` tag | None outstanding | None | eng |
| 2 | Primary CTA above the fold | Implemented | Home hero `primary={{ label: "Browse live deals", href: "/feed" }}`; header CTA `nav.ts`; `/merchants` hero + closing CTA to `/merchants/join` | One amber primary per screen, per frozen UI rule 1 | None | eng |
| 3 | Internal links between relevant pages | Implemented | `src/lib/marketing/nav.ts` (header, three footer columns, legal bar) plus body cross-links; all 17 routes reachable from persistent chrome | No orphans | None | eng |
| 4 | Thank-you / confirmation page after lead or contact submission | **Partial** | Inline success region in `EnquiryRouter.tsx` (`role="status"`, `aria-live="polite"`); **zero** dedicated confirmation routes under `(marketing)` | No bookmarkable/shareable confirmation and no destination-URL conversion goal for `/contact`, `/waitlist`, `/merchants/join`. Mitigated: `marketing_form_submitted` fires, so conversions are measurable by event | Add a thin shared confirmation route, keeping the inline state — Plan Phase 2 | eng |
| 5 | Breadcrumbs, where appropriate | Not applicable yet | Zero breadcrumb code in `maanta-app/src/`. 15 of 17 routes are depth-1; only `/merchants/join` and `/malls/bbs-mall` nest | Visible crumbs on a flat 17-page site are template furniture. `/malls` has no `page.tsx` and 404s, so a naive trail would ship a broken middle crumb | Skip visible crumbs. `BreadcrumbList` JSON-LD on `/merchants/join` only — Plan Phase 2, item 17 | eng |
| 6 | Case studies | Not applicable yet | No case-study route or section. Pilot has not produced a result; founder confirms MAANTA is demo / pre-launch | Nothing to write up. Fabrication is what `held-claims.test.ts` exists to prevent | Ship nothing. Revisit post-pilot with a measurement-methodology page | founder |
| 7 | At least five useful FAQs | Implemented | `(marketing)/faq/page.tsx` — 16 Q&A pairs as server-rendered `<details>/<summary>`, 6 shopper / 6 merchant / 4 mall-operator, now also feeding `FAQPage` JSON-LD | Well past the bar and specific | None | marketing |
| 8 | Clear response-time promise for enquiries/support | Implemented | `RESPONSE_TIMES` in `facts.ts` rendered on **both** support doors: `(marketing)/contact/page.tsx` (four tiers) and `(marketing)/help/page.tsx` (WhatsApp + form), from one constant | Was Partial at audit time; `/help` gap closed and cannot drift, since both read the same constant | None | eng |
| 9 | Sticky mobile CTA | **Missing** | Zero `fixed bottom-*` / `sticky bottom-*` elements in `(marketing)` or `components/marketing`; only the header is sticky | The hero CTA scrolls away on the long conversion pages in a mobile-dominant market | Sticky bar on `/merchants` and `/shoppers` only, **replacing** the visible amber action while shown — Plan Phase 2 | design |
| 10 | `robots.txt` | Implemented | `src/app/robots.ts` reading `NON_INDEXABLE_PREFIXES` from `nav.ts`. **Verified live**: 27 rules incl. the whole signed-out shopper surface, auth entry points, `/demo`, and `$`-anchored `/merchant`. `sitemap.xml` advertises none of them | Was the launch blocker at audit time; closed as **D89** on production evidence | None | eng |
| 11 | Unique page titles | Implemented | All 17 unique in rendered production HTML. `/download` brought onto the `… — MAANTA` convention | Guard checks presence, not uniqueness or length — a future duplicate would pass | Optional: tighten the guard — Plan Phase 1 | eng |
| 12 | Unique meta descriptions | Implemented | All 17 present and unique. `/about` and `/waitlist` trimmed under ~160; `/help` and `/malls/bbs-mall` extended into the snippet window | Same presence-only guard caveat as item 11 | Optional guard tightening | eng |
| 13 | Social-share / Open Graph image and metadata | Implemented | 13 `opengraph-image.tsx` files covering all 13 indexable routes; the four `noindex` legal routes declare `twitter:card=summary` instead of claiming a large card. Guarded by `marketing-crawl-policy.test.ts` | Built HTML: **0** routes declare a large card without an image, down from 11 | None | eng |
| 14 | Maps and directions, if MAANTA has a public physical location | Not applicable yet | MAANTA is not incorporated (`CO-DEMO-0000-NOT-INCORPORATED`, `demo.ts`); only physical presence is a desk inside BBS Mall, a venue it does not own | Publishing a map or address for MAANTA asserts a public place of business that does not exist | No map, no address for MAANTA. Directions **to BBS Mall**, attributed to the mall, only once founder supplies verified detail | founder |
| 15 | Real customer or partner reviews | Not applicable yet | No testimonial, review, rating or partner-logo content renders. `held-claims.test.ts` scans for banned claims | Correct: no customers yet, so no review could be real | Add none. Revisit with named, consenting merchants post-pilot | founder |
| 16 | Meaningful alt text on all content images | Not applicable yet | **Zero** `<img>`/`<Image>` in `(marketing)` or `components/marketing`, and zero in rendered production HTML. All artwork is inline SVG; shell logos `aria-hidden` inside `<a aria-label="MAANTA home">`; no `<svg role="img">` | Nothing to caption | No action. Re-opens the moment the first photograph ships (see item 20) | eng |
| 17 | Appropriate organization and local-business structured data/schema | **Partial** | `structured-data.ts` ships `Organization` (name, url, logo only), `WebSite` (with `publisher` `@id` reference), and `FAQPage` over all 16 Q&A. Verified in built HTML | `BreadcrumbList` still absent on `/merchants/join`. `LocalBusiness` remains **not applicable** — no verified public address, and identifier-bearing schema must wait for incorporation | Add `BreadcrumbList` to `/merchants/join` — Plan Phase 2. Defer `LocalBusiness` indefinitely | eng |
| 18 | Privacy Policy page | **Partial** | `(marketing)/privacy/page.tsx` rendering 15 substantive Kenya-DPA-aware sections; visible DRAFT banner; visible `ODPC-DEMO-0000-NOT-REGISTERED`; `noindex, nofollow` confirmed live | Not an engineering gap. Readiness tracker **`O5` is a blocked GATE** (counsel review, incorporation); **`O6`** (Kenya DPA cross-border basis for Supabase `eu-west-1`) not started | Legal review and the incorporation decision. Engineering side is the flag flip only | legal |
| 19 | Analytics implementation, consent-aware if required | **Partial** | PostHog site-wide via `PostHogClientProvider`, proxied through `/ingest`; named events in `analytics-events.ts`; `persistence: "memory"` (`posthog-provider.tsx`) so nothing is stored on an anonymous device — which is why no banner ships, and `cookie-notice.md` says exactly that | (a) No mechanism for a signed-in user to exercise the choice `/cookies` describes. (b) **Live defect, open as D88**: `analytics-identity.ts` documents that it needs default cookie persistence and that `memory` leaves "no cookie to read" — which is the shipped config, so signed-out server events all fall to `distinct_id_source: 'none'` | Founder decision required (provider, ID, jurisdictions, consent approach) before any banner. D88 resolvable either way — Plan Prerequisites | eng |
| 20 | Authentic team/founder photo or an intentionally appropriate alternative | Implemented | `/about` carries a named founder section with biography and contact, and **no** photograph. The image-free treatment is demonstrably intentional: zero `<img>` on any route, `public/` holds only `icon.svg` + manifest, hero is a CSS mockup, OG images are generated | Reads as the "intentionally appropriate alternative" the item allows. Residual cost is mild | No engineering action. A real photograph is an optional founder-supplied upgrade; it would re-open item 16. Never stock or generated | founder |


**Status counts (current, 2026-08-10 after remediation):** Implemented 10 ·
Partial 4 · Missing 1 · Needs founder input 0 · Not applicable yet 5.

At first audit these were Implemented 6 · Partial 7 · Missing 2 · Not applicable
yet 5. Ten items moved:

| # | Item | At audit | Now | What changed |
|---|---|---|---|---|
| 1 | Custom 404 | Partial | **Implemented** | Marketing chrome, own metadata, recovery links |
| 8 | Response-time promise | Partial | **Implemented** | `/help` now reads `RESPONSE_TIMES`, same constant as `/contact` |
| 10 | `robots.txt` | Partial | **Implemented** | Shopper + auth surfaces disallowed; verified live (**D89** closed) |
| 11 | Unique titles | Implemented | Implemented | `/download` brought onto the naming convention |
| 12 | Unique descriptions | Implemented | Implemented | Four lengths resized to the snippet window |
| 13 | OG image + metadata | Partial | **Implemented** | 6 → 13 images; legal routes declare `summary` |
| 17 | Structured data | Missing | **Partial** | `Organization` + `WebSite` + `FAQPage` shipped; `BreadcrumbList` still absent |
| 5 | Breadcrumbs | Not applicable yet | Not applicable yet | Reasoning sharpened: `/malls` 404s, so a naive trail breaks |
| 20 | Founder photo | Needs founder input | **Implemented** | Reclassified: the image-free treatment is demonstrably intentional |
| — | Trading claims (**D87**, **D90**) | — | Closed | 21 claims + status dots gated on `DEMO_MODE`, production-verified |

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
   Drift **D89**.
2. **Resolve the "Live at" contradiction (items 12, 13).** Four surfaces assert
   trading while the footer of every page denies it, and the guard named for
   this catches none of them. Needs a founder ruling first (is "Live at BBS
   Mall" acceptable pre-launch?), then alignment of the homepage hero,
   `/about`'s description and OG description, and `/about`'s OG image — plus a
   guard whose assertion matches its name. Drift **D87**.
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
correct policy; `robots.ts` never implemented it. Recorded as **D89**.

**2 · Pre-launch trading claims leak past a mis-scoped guard.** Every page
footer renders "MAANTA APP is not yet trading" alongside a regulatory-status
disclosure, and the company is neither incorporated nor ODPC-registered. Against
that, **twenty-one** surfaces assert the opposite — the ten below, plus eleven more found while implementing the ruling and listed in the D87 section at the end:

> **Correction, 2026-08-10.** The first version of this report said five, then
> ten. The final count, from implementing the fix, is **twenty-one**. The one
> missed first matters most: `SiteFooter.tsx:57`
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
same vacuous-guard pattern as **D38**. Recorded as **D87**.

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
| 1 | ~~**Is "Live at BBS Mall" acceptable pre-launch?**~~ — **answered** | A commercial and legal positioning call. **Ruled 2026-08-10: drop it everywhere.** Implemented and guarded on this branch; see the D87 section. Not live until the branch deploys |
| 2 | **Lawyer review of the four legal drafts, and the incorporation decision behind it** | Readiness tracker `O5`, blocked. Gates the removal of the DRAFT banners and the placeholder identifiers |
| 3 | **Kenya DPA cross-border basis for Supabase `eu-west-1`** | Readiness tracker `O6`, not started. Determines what `/privacy` §12 may honestly say |
| 4 | **Analytics consent posture for signed-in users** | Provider, measurement ID, lawful basis and target jurisdictions must be settled before any banner or opt-out is built. The current cookieless anonymous posture is already ruled and is fine |
| 5 | **Founder photograph — optional upgrade, not a gap** | The text-only treatment already reads as intentional (item 20). A real photograph would strengthen `/about`; it is an asset the founder supplies or declines, and must not be sourced or generated |
| 6 | **BBS Mall verified address, opening hours and floor detail** | Needed before `/malls/bbs-mall` can stop being a stub. Attributable to the mall, not to MAANTA |
| 7 | **Whether the pilot may be written up, and by whom** | Determines when items 6 and 15 stop being deferred |
| 8 | ~~**Drift-row numbering**~~ — **resolved** | The rows opened here were D83–D86; `main` landed its own D83–D86 first (payments, identity, privacy, migrations), so per the convention recorded on the PR #185 branch — whichever lands second renumbers — **these became D87 (trading claims), D88 (analytics attribution), D89 (crawl policy) and D90 (present-tense operations)**. Every reference in this document and in the marketing source was renumbered with them; the security and migration rows on `main` were not touched |

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
   pinning `robots.ts` and `sitemap.ts` to the same policy. *(blocker 1, D89)*
2. **Founder ruling on "Live at"**, then align the homepage hero, `/about`
   metadata and OG description, and `/about`'s OG image; fix
   `prelaunch-consistency.test.ts:72` so its assertion matches its name.
   *(blocker 2, D87)*
3. **404 rebuild** — marketing shell, own metadata, real recovery links.
4. **Four OG images** for the commercial and acquisition routes.
5. **JSON-LD**: `FAQPage`, `WebSite`, minimal `Organization` — no address, no
   identifiers, no `LocalBusiness`.
6. **`/help` parity**: response times from the shared constant, plus an `<h1>`.
7. **Copy and convention fixes**: `/download` title, `/about` grammar.
8. **Sticky mobile CTA** on `/merchants` and `/shoppers`, replacing the visible
   amber action while shown.
9. **Confirmation route** for the three forms, keeping the inline success state.
10. **Resolve D88** — decide whether signed-out server-side attribution is
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

### D87 — ruled and implemented, 2026-08-10

The founder ruled: **drop "Live at" everywhere.** Implemented in the same
branch, and the implementation corrected this report twice more.

**The count was ten in this document and twenty-one in reality.** The missing
eleven were the shapes a search for the literal string "Live at" does not
find: two CTA labels ("See what's live at BBS Mall", on `/` and `/shoppers`),
the `/shoppers` closing CTA band title, five prose sentences across `/shoppers`,
`/about` and `/mall-operators`, the `/faq` meta description ("where it is
live"), and `/malls/bbs-mall`'s "LIVE NOW" badge and "Live now · Nairobi" line —
the same claim in different words. The lesson is the same one that produced the
first undercount: auditing for a string rather than for the claim.

**All twenty-one now resolve through `lib/marketing/live-claims.ts`,** gated on
`DEMO_MODE`. That is deliberate rather than a find-and-replace: the claim spread
because each instance was written as a literal at its point of use, which is how
`og.tsx` came to carry a carefully hedged status line while the footer asserted
the opposite directly beneath it. One flag now restores every one of them at
launch — the rule `demo-mode-spec.md` §5 already applies to the disclosures that
contradicted them.

**The amber status dot went with the words.** `LiveDot` renders nothing while
`DEMO_MODE` holds, and so does the dot in the OG image footer. A live-status
indicator beside a bare place name carries the same claim in colour alone, which
frozen UI rule 4 forbids — state is an icon *and* a word, readable in greyscale.
Dropping the sentence and keeping the dot would have moved the claim somewhere
harder to audit.

**The guard is fixed, which was the other half of the row.**
`prelaunch-consistency.test.ts` already had a correct `TRADING` regex — its
body-walk test just did not use it, testing a narrower one instead. It now uses
it, widened for the `Live now ·` and screaming-caps badge shapes, with the
badge matched case-sensitively so `/shoppers`' legitimate "Live now" deal-filter
chip is untouched. Verified non-vacuous by reintroducing the claim on
`/merchants` and watching it fail on the right line.

**Verified in rendered output, not source:** a scan of all built HTML for
`live at`, `now live at`, `already live`, `is live in`, `live now ·` and `LIVE
NOW` returns **zero hits**, and the replacement copy renders on all six affected
pages.

**D87 is not closed by this commit, and its close conditions are now recorded**
(founder, 2026-08-10). All three are required, in order: the fix is deployed to
production; the **deployed** HTML — not the repo, and not a preview alias
standing in for it — is checked for the prohibited phrases and the live-status
indicators; and the deployment SHA, timestamp and that evidence are written into
the register. Commit `04324f9` proves the repo is fixed and proves nothing about
what the public site serves. `pending-deploy` is not available as an
intermediate here: the schema guard requires that status to name an unapplied
migration, and this is a code fix, so `open` carries the not-yet-live meaning.

**The residue became its own row, deliberately: D90.** The site still says in the
present tense that MAANTA is operating at BBS Mall, in prose that never uses the
word "live" — `/malls/bbs-mall`'s "where the product is run in person" and
"shops here publish deals from a phone", and `/shoppers`' "the shops there are
the ones publishing deals today". (A comparable line on `/about` sits inside the
`SCENARIO.isScenario` branch, so production never renders it.) These assert
current operation as plainly as "Live at BBS Mall" did, which means **the D87
guard passing does not mean the site has stopped claiming to trade.**

It is not folded into D87 because it is not the same kind of problem. D87 was
one phrase with twenty-one instances and a single correct answer. This is the
voice the site is written in, and it is a factual question before it is a copy
question: *is MAANTA operating at BBS Mall today?* If no, the prose is rewritten
as pilot or future tense and gated alongside the D87 wording so one flag still
governs launch state. If yes, it stands — but it then has to be consistent with
**D14**, which has `demo_mode_enabled` true on production, so the deals a
visitor actually sees are synthetic. Both cannot be presented as true without
saying which is which.

### D90 — ruled and implemented, 2026-08-10

**Founder ruling: MAANTA is demo / pre-launch and is not currently operating a
public deal, claim or redemption programme at BBS Mall.** The present-tense
operating claims are rewritten as demo, preparation or future-tense copy, gated
on `DEMO_MODE` through `live-claims.ts` like the D87 wording, so launch restores
the operating voice in one flag.

**Routes changed:** `/malls/bbs-mall` (intro, feed note, meta description, hero
badge dot) · `/shoppers` (hero subheading, "Where it works" sentence) · `/`
(shopper card in the three-door router) · `/pricing` (closing CTA title) ·
`/faq` and `/mall-operators` (the "how long before we see anything meaningful"
answer) · `/mall-operators` (Node 0 reference paragraph) · `SiteFooter`, which
appears on every page.

**Two things were found only by scanning built output, and both matter more than
the copy edits.**

The first: `/mall-operators` said "where the product is being run in **person**"
with the phrase wrapped across two source lines. A `grep` missed it and the
guard missed it, because the guard matched line by line — so whether a claim was
caught depended on where Prettier happened to wrap the sentence. The guard now
collapses whitespace and matches whole files. It caught this immediately.

The second: `SiteFooter` wrote its own amber status dot instead of using
`LiveDot`, so suppressing that component under D87 never reached it. Every page
on the site kept rendering a live-status indicator beside the location, a few
inches above `PrelaunchNotice` saying MAANTA is not yet trading. **A claim made
in colour leaves no phrase to grep for** — it was found by scanning built HTML
for the *markup*, not the copy, and that scan is now part of the checklist.

**Deliberately excluded**, because they do not claim the company is operating:
the `/shoppers` "Live now" deal-filter chip and "Browse live deals" (a *deal*
being live is product vocabulary); "a mall goes live" as a future event; "the
way it does today" about a merchant's existing till; and the "operating report"
product name.

**One residual, left on purpose.** The amber dot inside `HeroShot` on `/`
survives. It sits in an `aria-hidden` mockup that carries an `sr-only`
description and a visible "Illustration · example shops and prices" caption, and
it is part of depicting the product's own UI — a screenshot of a live chip, not
a claim. That mockup is founder-decided territory under **D50**, so changing it
is a D50 decision rather than this one. Worth knowing that the visible caption
is still the smallest, lowest-contrast text on the page while the synthetic rows
beside it are full size.

### Deliberately not fixed

| Item | Why |
|---|---|
| **D88** — signed-out analytics attribution | Needs a decision: restore cookie persistence behind consent, or retire the cookie-reading path and accept unattributed server events. A guard alone would go red immediately, which is a decision made by omission |
| 18 · Legal drafts (`O5`, `O6`) | Blocked on counsel review and the incorporation decision. Not an engineering task |
| 9 · Sticky mobile CTA | Frozen UI rule 1 caps a screen at one amber action, so a sticky bar must **replace** the visible CTA rather than add to it. That is a design decision about which surfaces get one |
| 4 · Confirmation routes | The inline success state works and conversions are already measurable via `marketing_form_submitted`. A dedicated URL changes three conversion flows and wants its own review |
| `/malls/bbs-mall` build-out | Needs founder-supplied mall detail — address, hours, floor guide |
| 6, 14, 15, 20 | Deferred pending pilot evidence, a verified location, consenting merchants, and a founder asset |

---

## Production verification, 2026-08-10

**Deployed and verified on the real domain.** Commit
`77983b68cd8b6bc3af6cce000723c4ec0e55fdb1` (squash merge of PR #196 to `main`),
Vercel deployment `dpl_5626CAFiu9zrNx6mjqJcZpAfuBWT`, target production, **READY
2026-08-10 16:28:47 UTC**, holding the `www.maanta.app` and `maanta.app`
aliases. Checked against `https://www.maanta.app` — not a preview alias, not
localhost, not the repo. All 14 marketing routes returned HTTP 200 with `age: 0`.

**Trading and operating claims: zero.** The deployed HTML — visible text *and*
raw markup including the inlined RSC payload — was scanned for `live at`, `now
live at`, `already live`, `is live in`, `live now`, `run in person`, `publishing
deals today/now`, `offering right now`, `usually happens/takes`, `first deal
today`, `is operating/running/trading`, and case-sensitive `LIVE NOW`. One match
site-wide: `/shoppers` renders "Live now" as the name of an in-app feed filter
chip, beside "Expiring soon", "Flash" and "Today". That is deal vocabulary, not
a company claim, and is the documented exclusion.

**Status indicators: gone, with one documented exception.**
`rounded-full bg-verified` has zero occurrences site-wide — the `/malls/bbs-mall`
badge dot is suppressed. The footer place line resolves its dot slot to `null` on
every route (RSC children `[null,"BBS Mall, Eastleigh · Nairobi"]`), so no
live-status dot precedes a place name anywhere. The exception is the amber dot in
the home hero mockup: `aria-hidden="true"`, sitting under the rendered sentence
"The shops and prices shown are invented examples, not real offers". It belongs
to **D50** and removing it is a D50 decision.

**Disclosure intact.** "MAANTA APP is not yet trading" renders on all 14 routes,
with the regulatory-status block. `/privacy` is still `noindex, nofollow`. All
12 expected pre-launch replacement phrases render.

**Crawl policy live.** `robots.txt` went from 11 rules to 27, and `sitemap.xml`
(`lastmod 2026-08-10T16:28:00.414Z`, 13 routes) advertises none of them — the
two files agree in production.

**D87, D89 and D90 are closed on this evidence. D88 stays open** — signed-out
analytics attribution needs a founder decision, not code.
