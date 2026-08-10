# MAANTA Marketing Launch Baseline — Implementation Record

**Date:** 2026-08-10 · **Mode:** Builder · **Branch:** `claude/maanta-launch-baseline-b9ytep`
· **Base:** `7b2b097` (`main`, "Close D87, D89, D90: production-verified after deploy")

## Read this first: most of the requested baseline was already live

The task brief was written against
`docs/marketing/launch-readiness-audit-2026-08-10.md` and a companion
implementation plan. **The plan document does not exist in this repository** —
`docs/marketing/` contains only the audit. The audit was used as the sole source
of truth, and every claim in it was re-verified against the repo rather than
taken on trust.

That verification changed the shape of the work. The audit's own *Remediation
status* section records a fix pass that merged as PR #196 (`77983b6`) and PR #197
(`7b2b097`) and was **verified on the live `www.maanta.app` domain on
2026-08-10**. Ten of the eleven in-scope items in the brief were already
implemented and serving in production before this session began:

| Brief item | State on arrival | Where |
|---|---|---|
| A1 · Custom 404 | **Done** — marketing shell, own title/description, `openGraph: null`, four recovery links, skip link, real HTTP 404 | `maanta-app/src/app/not-found.tsx` |
| A2 · `robots.txt` | **Done** — 27 rules; shopper, auth and rehearsal surfaces disallowed; `$`-anchored `/merchant` so `/merchants` stays crawlable (D89 closed) | `src/app/robots.ts` ← `lib/marketing/nav.ts` |
| A3 · Sitemap | **Done** — 13 routes generated from `SITEMAP_ROUTES`; legal routes excluded because they are `noindex`; no app or auth routes | `src/app/sitemap.ts` |
| A4 · Per-page metadata | **Done** — all 17 routes carry unique title, unique description, self-referential canonical, full `og:*`/`twitter:*`; `viewport` exported from the root layout | `lib/marketing/page-metadata.ts` |
| A5 · Social-share image | **Done** — 13 `opengraph-image.tsx` including a group-level default; the four `noindex` legal routes declare `twitter:card=summary` rather than promising a large card | `(marketing)/**/opengraph-image.tsx` |
| B6 · Above-fold CTA | **Done** — one amber primary per screen, outlined secondary | `AudienceHero` in `components/marketing/sections.tsx` |
| B7 · Internal links | **Done** — header, three footer columns and sitemap all read `nav.ts`; no orphan routes | `lib/marketing/nav.ts` |
| C9 · Image alt text | **Vacuous** — zero `<img>` and zero `<Image>` on the marketing site; all artwork is inline decorative SVG | — |
| C10 · FAQ | **Done** — 16 server-rendered Q&A pairs as `<details>/<summary>` | `(marketing)/faq/page.tsx` |
| C11 · Structured data | **Done** — `FAQPage` on `/faq`, `Organization` + `WebSite` on `/`; name, url and logo only, no address, no `LocalBusiness`, no identifiers, no ratings | `lib/marketing/structured-data.ts` |

**One in-scope item was genuinely missing: B8, the sticky mobile CTA.** The audit
recorded it as item 9, status Missing, and deliberately declined to build it —
"Frozen UI rule 1 caps a screen at one amber action, so a sticky bar must
*replace* the visible CTA rather than add to it. That is a design decision about
which surfaces get one." The brief resolves that decision by asking for it, so it
was built.

Rather than stop there, one further thing was hardened, because it is the seam
where the audit found the site is correct by care rather than by enforcement —
see *SEO and crawl-control decisions*.

---

## Scope implemented

1. **Sticky mobile CTA** on `/merchants` and `/shoppers`, the two long
   conversion pages, mounted nowhere else.
2. **`data-amber-cta` marker** on in-flow amber actions, so the sticky bar has
   something to yield to and frozen UI rule 1 is enforced mechanically rather
   than by layout convention.
3. **A fourth post-build gate**, `check:metadata`, asserting title and
   description uniqueness and description length across every prerendered public
   route plus the 404.
4. **Two over-length meta descriptions fixed** — found by that gate on its first
   run, not by inspection. Recorded as drift **D91**.
5. **An alt-text guard** that asserts nothing today and fails the moment the
   first image ships without a caption.

Nothing else was touched. In particular the CTA destinations, the copy, the
legal documents, the analytics posture and the demo-mode gating are unchanged.

## Files changed

**New**

| File | What it is |
|---|---|
| `maanta-app/src/components/marketing/StickyCta.tsx` | The sticky bar. Client component; renders `null` unless no in-flow amber action is on screen |
| `maanta-app/scripts/check-metadata.mjs` | Post-build gate: unique titles, unique descriptions, 50–160 char window |
| `maanta-app/src/lib/__tests__/marketing-sticky-cta.test.ts` | 13 assertions covering the bar's constraints and its blast radius |
| `docs/marketing/launch-baseline-implementation-2026-08-10.md` | This file |

**Modified**

| File | Change |
|---|---|
| `maanta-app/src/components/marketing/tracked.tsx` | `TrackedLink` gains an optional `amberCta` prop, rendered as `data-amber-cta` |
| `maanta-app/src/components/marketing/sections.tsx` | `CtaPrimary` sets `amberCta`, so every hero and closing-band primary is marked by using the primitive |
| `maanta-app/src/components/marketing/SiteHeader.tsx` | Both amber CTAs (desktop bar, mobile sheet) carry the marker |
| `maanta-app/src/app/(marketing)/merchants/page.tsx` | Mounts `<StickyCta label="List your shop" href="/merchants/join" />` |
| `maanta-app/src/app/(marketing)/shoppers/page.tsx` | Mounts `<StickyCta label="Browse live deals" href="/feed" />` |
| `maanta-app/src/app/(marketing)/page.tsx` | Meta description 168 → 154 chars (D91) |
| `maanta-app/src/app/(marketing)/help/page.tsx` | Meta description 162 → 154 chars (D91) |
| `maanta-app/package.json` | `check:metadata` script; chained into `build` with `&&` |
| `maanta-app/src/lib/__tests__/build-gates.test.ts` | New gate added to `GATES`; stale "two checks" count corrected to four |
| `maanta-app/src/lib/__tests__/marketing-a11y.test.ts` | Alt-text guard |
| `docs/maanta-drift-register.md` | **D91** opened and closed |

## Route and metadata inventory

17 `page.tsx` files under `(marketing)`. 13 in the sitemap, 4 legal routes
`noindex, nofollow` and deliberately absent from it. `check:metadata` inspected
**17 routes** (16 prerendered + the 404) and reported clean; `/waitlist` renders
per request and has no build artefact, so it is named as uninspected rather than
silently skipped — same contract as the other three gates.

Verified in built HTML this session:

- `/` description 154 chars, `/help` 154, `/about` 150 — all inside the window.
- No two routes share a `<title>` or a description, the 404 included.
- All 16 prerendered routes carry a self-referencing canonical and `og:url`
  (`check:canonicals`).
- `data-amber-cta` appears **3 times** in each of `merchants.html` and
  `shoppers.html` — hero primary, closing band primary, header desktop CTA. The
  mobile sheet's CTA is conditional and correctly absent from server HTML.

## SEO and crawl-control decisions

**No change to `robots.ts` or `sitemap.ts`.** Both were fixed and
production-verified under D89 on 2026-08-10, and `marketing-crawl-policy.test.ts`
already asserts that every route in the app is either in the sitemap, a `noindex`
legal route, or disallowed. Re-deriving that policy here would have created a
second place to enforce one rule.

**A fourth build gate was added, and it was not cosmetic.** The audit recorded,
under item 11, that the existing metadata guard "checks *presence*, not
*uniqueness* or length, so a future duplicate would pass" — and recommended
tightening it only as an optional quick win. That gap was live: `/` shipped a
168-character description that had never been measured, and `/help` shipped 162
because the audit's own remediation pass *extended* it toward the window and
overshot. Both were found by the new gate on its first run against a clean build.

It reads rendered `<head>` rather than source because descriptions are template
literals interpolating `FACTS` — `/merchants` interpolates the success fee,
`/shoppers` the grace period — so rendered length is not computable from JSX. Per
`CLAUDE.md`, a guard needing rendered output belongs in a build script, since CI
runs `test` before `build` and `.next/` does not exist at test time.

The 404 is inside the uniqueness scan on purpose: the duplicate-metadata defect
that actually shipped on this site was `not-found.tsx` inheriting the root
layout's title and description. Uniqueness is now checked at the place it failed.

**Deliberately not added:** no `LocalBusiness`, no address, no `aggregateRating`,
no `BreadcrumbList`. The last one is worth a note — `/merchants/join` is two
segments deep and would take a crumb trail, but `/malls` has no `page.tsx` and
404s, so a "Home / Malls / BBS Mall" trail would ship a broken middle crumb. It
waits for a real `/malls` page.

## Accessibility improvements

- **Alt-text guard.** Zero images exist on the marketing site today, so this
  asserts nothing now. That is the point: the audit's recommendation for item 16
  was to attach the requirement to the change that ships the first photograph
  rather than to a later audit that rediscovers it, and a guard is the only form
  of that instruction which survives the author who read the audit leaving.
  `alt=""` passes — an empty alt is correct markup for a decorative image; what
  fails is an image with no `alt` at all.
- **Sticky bar keyboard and screen-reader behaviour.** It is a real `<a>`, not a
  div with a handler. It is **unmounted** rather than visually hidden when
  inactive, so there is never a focusable control a keyboard user can tab into
  while it is invisible. It renders last in the page DOM, which is where it sits
  on screen, so tab order matches visual order. It is not `aria-hidden` — hiding
  a focusable element from assistive tech while leaving it tabbable is a worse
  defect than the duplication it would avoid.
- **Safe area.** `pb-[max(env(safe-area-inset-bottom),0.875rem)]`, matching the
  idiom already used by the app's bottom navigation and sheet primitives, so the
  tap target clears the iOS home indicator.
- **Motion.** Uses the existing `animate-sheet-up` keyframe; `globals.css`
  collapses animation duration under `prefers-reduced-motion` globally.

## CTA and conversion changes

**The primary CTA on every page is unchanged**, and that is deliberate. The audit
marked item 2 Implemented and said "No change to the CTA. Fix what it lands on."
What `/feed` lands on is demo data, which is governed by
`app_config.demo_mode_enabled` — open drift **D14**, a founder decision, not an
engineering one. Changing the destination would be making that decision by
implication.

**The sticky bar replaces rather than duplicates.** Frozen UI rule 1 caps a
screen at one amber action, and a bar pinned to the viewport is on every screen
by definition — so the naive implementation breaks the rule permanently rather
than occasionally. This one enforces the rule literally: an `IntersectionObserver`
watches every `data-amber-cta` element, and the bar renders only while **none**
is intersecting. At most one amber action is on screen at any scroll position.

Three properties fall out of that rather than needing special cases:

- The header CTA is `hidden … sm:inline-flex`, so below 640px it has no layout
  box and never intersects — exactly the range the bar renders in (`sm:hidden`).
  They are complements, not competitors.
- The closing `CtaBand`'s primary is marked, so the bar disappears as soon as
  that band enters the viewport. Everything after it is the footer, which is
  therefore **never overlaid** — including the legal links and the
  regulatory-status disclosure, which must stay reachable.
- Opening the mobile sheet reveals its own amber CTA. That element mounts after
  the observer is wired, so intersection alone would miss it; the sheet's toggle
  publishes `aria-expanded`, which is read via a single attribute observer on a
  single element rather than a subtree `MutationObserver` running on every
  marketing page over mall wifi.

**It fails closed.** `amberOnScreen` starts `true`, so the bar is absent on first
paint and stays absent if `IntersectionObserver` is unavailable or no marked
actions are found. A component that cannot see the other amber actions must not
render a second one; the failure mode is the status quo.

**It is measurable.** `location="sticky-mobile"` on the existing
`marketing_cta_clicked` event, so its clicks are separable from hero and
cta-band clicks — the only way to find out whether it earns its place.

## Tests and verification

All run from `maanta-app/` on this branch. Every result below was observed, not
inferred.

| Command | Result |
|---|---|
| `npm run lint` | ✅ No ESLint warnings or errors |
| `npm run typecheck` | ✅ clean (two `matchAll` iteration errors were introduced and fixed — this tsconfig target cannot iterate a `RegExpStringIterator`) |
| `npm test` | ✅ **666 passed / 666, across 85 files** |
| `npm run build` | ✅ green, including all four post-build gates |
| ↳ `check:tokens` | ✅ 47 rendered files, 401 chunks, no `{{TOKEN}}` |
| ↳ `check:canonicals` | ✅ 16 routes; `/waitlist` named as not prerendered |
| ↳ `check:forms` | ✅ 2 routes ship a complete server-rendered form |
| ↳ `check:metadata` | ❌ **first run**: `/` 168 chars, `/help` 162 → ✅ after fix: 17 routes clean |
| `npx vitest run drift-register.test.ts` | ✅ 12 passed — D91 satisfies the schema and evidence rules |

**Not run:** `make db-verify` and the `db-tests` CI job. No SQL under
`supabase/migrations/` was touched, so the applicable check is the one that ran.
`npm run test:e2e` was not run — it needs `E2E_BASE_URL` and stored auth state,
which this container does not have.

**Guards proven non-vacuous**, per the repo convention of testing the test:

- Removed `sm:hidden` from `StickyCta` → `renders on mobile only` failed, alone.
- Renamed the `amberCta` prop to `amberCtaX` → the first version of the marker
  assertion **stayed green**, because `toContain("amberCta")` substring-matches
  `amberCtaX`, which is a prop `TrackedLink` ignores. The assertion was
  word-anchored to `/\bamberCta\b/` and the same mutation then failed correctly.
  That near-miss is recorded in the test's own comment.
- `check:metadata` proved itself by failing on a clean build and naming two real
  defects nobody had found by reading.

**Verified in built output rather than source:** `data-amber-cta` present 3× per
target page; `sticky-mobile` absent from server HTML, confirming the bar is
client-gated and fails closed; description lengths recomputed from `<head>`.

**Not verified:** production behaviour. Nothing here is live. The sticky bar's
scroll behaviour has not been exercised on a physical device — the observer logic
is guarded statically and reasoned about, which is not the same as watching it on
a mid-range Android at 360px. That is the first thing to check after deploy.

## Deferred items requiring founder input

Carried forward unchanged from the audit; none is closable in the repo.

| # | Needed | Blocks |
|---|---|---|
| 1 | **Lawyer review of the four legal drafts, and the incorporation decision behind it** | Readiness tracker `O5`, blocked. Gates removal of the DRAFT banners and the placeholder identifiers |
| 2 | **Kenya DPA cross-border basis for Supabase `eu-west-1`** | `O6`, not started. Determines what `/privacy` §12 may honestly say |
| 3 | **Analytics consent posture for signed-in users** | Drift **D88**, open. Provider, measurement ID, lawful basis and jurisdictions must be settled before any banner or opt-out is built |
| 4 | **BBS Mall verified address, opening hours, floor detail** | `/malls/bbs-mall` stays a stub. Attributable to the mall, not to MAANTA |
| 5 | **Demo mode** (`app_config.demo_mode_enabled`) | Drift **D14**, open. The primary shopper CTA lands on synthetic deal rows |
| 6 | **Founder photograph** — optional upgrade, not a gap | `/about`. Must be founder-supplied; not sourced, not generated |
| 7 | **Whether the pilot may be written up, and by whom** | Case studies and testimonials stay deferred until then |
| 8 | **Confirmation route for the three forms** | Audit item 4. Changes three conversion flows and wants its own review; the inline success state works today and `marketing_form_submitted` already fires |

## Risks, assumptions, and rollback notes

**Assumptions made and stated.**

- The missing implementation-plan document does not change the scope. The audit's
  *Recommended implementation order* and *Deliberately not fixed* sections were
  read as the plan.
- "Appropriate public marketing pages" for the sticky bar means the two long
  conversion pages the audit named, not all 17. An enumerated list is normally
  the weaker guard — it only checks what someone remembered — but here the
  assertion is exact equality in both directions, so a page that starts importing
  `StickyCta` fails until it is added deliberately.

**Risks.**

- *The bar is client-side.* It cannot appear in server HTML, so it contributes
  nothing to a crawler and nothing to first paint. That is intended, but it means
  its behaviour is only observable in a real browser — the guards check its
  constraints, not its runtime.
- *The one-amber invariant depends on the marker staying attached.* If
  `CtaPrimary` loses `amberCta`, the bar becomes visible over the whole page
  including the hero. `marketing-sticky-cta.test.ts` asserts the marker at
  `CtaPrimary`, at `TrackedLink`, and — by exact count against `bg-brand` —
  across `SiteHeader`.
- *The 160-character ceiling is now a hard build failure.* A future description
  written one word too long fails `npm run build` rather than shipping truncated.
  That is the intent, and it is the single most likely source of a surprising red
  build from this change.
- *`check:metadata` inspects prerendered routes only.* `/waitlist` renders per
  request and is named as uninspected on every run. It is not covered.

**Rollback.** Each piece is independently revertible.

- Sticky bar only: delete `StickyCta.tsx` and its test, and remove the two
  imports and two JSX lines from `merchants/page.tsx` and `shoppers/page.tsx`.
  The `data-amber-cta` markers are inert without it.
- Metadata gate only: remove `&& npm run check:metadata` from `build`, delete the
  script, and remove its entry from `GATES` in `build-gates.test.ts` — that test
  will fail until the entry is removed, which is the wiring guard working.
- The two description edits are copy-only and stand alone.

No database, migration, RPC, auth or money-path behaviour was touched.

---

## Out-of-scope confirmation

Nothing on the brief's prohibited list was added. Specifically: no reviews or
testimonials; no case studies or pilot results; no partner logos or "trusted by"
strip; no map, address, directions or `LocalBusiness` schema; no team or founder
photograph; no analytics, pixel, tracking script, cookie or consent banner; no
legal copy written from scratch; no response-time promise beyond the existing
`RESPONSE_TIMES` constant; no new forms, email automation, waitlist or CRM
integration; and no new claim about BBS Mall, sponsors, merchants, funding,
traction, redemption volume, savings or geographic availability.

The only copy changed was two meta descriptions, both **shortened**, neither
adding a claim: `/` lost the words "and pay the shop in person" in favour of "pay
the shop", and `/help` moved "within 1 business day by email" to "next business
day by email". No structured data carrying an identifier, address or rating was
added.
