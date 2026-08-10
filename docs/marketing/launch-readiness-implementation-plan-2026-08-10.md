# MAANTA Marketing Site — Launch Readiness Implementation Plan

**Date:** 2026-08-10 · **Source:** `docs/marketing/launch-readiness-audit-2026-08-10.md`
· **Baseline:** `main` @ `7b2b097`; production serving `77983b6` via
`dpl_5626CAFiu9zrNx6mjqJcZpAfuBWT` (READY 16:28:47 UTC), verified at
`https://www.maanta.app`.

**This document proposes work. It implements none of it.** No application code,
content, metadata, asset, analytics or deployment configuration was changed in
the pass that produced it.

---

## Goal

Get the marketing site to the smallest credible public-launch scope: clear
positioning, working conversion paths, unique metadata, appropriate crawl
controls, accessible markup, and trust signals that are true today.

The audit's launch blockers are already closed and live. What remains is one
missing conversion affordance, three partials, and a set of items that are
correctly waiting on evidence that does not exist yet. **Nothing below is
required to keep the site honest** — that work shipped. This is the difference
between "not misleading" and "converting well".

The bar every item is held to: *would this still be true if a mall operator
checked it?*

---

## Scope boundaries

**In scope.** The 17 routes under `maanta-app/src/app/(marketing)/`, the shared
marketing libraries in `src/lib/marketing/`, the marketing shell components, the
Next.js file conventions that serve them (`robots.ts`, `sitemap.ts`,
`not-found.tsx`), and the guard suites in `src/lib/__tests__/`.

**Out of scope.** The shopper, merchant, admin, agent and founder app surfaces.
Database migrations. Payment paths. Anything under `supabase/`. The
`DEMO_MODE` flag itself — flipping it is a launch-checklist decision, not a
marketing task.

**Explicitly not proposed anywhere in this plan:**

- invented testimonials, reviews, case studies, metrics, partner logos, office
  locations, staff biographies or team photos
- maps, directions or `LocalBusiness` schema — the audit found no verified
  public office intended for visitor use, and MAANTA is not incorporated
- new legal copy written as final text
- analytics, tracking pixels, cookies or consent tooling without the named
  founder decisions in Prerequisites below
- any change to `HeroShot`, which is founder-decided territory under **D50**

---

## Prerequisites and founder decisions

Nothing in Phase 1 depends on these. Phase 2 partially does; Phase 3 entirely
does.

| # | Decision or asset | Blocks | Why it cannot be decided in the repo |
|---|---|---|---|
| P-1 | **Analytics consent posture.** Required before any banner or opt-out: (a) provider — PostHog is already integrated; (b) property / measurement ID; (c) target jurisdictions; (d) consent approach (none / implicit / explicit). | Item 19; any consent UI | A lawful basis is a legal position, not a component |
| P-2 | **D88 — signed-out attribution.** Either restore cookie persistence *behind* the P-1 consent decision, or retire the cookie-reading path in `analytics-identity.ts` and accept unattributed signed-out server events. | Item 19 | Both are defensible; picking is a product call about data quality vs. device storage |
| P-3 | **Counsel review of the four legal drafts, and the incorporation decision behind it.** Readiness tracker `O5`, blocked. | Item 18; removing DRAFT banners and placeholder identifiers | Legal |
| P-4 | **Kenya DPA cross-border basis** for Supabase `eu-west-1`. Tracker `O6`, not started. | What `/privacy` §12 may honestly say | Legal |
| P-5 | **BBS Mall verified detail** — address, opening hours, floor guide — *and* whether MAANTA may publish them. | `/malls/bbs-mall` build-out; any directions content | Facts about a third party's premises |
| P-6 | **Whether the pilot may be written up, by whom, and with which figures.** | Phase 3 entirely (items 6, 15) | Only the founder knows what is agreed and true |
| P-7 | **Founder photograph**, or explicit confirmation the text-only `/about` stands. | Optional upgrade to item 20; re-opens item 16 | An asset. Must not be stock or generated |
| P-8 | **D50 — the hero mockup's amber status dot.** Whether a live-status dot may sit beside "BBS Mall" inside an `aria-hidden`, disclaimed illustration. | The one status indicator left on production | Already a founder-decided surface |

---

## Phase 1 — Safe engineering quick wins

No founder input. No new claims. Each is independently shippable and reversible.

### 1.1 · `BreadcrumbList` JSON-LD on `/merchants/join` — P1

**Problem it solves.** `/merchants/join` is a depth-2 route with a real parent.
Search results render its raw URL path instead of a readable trail, which costs
click-through on the merchant conversion page.

**Founder input:** none. **Files:** `src/lib/marketing/structured-data.ts` (add
`breadcrumbListSchema()`), `src/app/(marketing)/merchants/join/page.tsx` (render
via existing `<JsonLd>`).

**Do not** add it to `/malls/bbs-mall`. `/malls` has no `page.tsx` and returns
404, so a "Home / Malls / BBS Mall" trail would ship a crumb pointing at a dead
URL. That becomes available only if P-5 produces a real `/malls` index.

**Acceptance criteria.** `/merchants/join` emits one `BreadcrumbList` with two
items (`/merchants` → `/merchants/join`), both resolving 200. Existing
`Organization`/`WebSite`/`FAQPage` blocks unchanged. Built HTML parsed and
validated, as the current JSON-LD was.

**Implications.** SEO gain, no accessibility or privacy surface, no visible copy.

### 1.2 · Tighten the metadata guard to assert *uniqueness* and length — P1

**Problem it solves.** Two pages sharing a title share one search snippet.
`marketing-a11y.test.ts` currently checks that each page *has* a title and
description, not that they differ or fit. Today all 17 are unique — this stops
that being luck.

**Founder input:** none. **Files:**
`src/lib/__tests__/marketing-a11y.test.ts`.

**Acceptance criteria.** Guard fails on a duplicated title or description across
the 17 routes, and on a description outside ~120–160 characters. Passes on
current `main` with no copy changes. Proven non-vacuous by temporarily
duplicating a title and observing the failure.

**Implications.** Prevents an SEO regression; no runtime effect.

### 1.3 · `/help` heading-order and `/download` copy consistency sweep — P2

**Problem it solves.** Residual polish from the audit. `/help` gained its `<h1>`
in remediation; this is a sweep for any remaining heading-order break or
wordmark casing drift across the other 16 routes.

**Founder input:** none. **Files:** whichever routes the sweep implicates; none
expected.

**Acceptance criteria.** Every marketing route has exactly one `<h1>` and no
skipped heading level, asserted in a guard rather than checked by hand.

**Implications.** Accessibility (screen-reader document outline).

### 1.4 · Guard the OG-image/`twitter:card` invariant against *new* routes — P2

**Problem it solves.** The invariant is already enforced by
`marketing-crawl-policy.test.ts`. This is a documentation-only addition to
`CLAUDE.md`'s marketing section so the rule is discoverable before someone adds
route 18 and trips the guard without knowing why.

**Founder input:** none. **Files:** `CLAUDE.md`.

**Acceptance criteria.** The marketing section states the rule and names the
guard. No test change.

---

## Phase 2 — Conversion and trust improvements

Larger, user-visible, and where the remaining measurable upside is.

### 2.1 · Sticky mobile CTA on `/merchants` and `/shoppers` — P0 *(the only Missing item)*

**Problem it solves.** On the two longest conversion pages the primary action
scrolls out of view within one screen and never returns. In a mobile-dominant
market that is the single largest conversion gap the audit found.

**Founder input:** none, but **design sign-off recommended** — this is the one
item where the frozen UI rules and the goal pull against each other.

**Files:** a new `src/components/marketing/StickyCta.tsx`; mounted in
`(marketing)/merchants/page.tsx` and `(marketing)/shoppers/page.tsx`.

**Hard constraint.** Frozen UI rule 1 caps a screen at **one** amber action. The
sticky bar must therefore *replace* the visible amber CTA while shown — appear
only once the hero CTA has scrolled out of view, and carry the same target and
label. Two amber actions on screen at once fails
`frozen-ui-rules.test.ts` and, more importantly, fails the rule it encodes.

**Proposed copy.** Reuse each page's existing hero CTA verbatim — "List your
shop" (`/merchants` → `/merchants/join`), "Browse live deals" (`/shoppers` →
`/feed`). No new copy, so no new claims.

**Acceptance criteria.** Bar appears only after the hero CTA leaves the
viewport; exactly one amber action on screen at any scroll position; hidden at
`sm` and above; does not overlap the footer's legal bar; respects
`prefers-reduced-motion`; keyboard reachable and not a focus trap.

**Implications.** Conversion (positive). Accessibility risk if it covers content
or steals focus — hence the criteria. No SEO or privacy surface.

### 2.2 · Shared confirmation route for the three lead forms — P1

**Problem it solves.** `/contact`, `/waitlist` and `/merchants/join` confirm
inline. That is good UX and it is *not* wrong — but there is no bookmarkable
confirmation, nothing to share, and no destination URL to use as a conversion
goal. Conversions are currently only measurable as the
`marketing_form_submitted` event.

**Founder input:** none for the mechanism. If the confirmation is to state a
turnaround, it must read `RESPONSE_TIMES` rather than restate it.

**Files:** new `(marketing)/thank-you/page.tsx` taking a `?from=` parameter;
`components/marketing/EnquiryRouter.tsx`, `(marketing)/waitlist/page.tsx`,
`(marketing)/merchants/join/page.tsx`.

**Keep the inline state.** Add the route as an *additional* path, not a
replacement — a redirect-on-submit loses the `aria-live` announcement that
currently serves screen-reader users well.

**Proposed copy (honest without founder facts).** "Message sent." / "You're on
the waitlist." / "We have your shop details." plus, from `RESPONSE_TIMES`, the
turnaround already published on `/contact`.

**Acceptance criteria.** Route renders standalone, is `noindex` (a confirmation
page has no search value and must not be indexed), reachable only after a real
submission, and the inline state still announces. Turnaround text reads from the
constant.

**Implications.** Conversion measurement (positive). SEO: must be `noindex`.
Accessibility: inline announcement preserved.

### 2.3 · `/malls/bbs-mall` build-out — P2, **blocked on P-5**

**Problem it solves.** The Node 0 page is linked from every footer and is three
paragraphs. It is the page a curious shopper or a prospective mall lands on.

**Founder input required:** P-5. Without verified mall detail this stays as is.

**Files:** `(marketing)/malls/bbs-mall/page.tsx`; any new wording through
`src/lib/marketing/live-claims.ts` so it stays `DEMO_MODE`-gated.

**Explicitly not proposed:** a map, an address presented as MAANTA's, opening
hours, or a shop count. The first two are ruled out by the audit; the last two
need P-5.

**Acceptance criteria.** Every added fact traceable to founder-supplied detail.
No present-tense operating claim — the `prelaunch-consistency` guard must pass
unchanged.

---

## Phase 3 — Content requiring authentic evidence

**None of this is buildable now, and attempting it is the failure mode the
`held-claims` guard exists to prevent.** Listed so the trigger is recorded.

### 3.1 · Pilot methodology / "What partners can measure" — P2, blocked on P-6

Not a case study. A page describing *what will be measured and how* — verified
redemptions, per-floor and per-hour patterns, the operating report — with no
outcome claimed. Buildable the moment P-6 is answered, and honestly buildable
*before* results exist, because it describes method rather than results.

**Trigger:** founder confirms the pilot may be described.
**Files:** a new route under `(marketing)/`, plus `nav.ts`.
**Acceptance:** every claim is about method, not outcome. No number that is not
either a frozen constant or rendered through `ScenarioStat`.

### 3.2 · Merchant quotes — P2, blocked on P-6 and named consent

Only with named, consenting merchants and checkable attribution. Anonymous
quotes ("a merchant in Eastleigh") are indistinguishable from invention and must
not ship.

### 3.3 · Founder photograph — P2, blocked on P-7

Re-opens item 16: the alt text requirement arrives with the first photograph and
should be added to that change, not before.

---

## Deferred items

| Item | Why deferred | Revisit when |
|---|---|---|
| Case studies (6) | No completed pilot | P-6 |
| Reviews / testimonials (15) | No customers | P-6 + consent |
| Maps and directions (14) | No verified public office; MAANTA is not incorporated | A real customer-facing location exists |
| `LocalBusiness` schema (17, in part) | Same | Same |
| Identifier-bearing `Organization` fields | `legalName`, `taxID`, registration numbers would all be placeholders | P-3 (incorporation) |
| Alt text (16) | Zero content images site-wide | First photograph ships |
| Consent banner (19) | Cookieless anonymous design removes the need; copy matches behaviour | P-1 |
| Visible breadcrumbs (5) | Flat 17-page IA | A third level appears |
| Removing the `HeroShot` status dot | Founder-decided under **D50** | P-8 |

---

## File-by-file change plan

| File | Phase | Change | Risk |
|---|---|---|---|
| `src/lib/marketing/structured-data.ts` | 1.1 | Add `breadcrumbListSchema()` | Low — additive, existing pattern |
| `src/app/(marketing)/merchants/join/page.tsx` | 1.1 | Render `<JsonLd>` with breadcrumb + existing | Low |
| `src/lib/__tests__/marketing-a11y.test.ts` | 1.2, 1.3 | Assert title/description uniqueness + length; heading order | Low — test only; may surface existing copy issues |
| `CLAUDE.md` | 1.4 | Document the OG/`twitter:card` rule | None |
| `src/components/marketing/StickyCta.tsx` | 2.1 | **New** | Medium — frozen UI rule 1, a11y |
| `src/app/(marketing)/{merchants,shoppers}/page.tsx` | 2.1 | Mount sticky CTA | Medium |
| `src/app/(marketing)/thank-you/page.tsx` | 2.2 | **New**, `noindex` | Low |
| `src/components/marketing/EnquiryRouter.tsx` | 2.2 | Offer the route without removing inline state | Medium — D28/D41 territory; this form has broken twice |
| `src/app/(marketing)/waitlist/page.tsx` | 2.2 | Same | Medium — only dynamically-rendered route |
| `src/app/(marketing)/merchants/join/page.tsx` | 2.2 | Same | Low |
| `src/app/(marketing)/malls/bbs-mall/page.tsx` | 2.3 | Build-out | **Blocked** on P-5 |
| `src/lib/marketing/live-claims.ts` | 2.3 | Gate any new node wording | Low — established pattern |
| `docs/maanta-drift-register.md` | all | A row per behaviour change | None |

**Two files deserve extra care.** `EnquiryRouter.tsx` has shipped a broken
contact form twice — **D28** (posted nowhere while claiming success) and **D41**
(zero `<form>` elements in server HTML beneath a published reply promise). Any
change there must be verified in *built* output, not source. And `/waitlist` is
the only marketing route rendered per-request, so it has no build artefact for
`check-canonicals` or `check-server-forms` to inspect — it must be checked
against a live response.

---

## Acceptance criteria

A phase is done when all of the following hold.

**Universal, every phase.**

1. `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` all green
   from `maanta-app/` — including `check:tokens`, `check:canonicals`,
   `check:forms`.
2. `prelaunch-consistency.test.ts` and `marketing-crawl-policy.test.ts` pass
   **unchanged** — neither weakened to accommodate new copy.
3. Built HTML scanned for the prohibited trading/operating phrases *and* for
   status-indicator markup: no new hits.
4. No new number, claim or proper noun that is not either a frozen constant, a
   founder-supplied fact, or rendered through `ScenarioStat`.
5. A drift-register row for any behaviour change, closed only on deployed
   evidence.

**Phase-specific.** As stated per item above.

---

## Test and verification plan

**Local, before any PR** — from `maanta-app/`, never the repo root (a run from
the root picks up the wrong config and reports dozens of phantom failures):

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

**Guard-specific.** For every new or widened guard: add the assertion, then
**prove it fails** by reintroducing the defect and confirming it reports on the
right file, then restore and confirm green. A guard that has never failed is a
guard nobody has tested — the lesson of **D38**, and of the line-by-line hole
found in the D90 pass.

**Built-output scanning.** Source greps are necessary and not sufficient. The
D90 pass found a claim wrapped across two source lines that `grep` and a
line-based guard both missed, and a claim carried in colour with no text to grep
at all. Both surfaced only in built HTML. So:

- scan `.next/server/app/**/*.html` for the phrase list, and
- scan for status-indicator markup (`rounded-full bg-brand|bg-verified`),
  checking the text that follows each.

**Production verification, after deploy.** Against `https://www.maanta.app` —
the real domain, not a preview alias, not localhost. Record the deployment SHA,
timestamp and the scan result in the drift register. Note for whoever runs it:
`curl` and `WebFetch` are blocked by the session egress proxy for this domain;
the Vercel MCP fetch tool reaches it.

**Manual checks that no test covers.** Sticky CTA at 320px, 375px and 768px with
a keyboard; confirmation route reached by a real submission in each of the three
forms; `/waitlist` against a live response rather than a build artefact.

---

## Rollback considerations

**Low-risk, revert-by-commit.** 1.1, 1.2, 1.3, 1.4, 2.2 — additive, no shared
state, no data.

**Needs a plan.** 2.1: a sticky element that mis-measures scroll position could
cover content on a device nobody tested. Ship behind a component that renders
`null` by default and is mounted on two routes, so reverting is deleting two
mount points rather than untangling a layout.

**Deployment rollback.** Vercel keeps prior production deployments as rollback
candidates. The most recent known-good is
`dpl_5626CAFiu9zrNx6mjqJcZpAfuBWT` (`77983b6`). A rollback restores the
site but **not** the drift register — if a row was closed on a deploy that gets
rolled back, the row must be reopened, or the register starts lying.

**What cannot be rolled back.** Anything indexed. If a confirmation route ships
without `noindex` and is crawled, removing it later leaves the URL in the index
for weeks. This is why 2.2's `noindex` is an acceptance criterion and not a
detail.

**Nothing in this plan touches the database**, so there is no migration to
reverse and no `pending-deploy` state to manage.
