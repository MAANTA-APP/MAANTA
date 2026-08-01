# Marketing site — gap audit

**Date:** 2026-08-01
**Audited build:** `sxaguL-wUiFwrRQgXcPHW`
**Audited deployment:** `dpl_8PvconvVT9ns66aF4YjQek7rTosi` (production, promoted 2026-08-01)
**Audited commit:** `038e3bc0c1c23fe98ce2cfecefea5e4eafeb6d39` on branch `claude/maanta-marketing-site-y8fesm`
**Host:** `https://www.maanta.app`

---

## 0. How this audit was produced — read this first

This audit was produced **without reading the repository**. It is grounded in three
sources of truth, in this order:

1. **Rendered production HTML** for every route on the marketing surface, fetched from
   `https://www.maanta.app`. This is the strongest evidence available: it is what
   crawlers, no-JS visitors and social unfurlers actually receive.
2. **Vercel deployment metadata** — commit SHAs, branches, PR numbers, promotion
   history, runtime error clusters.
3. **PostHog production telemetry** — the project's event schema and 14 days of
   pageview and marketing-event data.

**What this means for you.** Every finding below is anchored to observable output, not
to inference about source. Where a fix requires knowing a file path, a component name or
a test name, this document says **`VERIFY IN REPO`** and gives the strongest available
pointer (usually a Next.js chunk name, which encodes the route-group path). Do not treat
those pointers as confirmed paths — confirm them, then act.

Conversely: where this document says a page renders something, or does not, that is
confirmed against bytes. Do not re-litigate it from source. The build has already been
bitten once by exactly that gap — the prior implementation report recorded two defects
that "reached the production HTML through paths nobody would find by reading components".

**Scope decisions confirmed by the founder before writing:**

- `/pricing` is unfinished and is **in scope**.
- Legal drafts are **not to be rewritten**. This audit flags unfinished rows and
  publication-mechanics inconsistencies only. No legal copy is proposed anywhere.
- `/feed` and `/merchants/join` **count as marketing surface** — both are in the sitemap
  and both are indexable.

---

## 1. Headline

**The six target pages exist, are well-built, and are not the problem.**

Home, `/shoppers`, `/merchants`, `/mall-operators`, `/about` and `/contact` are all live,
all inside a shared `(marketing)` layout, all with authored titles and descriptions, all
with page-specific OG images, and all carrying real copy (≈530–1,570 words of rendered
`<main>` text; `/contact` is the exception at ~230, for the reason in GAP-01).
The shared footer already covers all four categories the target spec asks for. The IA is
close to done and **should not be restarted**.

What is left is a tail of defects concentrated in four places:

| Where | Nature |
|---|---|
| `/contact` | The enquiry form does not exist in server HTML. |
| Site-wide `<head>` | No canonical tags anywhere; `og:url` wrong or missing on every page. |
| `/pricing`, `/merchants/join`, `/feed` | In nav and/or sitemap, but unfinished — no authored metadata, thin or default. |
| Legal + robots | Four legal pages `Disallow`ed but not `noindex`ed; three unfinished table rows shipped. |

Plus one release-hygiene issue that should be resolved before anything else is touched
(§2).

---

## 2. Branch, PR and deployment state — resolve before touching code

| Fact | Value |
|---|---|
| Repo | `MAANTA-APP/MAANTA` (private) |
| Working branch | `claude/maanta-marketing-site-y8fesm` |
| PRs seen | **#153** (merged), **#154** "Marketing site: six pages, legal docs, guards, and founder rulings" (merged, `314b5ef8`) |
| Last production deploy **from `main`** | `314b5ef8`, 2026-07-31 |
| **Current production deploy** | `038e3bc0`, **from the branch**, promoted 2026-08-01 |

> ### RISK-01 — production is not serving `main` *(blocking, no code change)*
>
> The live site is a **promotion of a branch deployment**, not a deployment of `main`.
> The commit it serves — `038e3bc0`, *"fix(tests): close vacuous wa.me and Elite-trial
> guards from Phase 6 audit"* — landed on the branch **after** PR #154 merged.
>
> So either that commit is also on `main` and the promotion was merely redundant, or
> `main` and production have **diverged**, and `main` is currently missing a fix to two
> guard tests that were passing vacuously.
>
> **Do this first:** `git log --oneline main..claude/maanta-marketing-site-y8fesm`. If it
> is non-empty, open a PR for the remainder and redeploy production from `main`. Every
> other item in this document assumes a single trunk.
>
> This matters more than it looks. `038e3bc0` fixed guards that *passed without
> testing anything* — a comment stripper that treated `://` as a line comment, and a
> pricing-copy test scanning JSX comments instead of rendered copy. If that fix is not on
> `main`, `main`'s test suite is green for the wrong reason.

**Runtime errors, last 7 days** (Vercel, all on superseded deployments — informational):

- `column merchants_1.lat does not exist` — 19 occurrences, 3 users, routes `/feed`,
  `/browse`. Last seen 2026-07-26.
- Two isolated `fetch failed` errors revalidating a `live-deals,BBS Mall` cache key, on
  `/how-it-works.rsc` and `/pricing.rsc`. Last seen 2026-07-29.

The `/pricing.rsc` entry is worth a glance: it shows `/pricing` was, at that point,
revalidating a live-deals cache. The page as it renders today is fully static. Confirm
nothing is left over. **`VERIFY IN REPO`**

---

## 3. Route inventory — what is actually live

Every route below returned **HTTP 200** unless stated. "Marketing chrome" = renders the
shared `(marketing)` header and 5-column footer.

### 3.1 Target pages

| Route | Title authored | OG image | Marketing chrome | `<main>` words | Verdict |
|---|---|---|---|---|---|
| `/` | ✅ `MAANTA — The mall, made live.` | ✅ root image | ✅ | ~526 | **Done** |
| `/shoppers` | ✅ `For shoppers — MAANTA` | ✅ `/shoppers/…` | ✅ | ~1,062 | **Done** |
| `/merchants` | ✅ `For merchants — MAANTA` | ✅ `/merchants/…` | ✅ | ~1,249 | **Done** |
| `/mall-operators` | ✅ `Mall operators — MAANTA` | ✅ `/mall-operators/…` | ✅ | ~1,565 | **Done** |
| `/about` | ✅ `About — MAANTA` | ✅ `/about/…` | ✅ | ~981 | **Done** |
| `/contact` | ✅ `Contact — MAANTA` | ✅ `/contact/…` | ✅ | ~230 | **Partial — form missing from SSR** |

### 3.2 Supporting routes in nav, footer or sitemap

| Route | Title authored | OG image | Marketing chrome | `<main>` words | Verdict |
|---|---|---|---|---|---|
| `/pricing` | ❌ **root default** | ❌ **root fallback** | ✅ | ~90 | **Unfinished — in primary nav** |
| `/faq` | ✅ | ❌ fallback | ✅ | ~640 | Good; no FAQ schema |
| `/help` | ✅ | ❌ fallback | ✅ | ~165 | **No `<h1>`** |
| `/waitlist` | ✅ | ❌ fallback | ✅ | ~113 | Thin but functional; form is SSR'd |
| `/download` | ✅ | ❌ fallback | ✅ | ~88 | Thin |
| `/malls/bbs-mall` | ✅ | ❌ fallback | ✅ | **~75** | **Thin — flagship location page** |
| `/merchants/join` | ❌ **root default** | ⚠️ inherits `/merchants` image | ✅ | **~59** | **Unfinished — in sitemap** |
| `/feed` | ❌ **root default** | ❌ **no `og:image` at all** | ❌ app shell | ~1,732 | **Unfinished metadata; app surface** |

### 3.3 Routes outside the marketing surface but reachable from it

| Route | Notes |
|---|---|
| `/login` | Linked from `/download`. App shell, not marketing layout. Root-default title, **no `og:image` of any kind**, and **no `<a>` element anywhere in the body** — without JS there is no way off the page, not even a logo link. |
| `/how-it-works` | See GAP-03. Serves `/shoppers` byte-for-byte. Not in sitemap, not in nav or footer. |

### 3.4 Metadata routes

- **`/sitemap.xml`** — 13 URLs, all `lastmod` 2026-08-01. Contains `/`, `/shoppers`,
  `/merchants`, `/merchants/join`, `/mall-operators`, `/about`, `/contact`, `/pricing`,
  `/help`, `/faq`, `/malls/bbs-mall`, `/download`, `/waitlist`.
  **Absent:** the four legal pages (deliberate), and `/how-it-works` (correct).
- **`/robots.txt`** — allows `/`, disallows `/api/`, `/admin`, `/agent`, `/founder`,
  `/merchant/`, `/onboarding`, `/otp`, `/select-mall`, `/verify-phone`, `/app-bootstrap`,
  `/sentry-example-page`, **and all four legal pages**. Declares `Host` and `Sitemap`.
- **404** — a styled 404 renders correctly with `noindex`, but it uses **root-default
  metadata** and drops the header and footer entirely.

---

## 4. Page coverage

**Status: complete.** All six target pages exist and are in the shared layout.

One genuine gap and one to note:

- **GAP-08 — `/contact` is not in the primary nav.** The header nav is exactly
  `Shoppers · Merchants · Mall operators · Pricing · About`. Contact is a target
  top-level page and is reachable only from the footer. The nav has five items and room
  for six. *(Design call, not a bug — but it is the one target page a visitor cannot
  reach from the top of the page.)*
- **`/pricing` is in the primary nav but is not one of the six target pages.** It is
  nonetheless the weakest page on the site (§7). Confirmed in scope.

---

## 5. Footer coverage

**Status: complete, and better than the target spec.** No structural work required.

The footer renders identically on all marketing routes, as five columns plus a legal row:

| Column | Contents | Target spec category |
|---|---|---|
| Brand | Logo, tagline, "Live at BBS Mall, Eastleigh · Nairobi" pill, "Install the app" | — |
| **Product** | Shoppers, Merchants, Mall operators, Pricing, Browse deals, Install the app | ✅ main navigation |
| **Company** | About, Contact, Join the waitlist | ✅ company links |
| **Resources** | Help centre, FAQ, BBS Mall (Node 0) | ✅ docs/help links |
| **Contact** | `admin@maanta.app`, WhatsApp support, In-mall desk address | ✅ contact links |
| Legal row | Privacy, Terms, Merchant Terms, Cookies | ✅ legal links |

Plus a pre-launch disclosure above the copyright line:

> **Pre-launch demonstration.** MAANTA APP is not yet trading. Legal documents on this
> site are unreviewed drafts, and any registration or licence identifiers shown are
> placeholders.

**Footer verification passed:** the WhatsApp number is `447746170752` everywhere on the
site — the placeholder `254700000000` recorded as drift D36 appears **zero times** in any
rendered page. That fix held.

> **Footer defect — FOOT-01 (low, a11y).** The four column headings (`Product`,
> `Company`, `Resources`, `Contact`) are marked up as `<h2>`. On `/help`, which has no
> `<h1>` at all, this makes the footer headings the highest-ranked headings on the page.
> They should be `<h2 class="sr-only">`-style labels or `<p>` with `aria-labelledby` on
> the `<nav>`, not document-outline `<h2>`s. **`VERIFY IN REPO`** — the footer is rendered
> directly inside the `(marketing)` layout (chunk `app/(marketing)/layout-*.js`).

---

## 6. Legal and docs coverage

**Status: present, substantial, and deliberately labelled as drafts. Do not rewrite.**

| Route | Title | Words | Sections | Draft banner | Dated |
|---|---|---|---|---|---|
| `/privacy` | Privacy Policy — MAANTA | ~1,700 | 15 + on-this-page | ✅ | 31 July 2026 (DRAFT) |
| `/terms` | Terms of Service — MAANTA | ~1,430 | 14 | ✅ | 31 July 2026 (DRAFT) |
| `/merchant-terms` | Merchant Terms — MAANTA | ~2,195 | 18 | ✅ | 31 July 2026 (DRAFT) |
| `/cookies` | Cookie & Tracking Notice — MAANTA | ~735 | 8 | ✅ | 31 July 2026 (DRAFT) |

Each carries a red banner: *"DRAFT — NO LEGAL STANDING … Registration and licence numbers
shown are placeholders and do not refer to any real registration."*

**Docs/help coverage:** `/help` (4 `<details>` FAQs + WhatsApp CTA) and `/faq` (16 Q&A
across three audience sections). Both are linked from the footer Resources column. This
satisfies the target spec.

### 6.1 The three unfinished rows — LEG-01 *(the only legal-adjacent item that is a defect)*

Three data-table cells shipped to production reading **`to be confirmed with
engineering`**. These are not disclaimers; they are unfinished copy inside factual tables,
and they are answerable from the codebase without a lawyer:

| Page | Table | Row | Cell |
|---|---|---|---|
| `/privacy` | Sub-processors | **Clerk** — Account authentication | `to be confirmed with engineering` |
| `/privacy` | Sub-processors | **Sentry** — Error monitoring | `to be confirmed with engineering` |
| `/cookies` | Retention | **Session cookies** — Authentication | `to be confirmed with engineering` |

The two `/privacy` cells are in the **processing-location** column, alongside rows that
are already filled in ("the EU (Ireland)", "Kenya", "the United States", "European
Union"). The `/cookies` cell is in the **retention-period** column.

**This is an engineering answer, not a legal one** — the column is asking where Clerk and
Sentry process data, and how long the session cookie lasts. Fill the facts; do not touch
the surrounding prose. *(If the answer is genuinely not yet decided, replace with a
stated decision rather than an instruction to a colleague — the current text addresses
the reader as if they were staff.)*

### 6.2 Publication mechanics — LEG-02 *(decision required, founder)*

The four legal pages are `Disallow`ed in `robots.txt`, absent from the sitemap, **and
carry no `noindex` meta tag**. Those three facts do not combine the way they appear to:

- `Disallow` prevents *crawling*, not *indexing*. A `Disallow`ed URL that is linked from
  elsewhere can still appear in results — as a bare URL with no snippet, because the
  crawler was forbidden from reading it. All four are linked from the footer of every
  page on the site. The correct instrument for "do not index" is `<meta name="robots"
  content="noindex">`, which none of them has.
- Some app-store and payment-provider review processes **require the privacy policy to be
  publicly fetchable**. Blocking `/privacy` in `robots.txt` can fail those checks.

Two coherent options; pick one:

| Option | Change | Consequence |
|---|---|---|
| **A — genuinely hidden** | Add `noindex` to all four. Keep the `Disallow`. | Consistent. May block reviewers. |
| **B — public but unranked** | Remove the four `Disallow` lines. Add `noindex`. | Reviewers can fetch; search will not rank them. Recommended if any store/PSP submission is near. |

**`DECISION REQUIRED — FOUNDER`.** Do not change this without a ruling.

### 6.3 `DEMO-ODPC-NOT-REGISTERED`

`/privacy` §1 publishes `ODPC registration: DEMO-ODPC-NOT-REGISTERED — placeholder, see
demo notice`. This is intentional and self-labelled. Recorded here so nobody "fixes" it
by inventing a number. **Leave it.**

---

## 7. Content and copy gaps

### GAP-01 — `/contact`'s enquiry form does not exist in server HTML *(highest severity)*

`/contact` is a target page. Its form is **entirely client-only**. The server HTML
contains:

```html
<section class="bg-white "><div class="mx-auto max-w-5xl px-5 py-14 sm:py-20"><!--$!-->
<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>
<div class="h-96 animate-pulse rounded-card border border-line bg-paper"></div><!--/$--></div></section>
```

There is **no `<form>`, and zero `<input>`/`<select>`/`<textarea>`** anywhere on the page.
The bailed component is **`EnquiryRouter`** (chunk
`app/(marketing)/contact/page-*.js`). What ships is a 24rem grey pulsing rectangle with
no text and no `<noscript>` fallback.

Three consequences, in order of how much they matter:

1. **Without JavaScript there is no contact form** — only a rectangle that pulses
   forever. The same page asserts, in server-rendered copy directly below it: *"This form
   and email — We reply within 1 business day."* The site promises a form it does not
   render.
2. **Crawlers and previews see an empty section.** `/contact` renders ~230 words of
   server content; the form section contributes zero.
3. **The bail is almost certainly avoidable.** A Suspense bailout on a prerendered page
   this shape is the classic signature of `useSearchParams()` — consistent with the name
   `EnquiryRouter` and with `/contact` routing by enquiry topic. **`VERIFY IN REPO`**

**This is the same class of defect as drift D28** — the form that POSTed nowhere while
telling the sender it had arrived. That was fixed by wiring `/api/contact` to Resend. The
form is now wired but is no longer *rendered*. Worth stating in the drift register in
those terms.

**Corroborating telemetry:** PostHog's event schema for this project contains
`marketing_section_viewed`, `marketing_cta_clicked` and `marketing_faq_opened` — but
**no form-submit event of any name**, and `/contact` recorded **zero pageviews in 14
days**. The prior implementation report describes five marketing events including "form
submits". Either that event is named outside the `marketing_*` prefix, or it has never
fired in production. **`VERIFY IN REPO`** — there is a marketing event-constants module;
check the constant exists and is called.

### GAP-02 — `/pricing` is unfinished, and it is in the primary nav *(confirmed in scope)*

`/pricing` is the only route in the header nav that was not built to the standard of the
rest of the site:

- **No authored metadata.** `<title>` is the root default `Maanta — The mall, made live.`
  and the description is the generic root one. Every other nav destination has both.
- **No page-specific OG image**, unlike all five other nav destinations.
- **~90 words.** Two cards, a launch-offer pill, one footnote. No sections, no FAQ, no
  CTA, none of the structure `/merchants` uses for the same commercial material.
- Note the casing tell: root default says "Maanta", the homepage title says "MAANTA".
  Any page showing "Maanta" in the tab is inheriting root metadata.

The *numbers* are consistent with `/merchants` (KES 30 success fee, KES 3,500/mo Elite,
KES 500 per 24h boost, 30-day trial for the first 100 BBS Mall merchants, 7-day grace).
The pricing-copy guard test appears to be doing its job — but note that guard was one of
the two fixed in `038e3bc0` for scanning JSX comments rather than rendered copy, so
**re-confirm it now checks rendered output.** **`VERIFY IN REPO`**

### GAP-03 — `/how-it-works` serves `/shoppers` at a second URL

`https://www.maanta.app/how-it-works` returns **200** with `x-matched-path: /shoppers`
and a body **byte-identical to `/shoppers`** (60,642 bytes, RSC payload
`urlParts: ["","shoppers"]`).

It is a **rewrite, not a redirect** — the evidence is PostHog, which recorded **10
pageviews at `$pathname = /how-it-works`** in 14 days. A 308 would have been captured at
`/shoppers`. The URL stays in the address bar.

So `/shoppers` is served at two URLs, with **no canonical tag on either** (see GAP-04).
That is textbook duplicate content, and it is live. It is also invisible from inside the
site: `/how-it-works` is not in the sitemap, not in the nav, and the string
`how-it-works` appears zero times in the HTML of `/`, `/shoppers`, `/merchants`,
`/contact` or `/login`. It is reachable only from external links or history — which the
10 pageviews confirm someone is doing.

**Fix:** make it a **308 permanent redirect** to `/shoppers`. **`VERIFY IN REPO`** —
likely `next.config` `rewrites()`; move it to `redirects()` with `permanent: true`.

### GAP-06 — `/merchants/join` has no authored metadata

In the sitemap at priority 0.8, ~59 words, `<title>` and description are the root
default. Its OG image inherits `/merchants`' — so the social card shows *"You only pay
when a customer walks in"* over a title reading *"Maanta — The mall, made live."* An
inconsistent pair.

### GAP-07 — `/feed` metadata and markup

In the sitemap, indexable, ~1,732 words. Root-default title and description, **no
`og:image` tag at all** (sharing it produces an imageless card), **no `<h1>`**, and **two
`<main>` elements** — an empty `class="px-4 pt-4"` skeleton plus the real one. Duplicate
landmark; screen readers will announce two mains.

It also publicly serves demo fixture data (~60 seeded UUIDs of the form
`d1000000-0000-4000-a000-0000000000NN`) behind a *"Demo mode — sample data for rehearsal.
These shops, deals and codes are not real"* banner. The banner is honest and the demo
switch is a database row rather than an env var (recorded in `CLAUDE.md`). Flagged, not
faulted — but it is indexable and it is the site's second-most-visited page (220 views,
48 people in 14 days).

### GAP-09 — `/malls/bbs-mall` is ~75 words

The flagship location page, linked from the footer Resources column on every page, is: a
"LIVE NOW" pill, one intro paragraph, "Live now · Nairobi", one sentence, and a "Browse
BBS Mall deals" button. No address, no hours, no shop list, no map, no schema — despite
the full address existing in the footer of the same page.

### GAP-10 — `/help` has no `<h1>`

The visible "Help" heading is an `<h2>`. The document outline starts at h2, and (per
FOOT-01) the footer's four column headings are also `<h2>`, so the page's most prominent
headings are "Product / Company / Resources / Contact".

---

## 8. Design and polish gaps

### GAP-04 — No canonical tags anywhere, and `og:url` is wrong or missing on every page *(site-wide)*

Verified across every HTML route audited:

- **`<link rel="canonical">` count: 0.** Not one page emits one. With GAP-03 live, this
  is not academic.
- **`og:url` is never the page's own URL.** Where present it is verbatim
  `https://www.maanta.app`. So sharing `/faq`, `/privacy` or `/malls/bbs-mall` into
  Slack, LinkedIn or Facebook canonicalises the unfurl to the homepage.
- **On `/`, `/shoppers`, `/merchants`, `/mall-operators` and `/about`, `og:url` is missing
  entirely** — along with `og:site_name`, `og:locale` and `og:type`.

That last point identifies the actual bug, and it is a small one. `/contact` and
`/pricing` **do** emit `og:url`, `og:site_name`, `og:locale` and `og:type`. The five
pages that lose them are exactly the five that set a page-specific `openGraph` object.
In Next.js App Router, a page-level `openGraph` **replaces** the parent's wholesale — it
does not merge field-by-field. So the five richest pages are silently discarding the root
layout's OG fields.

**Fix:** set `metadataBase` plus a per-page `alternates.canonical`, and either re-declare
`url`/`siteName`/`locale`/`type` in each page's `openGraph` or spread the shared object
into it. One helper, six call sites. **`VERIFY IN REPO`**

### GAP-05 — `og:title` / `og:description` split one sentence in half

On `/mall-operators`:

- `og:title` = *"Your mall runs hundreds of promotions a month."*
- `og:description` = *"None of them are measured."*

On `/about`:

- `og:title` = *"What MAANTA is, and how it makes money."*
- `og:description` = *"Live at BBS Mall, Eastleigh, Nairobi."*

The `/mall-operators` case is the H1 sentence cut at the full stop and pasted into two
fields. As a social card it reads as a truncation bug. The `<title>`/`<meta description>`
pair on both pages is well written — the OG pair should match that quality, not the H1.

### GAP-11 — Mobile navigation is unreachable without JavaScript

The primary nav is `class="hidden … lg:flex"`. Below `lg`, the only control is:

```html
<button type="button" aria-expanded="false" aria-controls="marketing-mobile-nav" aria-label="Open menu" …>
```

**No element with `id="marketing-mobile-nav"` exists in the server HTML.** Two problems:

1. `aria-controls` points at a non-existent id. Assistive tech announces a control for a
   region that is not there.
2. On a phone with JS disabled or still loading, the site has **no navigation at all** —
   the "Browse deals" CTA is also `hidden … sm:inline-flex`, so under 640px the header is
   a logo and a dead hamburger.

This is a Kenyan mobile-first product. The footer nav is a genuine mitigation — it is
fully server-rendered and carries every route — but the header should not ship a control
that does nothing before hydration.

### GAP-12 — 404 page inherits root metadata and drops all chrome

The 404 renders correctly (`<h1>404</h1>`, *"This page wandered off the mall directory"*,
brand-yellow "Back to home") and is correctly `noindex`. But it uses the root-default
title and description, and renders a bare `<main>` — no header, no footer, no legal
links, no skip link. Someone who mistypes a URL loses the whole site.

### GAP-13 — No structured data anywhere

Zero `application/ld+json` blocks across every route. Two are near-free wins given the
content already exists: `FAQPage` on `/faq` (16 Q&A in three sections) and
`LocalBusiness`/`Place` on `/malls/bbs-mall` (address already in the footer). An
`Organization` block in the root layout would also anchor the brand.

### GAP-14 — `/login` is a dead end without JS

Linked from `/download`. Root-default title, no `og:image` of any kind, and **no `<a>`
element anywhere in the body** — not even the logo. Before Clerk's script loads from
`clerk.maanta.app`, a visitor who lands there cannot navigate anywhere. Outside the
marketing surface, but it is linked from it.

---

## 9. Implementation risks

| ID | Risk | Why it matters |
|---|---|---|
| **RISK-01** | Production serves a branch commit, not `main` (§2) | `main` may be missing the guard fix from `038e3bc0`. Resolve before any other work. |
| **RISK-02** | Guards that passed vacuously | `038e3bc0` fixed two: a comment stripper treating `://` as a line comment, and a pricing-copy test scanning JSX comments not rendered copy. **The other seven guards were written by the same process.** Re-verify each by mutation — break the thing it protects and confirm it fails. A guard that passes vacuously is worse than none: it converts an unchecked property into a checked one on paper. |
| **RISK-03** | Source-truth vs render-truth | Two defects previously reached production HTML via paths nobody would find reading components — and GAP-01 is a third. **Guards must assert against built HTML**, not JSX. |
| **RISK-04** | Clerk on marketing pages | `perf(auth)` moved `AuthProviders` out of the root layout into 14 authenticating shells so marketing pages stop shipping the auth SDK. Every marketing route still returns `x-clerk-auth-status: signed-out`, so **middleware still runs on them**. The recorded Lighthouse numbers (perf 92 avg, Home 87 — below the definition-of-done bar) were measured under the *supabase* auth strategy where `ClerkProvider` never renders; production runs *clerk*. **Re-measure against production before claiming the perf bar is met.** |
| **RISK-05** | Demo data is public and indexable | `/feed` is the second-most-visited page and serves seeded UUID fixtures. The demo switch is a DB row, not an env var — so "turn it off" is a data operation, and there is no build-time guard against shipping with it on. |
| **RISK-06** | `/waitlist` is dynamically rendered | `cache-control: private, no-cache, no-store`, `x-vercel-cache: MISS`, while sibling marketing pages are `PRERENDER`. Every visit hits a lambda. Its form *is* fully server-rendered (including a `hp_url` honeypot), so this is a cost/latency note, not a correctness one. **`VERIFY IN REPO`** |
| **RISK-07** | Drift-register accuracy | D34 was found still marked `open` while the implementation report described it as closed, for four commits. The register is only useful if its state is true. Sweep open rows before handover. |
| **RISK-08** | No canonical + a live duplicate URL | GAP-03 and GAP-04 compound. Fix GAP-03 first — it is one line and removes the duplicate at source. |

---

## 10. What is already done — do not redo

Stated explicitly so the next session does not re-solve solved problems:

- ✅ Six target pages, all in a shared `(marketing)` route group with a common header and footer.
- ✅ Footer covers all four target categories, plus a brand column and a pre-launch disclosure.
- ✅ Four legal documents, substantial, dated, banner-labelled as drafts.
- ✅ `/help` and `/faq` exist and are footer-linked.
- ✅ `sitemap.xml` and `robots.txt` are generated, with `Host` and `Sitemap` declared.
- ✅ Page-specific OG images on all six target pages (generated at build).
- ✅ WhatsApp placeholder (D36) fully eliminated — `447746170752` sitewide, `254700000000` absent.
- ✅ `/contact` is wired to `/api/contact` via Resend with an autoresponder (D28) — but see GAP-01.
- ✅ PostHog marketing events firing in production: `marketing_section_viewed` (25),
  `marketing_cta_clicked` (8), `marketing_faq_opened` (6) over 14 days.
- ✅ Skip-to-content link on every marketing page.
- ✅ Styled, `noindex`ed 404.
- ✅ No unresolved template tokens anywhere — no `{{`, `TBD`, `TODO`, `Lorem`, `XXX`, or
  bracket placeholders in any rendered page. The only "placeholder" language is the
  deliberate demo disclosure.

---

## 11. Findings index

| ID | Severity | Area | Summary |
|---|---|---|---|
| RISK-01 | **Blocking** | Release | Production serves a branch commit, not `main` |
| GAP-01 | **High** | Content | `/contact` enquiry form absent from server HTML |
| LEG-01 | **High** | Legal | Three `to be confirmed with engineering` cells live |
| GAP-03 | **High** | SEO/IA | `/how-it-works` rewrites to `/shoppers` — duplicate URL |
| GAP-04 | **High** | SEO | No canonicals; `og:url` wrong or missing on every page |
| GAP-02 | **High** | Content | `/pricing` unfinished but in primary nav |
| LEG-02 | **Decision** | Legal | Legal pages `Disallow`ed but not `noindex`ed |
| RISK-02 | **High** | Testing | Seven guards unverified after two were found vacuous |
| RISK-04 | Medium | Perf | Lighthouse measured under the wrong auth strategy |
| GAP-06 | Medium | Content | `/merchants/join` root-default metadata |
| GAP-07 | Medium | Content | `/feed` no title/og:image/h1; duplicate `<main>` |
| GAP-11 | Medium | A11y | Mobile nav unreachable pre-hydration; dangling `aria-controls` |
| GAP-10 | Medium | A11y | `/help` has no `<h1>` |
| GAP-05 | Medium | Polish | OG title/description split a sentence in half |
| GAP-08 | Medium | IA | `/contact` missing from primary nav |
| GAP-09 | Low | Content | `/malls/bbs-mall` is ~75 words |
| GAP-12 | Low | Polish | 404 inherits root metadata, drops chrome |
| GAP-13 | Low | SEO | No JSON-LD anywhere |
| GAP-14 | Low | A11y | `/login` has no links without JS |
| FOOT-01 | Low | A11y | Footer column headings are document-outline `<h2>`s |
| RISK-05/06/07/08 | Various | — | See §9 |

**Next:** `docs/ops/marketing-site-finish-plan.md`.
