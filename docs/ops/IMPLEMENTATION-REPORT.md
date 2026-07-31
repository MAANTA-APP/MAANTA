# MAANTA — Marketing Site Implementation Report

**Date:** 2026-07-31
**Branch:** `claude/maanta-marketing-site-y8fesm`
**Built against:** the 16-document handoff pack, added to the repo in commit `bbe6ad4`
**Audience:** the Cursor audit pass, and the human reviewing after it

> **Read this first.** The handoff documents did not exist in this repository when
> the build started — not in the working tree, not on any branch, not anywhere in
> `git log --all`. They were supplied mid-session and committed as `bbe6ad4`.
> Anything in this report that contradicts a document does so deliberately and is
> recorded in §5.

---

## 1. Phase 0 answers — all 14

Answered by reading the repo and, for question 14, by querying the live Supabase
project. Nothing here is inferred from the planning documents.

| # | Question | Answer |
|---|---|---|
| 1 | `app/(marketing)/` route group, or flat under `app/`? | **Neither, then.** Marketing pages sat in `app/(public)/`. The group was renamed to `(marketing)` in Phase 1 — route groups are URL-invisible, so no path moved. |
| 2 | Header/footer location? Shared with app shell? | `src/components/nav/public-nav.tsx`, exporting `PublicNav` and `PublicFooter`. **Not shared** — its only importer was `(public)/layout.tsx`. App shells use `shopper-top-bar`, `merchant-top-bar`, `bottom-bars`, `admin-sidebar`. Risk R4 did not apply. File is now deleted, superseded by `SiteHeader`/`SiteFooter`. |
| 3 | Clerk matcher — do marketing routes pass? | **Yes.** `clerkMiddleware()` is called with **no callback**, so it protects nothing; it only populates auth context. The matcher runs on marketing routes (everything bar static assets), so there is middleware overhead but no gate. **No change was needed** — R3 did not materialise. |
| 4 | Are `#FDBF2D`, type scale, spacing Tailwind tokens? | **Tokens already.** `tailwind.config.ts` defines `brand.DEFAULT = #FDBF2D` plus `ink`, `paper`, `rust`, `flame`, `verified`, `line`, `muted`, `secondary`. Config says "Never write raw hex into components"; `frozen-ui-rules.test.ts` enforces it. Phase 1 **consumed** them; none were added. |
| 5 | **Demo banner — where mounted, what flag?** | **Three layouts, not the root:** `(shopper)/layout.tsx:8`, `merchant/(app)/layout.tsx:34`, and — the R1 bug — `(public)/layout.tsx:8`, directly above `PublicNav`. The flag is **not an environment variable**: `isDemoModeEnabled()` reads `app_config.demo_mode_enabled` from Postgres via the service client (`src/lib/demo-mode.ts`, migration `20260729140000`), uncached, fail-safe to OFF. |
| 6 | Do `/pricing`, `/for-merchants`, `/faq` read from a constant? | **Partially — `facts.ts` was a refactor, not greenfield.** `/pricing` and `/for-merchants` imported `SUCCESS_FEE_KES`. But `/for-merchants` hardcoded `3500`, `200`, `5000`, and `/faq` hardcoded "KES 30" as a prose string with no constant. Only the success fee was centralised. |
| 7 | Existing `lib/` nav or site-config module? | **None.** No nav, routes or site-config module anywhere; `public-nav.tsx` inlined its links. `lib/marketing/nav.ts` is the first, so there is no second source of truth to reconcile. |
| 8 | Does `next.config` carry redirects? | **No `redirects()` at all.** It had `rewrites()` (three PostHog proxy paths), `skipTrailingSlashRedirect: true`, `instrumentationHook`, wrapped in `withSentryConfig`. All preserved. **The file is `next.config.mjs`, not `.js`** as both briefs state. |
| 9 | Does `/merchants` share components with `/merchant/onboard`? | **No.** `/merchants` imported only generic UI (`Button`, `PhoneField`/`TextField`, `IconCheck`). `/merchant/onboard` is a server component using `getSuccessFee`, the service client and its own `OnboardWizard`. The `/merchants/join` move was clean. |
| 10 | Existing marketing tests or snapshots? | **No snapshots, but a real safety net.** `pricing-copy.test.ts` guards `/pricing` copy, `frozen-ui-rules.test.ts` guards design tokens, `drift-register.test.ts` guards the register. No rendering or visual-regression tests. |
| 11 | Where does `/contact` POST? | **Nowhere.** `onSubmit` called `preventDefault()` then `setSent(true)`, rendering "✓ We'll get back to you within 24 hours". No fetch, no action, no endpoint. Already registered as drift **D28**. |
| 12 | Staff all-plans or Elite-only? Boosts Standard-available? | **Staff: all plans.** `merchant_staff` has no tier column and no gate in schema or `/api/staff` — per-permission booleans only (`can_verify`, `can_deals`, `can_topup`, `can_purchase`). **Boosts: Elite-only, hard-enforced** — `purchase_boost` raises `BOOST_ELITE_ONLY`, explicitly not bypassed by admin or `service_role` (migration `20260715194145`). |
| 13 | M-Pesa — paybill or STK? | **STK push**, via IntaSend (`initiateMpesaStkPush` in `lib/intasend.ts`). No paybill path exists. Guarded by `intasend-guard.test.ts`. |
| 14 | Processing regions | **Supabase: `eu-west-1` (Ireland)** — queried live, project `axrrslqssmbngbataejg`, Postgres 17.6. **PostHog: EU** (`eu.i.posthog.com`, hardcoded in `next.config.mjs`). **Resend: US** (`api.resend.com`, no region pinning). **Clerk: not determinable from the repo.** **Sentry: not determinable** — org `maanta`, project `javascript-nextjs`, no DSN in `.env.example`. |

### Question 14 contradicts a handoff assumption — flagged, not silently corrected

`website-handoff.md` §7 blocker #11 reads *"Cross-border transfer basis —
**production is US-hosted**, PostHog EU."* Production Postgres is **eu-west-1**,
not US. That inverts the privacy analysis: the primary data store is already in
the EEA, and the actual cross-border exposure is **Resend (US)** and probably
Clerk. Since that blocker gates Privacy §12, counsel would otherwise be answering
the wrong question. The source document was not edited.

---

## 2. The three bugs

| # | Bug as reported | What was actually true | What was done |
|---|---|---|---|
| 1 | `/api/contact` does not exist; enquiries may be discarded | **Worse than reported.** The form did not piggyback another endpoint — it POSTed nowhere and faked success. Every enquiry since the page shipped was discarded while the sender was told it arrived. | Built `/api/contact` → Resend → `admin@maanta.app` with `reply_to` set to the sender, plus an autoresponder. The confirmation renders only after the request succeeds; a failed send returns 502 and offers WhatsApp. Closes **D28**. |
| 2 | Homepage typo "Merchant write offers" | **Already fixed** in the repo — `page.tsx:103` read "**Merchants** write offers". The bug report was stale. | Nothing. Copy preserved through the Home rebuild. |
| 3 | Boost price on `/merchants` but not `/pricing`; pages disagree on Elite-only | Real, and the framing was slightly off: only one page was wrong. `/pricing` was **correct** (boosts under Elite). `/merchants` was **wrong** — "Boost **any** deal for KES 500 / 24h" on the lead-gen page prospective merchants read before choosing a plan, when the RPC rejects every non-Elite merchant. | Resolved against the migrations: Elite-only, KES 500/24h. `/merchants` states the qualifier, `/pricing` gained the price, both read from `facts.ts`. Recorded and closed as drift **D34**. |

---

## 3. Files created and modified, by phase

69 files changed, +5,738 / −793.

### Phase 0 — verification and bug fixes
- **A** `src/app/api/contact/route.ts`, `src/app/api/contact/__tests__/route.test.ts`
- **A** `src/lib/contact.ts`
- **M** `src/lib/resend.ts` (generic `sendEmail`, alongside the existing `sendWaitlistEmail`)
- **M** `docs/maanta-drift-register.md` (rows D33, D34 added; D28, D33, D34 closed)

### Phase 1 — shared shell and disclosure
- **A** `src/lib/marketing/{facts,scenario,demo,nav}.ts`
- **A** `src/components/marketing/{SiteHeader,SiteFooter,PrelaunchNotice,LegalDraftBanner,PlaceholderId,ScenarioNotice,ScenarioStat}.tsx`
- **A** `src/app/(marketing)/layout.tsx` — **without** the demo banner (R1)
- **A** `src/lib/__tests__/marketing-shell.test.ts`
- **D** `src/components/nav/public-nav.tsx`, `src/app/(public)/layout.tsx`
- **R** `src/app/(public)/**` → `src/app/(marketing)/**` (16 files, git-tracked renames)
- **M** `src/lib/__tests__/{pricing-copy,waitlist}.test.ts`, `src/lib/pwa/__tests__/app-bootstrap.test.ts` (path references)

### Phase 2 — routes, redirects, discoverability
- **A** `src/app/(marketing)/merchants/join/page.tsx`
- **A** `src/app/sitemap.ts`, `src/app/robots.ts`
- **A** `scripts/check-tokens.mjs`
- **M** `next.config.mjs` (redirects merged alongside existing rewrites)
- **M** `package.json` (`build` now runs `check:tokens`)
- **M** `src/app/merchant/onboard/page.tsx`, `onboard-wizard.tsx` (phone survives the handoff)

### Phase 3 — pages
- **A** `src/components/marketing/sections.tsx`, `EnquiryRouter.tsx`
- **A** `(marketing)/page.tsx`, `shoppers/`, `merchants/`, `mall-operators/`, `about/`, `contact/`
- **D** `(marketing)/{for-merchants,for-shoppers,how-it-works}/page.tsx` (URLs 301; the dead components are gone)

### Phase 4 — legal
- **A** `src/content/legal/*.md` (4 documents), `src/lib/marketing/legal-docs.ts`, `src/components/marketing/LegalDoc.tsx`
- **A** `(marketing)/{privacy,terms,merchant-terms,cookies}/page.tsx`
- **A** `src/lib/__tests__/held-claims.test.ts`

### Phase 5 — a11y, metadata, mobile
- **M** `src/app/globals.css` (`:focus-visible`, `prefers-reduced-motion`)
- **M** `src/app/layout.tsx` (`metadataBase`, OG/Twitter defaults)
- **M** 7 pages: nested `<main>` → `<div>`
- **A** `src/lib/__tests__/marketing-a11y.test.ts`

---

## 4. Routes shipped

All verified returning 200 against a production build (`next start`, port 3100).

| Route | Status | Copy source |
|---|---|---|
| `/` | Rebuilt | `copy/home.md` |
| `/shoppers` | New | `copy/shoppers.md` |
| `/merchants` | Rebuilt (merged `/for-merchants` + old `/merchants`) | `copy/merchants.md` |
| `/merchants/join` | New (form relocated) | `copy/merchants.md` §4 |
| `/mall-operators` | New | `copy/mall-operators.md` |
| `/about` | Rebuilt | `copy/about.md` |
| `/contact` | Rebuilt, `?topic=` routing | `copy/contact.md` |
| `/privacy` | Rebuilt from draft | `docs/legal/privacy-policy.md` |
| `/terms` | Rebuilt from draft | `docs/legal/terms-of-service.md` |
| `/merchant-terms` | New | `docs/legal/merchant-terms.md` |
| `/cookies` | New | `docs/legal/cookie-notice.md` |
| `/sitemap.xml` | New | generated from `nav.ts` |
| `/robots.txt` | New | generated from `nav.ts` |
| `/pricing`, `/faq`, `/waitlist`, `/download`, `/malls/bbs-mall` | Retained, new chrome | — |

**Redirects** (verified live): `/for-shoppers` → `/shoppers`, `/for-merchants` →
`/merchants`, `/how-it-works` → `/shoppers`. All **308**, see §5.

---

## 5. Deviations — every one, and why

1. **`facts.ts` re-exports `SUCCESS_FEE_KES` instead of declaring `successFeeKes: 30`.**
   The starter code writes the literal. `SUCCESS_FEE_KES` already exists as the
   frozen constant, is asserted against `app_config`, and `pricing-copy.test.ts`
   **fails the build on a second declaration**. Writing the literal was not
   possible without breaking the suite, and would have been the exact drift both
   modules exist to prevent.

2. **Three redirects, not four.** `website-handoff.md` §5 lists "old `/merchants`
   form → `/merchants/join`". That is a **component move, not a URL redirect** —
   `/merchants` is the merchant marketing page, and redirecting it would make that
   page unreachable and dark-route the audience it was written for.

3. **Redirects emit 308, not 301.** The docs say "301 … `permanent: true`". In
   Next.js `permanent: true` produces **308**. Both are permanent and search
   engines treat them identically. The explicit instruction (`permanent: true`)
   was followed. Change to `statusCode: 301` if the literal number matters.

4. **Route group renamed `(public)` → `(marketing)`** rather than creating a
   parallel group. The expansion plan says "do not invent structure that already
   exists … extend it". Route groups are URL-invisible so nothing moved; three
   test files and four drift-register citations were updated in the same change.

5. **`ScenarioNotice` is a wrapper, not a sibling.** The spec asks that
   `ScenarioStat` throw when the notice is absent. A sibling banner cannot be
   detected from a child, so the notice provides React context and wraps the page.
   Deleting it removes the provider and the page throws in dev — the guarantee is
   structural rather than a convention. **This changes how pages are composed**:
   `/mall-operators`, `/about` and `/` return `<ScenarioNotice>…</ScenarioNotice>`.

6. **`/merchants` does not publish "Boosts can also be bought on Standard at
   KES 500 for 24 hours"** (`copy/merchants.md` `#plans`). It is false — boosts
   are Elite-only. The deck's own claims register #4 asked for this resolution
   before stating one answer everywhere.

7. **`/about` states boosts as Elite-only**, where the deck said "any shop can buy
   a boost". Same reason.

8. **`#operations` staff line says "on any plan"** and **`#wallet` describes an
   STK prompt, not a paybill** — both deck items marked VERIFY, resolved from the
   migrations in Phase 0.

9. **`/about` renders no founder biography.** `{{FOUNDER_BIO}}` is unfilled and
   is the deck's own blocking dependency A. Rendering the token would fail the
   build check; inventing a generic paragraph would be worse than none on the
   block a diligence reader opens the page for. Name and email render.

10. **`/about` uses `admin@maanta.app`**, not the deck's preferred named
    `mohamed@` address. `demo-mode-spec.md` §1 is authoritative and routes all
    contact email to `admin@`. The deck's point — that `admin@` "reads like nobody
    is home" on an About page — is a real one and is logged in §10 rather than
    silently actioned.

11. **`/contact` publishes no response times.** The deck's `#response` section is
    built entirely from unfilled tokens, and both the deck ("publish only what you
    can actually meet") and handoff §9 hold them. The section states what is true
    — a person reads every message, WhatsApp is fastest, confirmation on arrival —
    and commits to no window. WhatsApp hours and desk location omitted likewise.

12. **`/mall-operators` production copy makes no BBS partner claim.** Per
    `demo-mode-spec.md` §2a, `#hero` status, `#node` callout, `#stage` and
    `#report` carry fallback copy. `#report` describes what a pilot **includes**
    rather than a deliverable already produced (claims register #7). The Data
    Processing Addendum is described as agreed before a pilot starts, not as an
    existing document (#10).

13. **Legal documents render from markdown**, not hand-built JSX, per the footer
    plan's "authored as MDX or structured data … so non-engineers can revise it".
    The renderer is ~200 lines in `LegalDoc.tsx` rather than a dependency: the
    markdown subset is narrow and fixed, and a small readable parser is easier to
    audit than a library tree on pages whose purpose is that a reader can trust
    them.

14. **Drafting material stripped from the legal documents.** 17 counsel-note
    blockquotes, plus the trailing unnumbered sections ("Questions for counsel",
    "Copy alignment required", "Build dependencies"). These are instruction to the
    implementer, and two of them **published §9 held claims onto public pages**
    (see §8). Numbered sections are the document; unnumbered trailing sections are
    not. **The source files in `docs/legal/` are unmodified.**

15. **The phone number now survives `/merchants/join` → onboarding.** The form
    collected a phone and passed only `?shop=`, so the merchant typed it again two
    steps later. `?phone=` and `?cc=` are threaded through, sanitised. Additive —
    absent params behave exactly as before.

16. **`pricing-copy.test.ts` widened to accept `cohortShops`** as evidence the
    first-100 cap is stated. It previously required a literal `100` in source,
    which is unsatisfiable alongside the marketing rule that no number is inlined.
    The guard still fails if the cap is not stated at all.

17. **Seven pages had their `<main>` unwrapped to `<div>`.** The marketing shell
    owns the single `main` landmark; nesting them is invalid HTML.

---

## 6. Not implemented, and why

| Item | Status | Reason |
|---|---|---|
| **Opening credit + Elite trial sections** | Built, **not rendering** | Both `OFFERS.*.expiresOn` are `{{SET_A_DATE}}`. `isOfferLive()` gates them, so they are absent rather than stale. **Filling two dates in `facts.ts` is the only change needed.** This is a live gap on the merchant acquisition path. |
| **Founder biography** | Omitted | `{{FOUNDER_BIO}}` unfilled — deck blocking dependency A. |
| **PostHog events on doors / CTAs / form submits** | **Done** — see §13 | Initially deferred on consent grounds; that reasoning was wrong and is corrected in §13. |
| **OG images** | **Done** — see §13 | Six generated per-route images via `next/og`. |
| **Cookie-consent mechanism** | Not built | Product + counsel decision (handoff §7 item 15). `/cookies` describes categories; the consent architecture is unresolved and the notice does not claim an opt-out that does not exist. |
| **Lighthouse ≥ 90 verification** | **Not measured** | No Lighthouse run in this environment. Structural work was done and verified in a real browser (§7). Treat the ≥ 90 target as unverified. |
| **Live PostHog event verification** | **Not possible here** | A placeholder project token makes posthog-js fail remote config and disable capture entirely, so a browser probe reports "no events" whether the wiring is right or not. Verified by unit test with a mocked transport instead (§13). Confirm one real event in the PostHog UI after deploy. |
| **`/help` marketing variant** | Not done (R9) | Footer points at `/faq` instead, which the footer plan offers as the sanctioned interim. `/help` still renders in the app shell. |
| **A/B variants** | Not done | Home and Shoppers decks suggest keeping current H1s as variant B. No experiment framework was added. |
| **Social icons, newsletter, testimonials, logo wall, founder photo** | Deliberately absent | Per the footer plan and the prompt's DO-NOT list. |

---

## 7. Verification performed

**Automated** — `npm test`: **466 passing, 59 files**. `npm run typecheck`: clean.
`npm run lint`: clean. `npm run build`: succeeds, and now runs `check:tokens`.

**Real browser** (Chromium, 360×800, production build):

| Check | Result |
|---|---|
| Horizontal overflow at 360px, 8 pages | **0px on every page** |
| `h1` count per page | exactly 1 |
| `main` count per page | exactly 1 |
| Console/page errors | none |
| `?topic=mall-operator` pre-selects | yes — option pressed, form value `mall-operator` |
| Mobile sheet opens / closes on Escape | yes / yes |

**Route smoke test** — 14 routes return 200; 3 redirects resolve to the right
targets; the demo-banner string appears **0 times** across all six marketing pages.

**New guard tests** (23 assertions): `marketing-shell.test.ts` (banner scoping both
ways, inlined prices, boost copy, nav link hygiene), `held-claims.test.ts` (each §9
claim, plus drafting-material leakage), `marketing-a11y.test.ts` (landmarks, skip
link, per-page metadata, legal `noindex`, focus-ring colour, reduced motion,
table overflow, sheet ARIA), `api/contact/__tests__/route.test.ts` (delivery,
autoresponder, **failure must not report success**, honeypot, rate limit, HTML
escaping).

---

## 8. Held claims — §9 confirmation

Verified against **rendered build output**, not against the source I wrote.

| Claim | Status |
|---|---|
| "Anything left in your balance stays yours" | **ABSENT** |
| "A shop that does not honour its own deals does not stay on MAANTA" | **ABSENT** |
| "We do not sell shopper data" | **Published, deliberately** — worded to match the Privacy Policy sentence exactly ("We do not sell personal data. We do not share it with advertisers or data brokers"), extended on `/mall-operators` with "and we do not share it with other malls". The register's condition was that it match `/privacy` word for word; it does. |
| Monthly operating report | **Reworded** — describes what a pilot includes, not a deliverable being produced. |
| BBS Mall as signed partner / 3 months live | **ABSENT in production.** Renders only when `NEXT_PUBLIC_SCENARIO_MODE=true`. |
| "121 shops · 190 live deals" | **ABSENT** — 0 occurrences in the production build. |
| Every stated response time | **ABSENT** — no window published anywhere. |
| CBK licence identifier (real or placeholder) | **ABSENT** — no `cbk` key exists in `PLACEHOLDER_IDS`. |

> **Two of these reached the build before being caught.** `/merchant-terms` and
> `/terms` were publishing "Copy alignment required" tables that quote the first
> two claims verbatim inside an instruction to withhold them. Found by grepping
> the built HTML rather than the pages. Fixed in `cde6c0b`; guarded by
> `held-claims.test.ts`.

---

## 9. Environment variables

| Variable | Production (`www.maanta.app`) | Pitch preview | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_SCENARIO_MODE` | `false` or **unset** | `true` | **The one that matters.** Unset ⇒ off, so an unconfigured deployment renders the truth. Controls every modelled figure and the BBS partner framing. |
| `RESEND_API_KEY` | required | required | `/api/contact` returns 502 without it. |
| `RESEND_FROM_EMAIL` | required | required | Verified sender. Same. |
| `NEXT_PUBLIC_APP_URL` | `https://www.maanta.app` | preview URL | Feeds `metadataBase`, `sitemap.xml`, `robots.txt`. Falls back to the canonical host. |
| `RESEND_AUDIENCE_ID` | required | required | Pre-existing, waitlist only. |
| Supabase / Clerk / Stripe / IntaSend | unchanged | unchanged | Not touched by this work. |

**Not an environment variable:** `DEMO_MODE` is a constant in
`lib/marketing/demo.ts` (per `demo-mode-spec.md` §5), and the **app's** demo mode
is the database row `app_config.demo_mode_enabled`. Three distinct switches —
do not conflate them.

---

## 10. Known issues and open questions

1. **The two offer dates are the highest-value unblock.** Until
   `OFFERS.*.expiresOn` are set, the KES 300 opening credit and the 30-day Elite
   trial do not appear anywhere on the site.
2. **Confirm one real PostHog event after deploy.** The wiring is unit-tested
   but has never reached a real project (§13). The audience-door click-through is
   the number the Home deck calls "the single most useful number this site can
   produce in its first month" — check it arrives before trusting the dashboard.
3. **`admin@maanta.app` for everything.** Four roles, one inbox. The About deck's
   objection stands, and at launch `privacy@` must match the Privacy Policy.
4. **The WhatsApp number is a UK (+44) line** on a Nairobi mall site. Flagged in
   `demo-mode-spec.md` §1 as fine for demo, wrong for launch.
5. **26 legal tokens remain** (§11), each rendering as a visible "to be confirmed
   with \<owner\>" marker. `/merchant-terms` carries 12 — the most consequential
   document is the least complete.
6. **Handoff §7 blocker #11 is factually wrong** about production being US-hosted
   (§1, Q14). Correct it before counsel answers the transfer-basis question.
7. **Lighthouse unverified** (§6).
8. **`/malls/bbs-mall` was not rebuilt.** It renders in the new chrome but its
   content is untouched, and it still carries the demo shop and deal counts that
   risk R11 warns against quoting. `/faq` **was** rebuilt — see §13.
9. **Route renames invalidate drift-register citations.** The `(public)` →
   `(marketing)` rename broke four cited paths including two pre-existing rows.
   `drift-register.test.ts` caught it, but any future move will do the same.
10. **`/mall-operators` copy is v1 by definition** — the deck says so. It has
    never been read by a real mall operator.

---

## 11. Tokens remaining

**26 distinct, all in the legal documents, none in marketing copy.** Zero reach
rendered output as raw `{{TOKEN}}` — the build fails if any does.

| Document | Count | Tokens |
|---|---|---|
| `merchant-terms.md` | 12 | `CONTROLLER_RELATIONSHIP`, `CREDIT_EXPIRY`, `DISPUTE_LOSS_ALLOCATION`, `DISPUTE_RESOLUTION_MECHANISM`, `DISPUTE_WINDOW`, `ELITE_RENEWAL_TERMS`, `FEE_CHANGE_NOTICE`, `LIABILITY_CAP`, `PROHIBITED_CATEGORIES`, `REFUND_POLICY`, `TAX_INCLUSIVE_OR_EXCLUSIVE`, `TERMS_CHANGE_NOTICE` |
| `privacy-policy.md` | 8 | `ANALYTICS_RETENTION`, `CLERK_REGION`, `CONTACT_RETENTION`, `COOKIE_CONSENT_STATEMENT`, `REDEMPTION_RETENTION`, `SENTRY_REGION`, `SHOPPER_RETENTION`, `TRANSFER_BASIS` |
| `cookie-notice.md` | 5 | `ANALYTICS_CONSENT_STATEMENT`, `ANALYTICS_COOKIE_LIFETIME`, `ANALYTICS_OPTOUT_INSTRUCTIONS`, `AUTH_COOKIE_LIFETIME`, `SENTRY_BASIS_STATEMENT` |
| `terms-of-service.md` | 2 | `ENFORCEMENT_COMMITMENT`, `LIABILITY_CAP` |

**Resolved during this build** (`RESOLVED_TOKENS` in `lib/marketing/legal-docs.ts`):
`SUPABASE_REGION` → the EU (Ireland) · `RESEND_REGION` → the United States ·
`STAFF_PLAN_AVAILABILITY` → on all plans · `BOOST_PLAN_AVAILABILITY` → on Elite
only · plus entity, fee and placeholder-ID values.

**`{{SET_A_DATE}}`** persists in `facts.ts` by design — gated by `isOfferLive()`,
never rendered. The token scanner reads build output, not source, precisely so a
correctly-gated token does not fail the build.

---

## 12. How to run

```bash
cd maanta-app
npm install

npm run dev          # http://localhost:3000
npm test             # 466 tests
npm run typecheck
npm run lint
npm run build        # next build, then check:tokens
npm run check:tokens # scans .next/server/app for surviving {{TOKEN}}
npm start            # production server
```

**Local dev needs Supabase env vars** — the Clerk/Supabase middleware runs on
every route and 500s without `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. They are inlined at build time, so set them
**before** `npm run build`, not after. Placeholder values are enough to render
the marketing pages.

To see the pitch build: `NEXT_PUBLIC_SCENARIO_MODE=true npm run build && npm start`.

Suggested audit entry points: `src/lib/marketing/` (four constants modules),
`src/components/marketing/` (shell and disclosure), and the four guard tests
named in §7.

---

## 13. Follow-up pass — analytics, FAQ and OG images

Three items from §6 were completed after the first report. This section is
additive; §6 rows are updated to point here.

### 13.1 PostHog instrumentation — and a corrected judgement

The first report deferred this on consent grounds. **That reasoning was wrong**,
and it is worth stating why rather than quietly reversing it.

The argument was that adding tracking before the cookie-consent decision would
prejudge it. But `PostHogClientProvider` is already mounted on every page and
already captures pageviews and autocapture in production. A named CTA event
therefore introduces no new category of processing — same tool, same lawful
basis, same data subject — and it disappears behind whichever consent switch is
eventually built. Withholding the events would not have improved the privacy
position; it only meant not knowing which audience the homepage serves.

Five events, names centralised in `lib/marketing/analytics-events.ts`:

| Event | Fires on |
|---|---|
| `marketing_audience_door_clicked` | the three Home doors — the priority measurement |
| `marketing_cta_clicked` | every primary and secondary CTA, with `name` + `location` |
| `marketing_form_submitted` | contact and merchant-join, on success only |
| `marketing_faq_opened` | first open of each FAQ item, with `page` |
| `marketing_section_viewed` | `#cost`, `#plans`, `#counter`, `#report`, `#doors` — once each |

**What is never sent:** no message body, contact detail, name, shop name or
phone number. A submit event records that a submission happened and which form
it came from. Enforced by a test that extracts the paren-balanced
`trackMarketing(...)` call, strips string literals, and fails if a field
identifier appears inside it.

**A build failure worth knowing about.** `MARKETING_EVENTS` originally lived in
`analytics.ts`, which is `"use client"`. The Home page is a server component and
passes `MARKETING_EVENTS.audienceDoor` as a prop — that broke the React Client
Manifest and **failed the production build**. The constants now live in a
framework-neutral module; `analytics.ts` re-exports them for client callers. A
test asserts the split so it cannot regress.

**Not verified against a live PostHog project.** With a placeholder token,
posthog-js fails remote config and disables capture entirely — a browser probe
reports "no events" whether the wiring is correct or not, which is exactly what
happened when it was tried. Verified by unit test with a mocked transport
instead. **Confirm one real event in the PostHog UI after deploy.**

### 13.2 `/faq` restructured by audience

Split into Shoppers / Merchants / Mall operators per
`website-footer-legal-docs-plan.md` §3, and every number now reads from
`facts.ts`. This page was the **last place on the marketing site where a frozen
number was typed rather than imported** — it hardcoded "KES 30" and "15-minute"
as prose strings with no constant behind them.

Answers are kept consistent with the audience pages rather than reworded, so a
shopper reading both is told the same thing twice. The two held claims stay held
here: no enforcement promise, no statement about a remaining wallet balance.

### 13.3 OG images

Six generated per-route images (`/`, `/shoppers`, `/merchants`,
`/mall-operators`, `/about`, `/contact`) via `next/og`, from one template in
`lib/marketing/og.tsx`. Headlines come from the same decks as the page copy, so
an image cannot drift from the page it represents.

Deliberately typographic: no photograph, no product screenshot, no stock. The
design notes ban stock imagery, and a screenshot of demo data is precisely what
risk R1 exists to prevent. Verified rendering at 1200×630 PNG, ~44 KB, with
`og:image` meta present on the page.

### 13.4 Verification after this pass

`npm test`: **475 passing, 60 files**. Typecheck, lint and build all clean;
the token gate still reports no `{{TOKEN}}` in rendered output.

### 13.5 What §6 still leaves open

Unchanged: cookie-consent mechanism, Lighthouse measurement, `/help` marketing
variant, A/B variants, and the two offer dates. Added: confirm one live PostHog
event after deploy.
