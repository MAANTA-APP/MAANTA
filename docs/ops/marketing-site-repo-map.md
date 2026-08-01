# Marketing site — repo-verified execution map

**Date:** 2026-08-01
**Verified against:** `origin/main` = `314b5ef8` (this branch's HEAD is identical)
**Companions:** `docs/ops/marketing-site-gap-audit.md`, `docs/ops/marketing-site-finish-plan.md`
**Purpose:** map every audit finding and finish-plan step onto real repo locations.

---

## 0. What this document is, and how to read the verdicts

The gap audit was produced **without reading the repository** — it is grounded in
rendered production HTML, Vercel metadata and PostHog. It flags every path it
guesses with `VERIFY IN REPO`. This document is the other half: it reads the repo
and says where each finding actually lives.

Three verdict words are used throughout, and they mean different things:

| Verdict | Meaning |
|---|---|
| **CONFIRMED** | Read directly in the files at `origin/main`. Cited with `path:line`. |
| **CONTRADICTED** | The repo source disagrees with what the audit observed in rendered HTML. **This does not mean the audit is wrong** — it means the two must be reconciled against built output before acting. |
| **UNVERIFIABLE HERE** | Depends on production HTTP, Vercel, PostHog, Clerk or Sentry — none of which this session can reach. |

A `CONFIRMED` verdict on a *defect* is a defect. A `CONTRADICTED` verdict is the
most dangerous state in this document, because it is where somebody will "fix"
something that is already correct, or declare something fixed that is not. There
are three of them, all called out below.

**Verification method:** all file inspection was done with `grep`/`read` at
`origin/main`. The vitest suite was **not** run — `node_modules` is not installed
in this environment and `npm test` fails with `sh: 1: vitest: not found`. No test
result in this document is claimed as observed.

### Production evidence obtained 2026-08-01 (second pass)

Direct egress to `www.maanta.app` is blocked by this environment's network policy
(the gateway answers 403 to CONNECT), but **the Vercel deployment-fetch tool and
the Vercel API reach it**, which settled three items this document originally
marked UNVERIFIABLE HERE:

| Item | Result |
|---|---|
| **RISK-01** — production commit ref | **CONFIRMED LIVE.** `dpl_8Pvcon…` is `target: production`, `githubCommitRef: claude/maanta-marketing-site-y8fesm`, sha `038e3bc0`, `action: promote`. Last production deploy from `main` was `314b5ef` at 2026-07-31 14:52 UTC; the branch promotion at 2026-08-01 01:07 UTC superseded it. |
| **LEG-02** — legal `noindex` | **AUDIT REFUTED.** `/privacy` and `/cookies` both emit `<meta name="robots" content="noindex, nofollow"/>`. See §8. |
| **LEG-01** — unfinished cells | **CONFIRMED EXACTLY.** Three `PendingValue` markers live and no more — `{{CLERK_REGION}}`, `{{SENTRY_REGION}}` on `/privacy`; `{{AUTH_COOKIE_LIFETIME}}` on `/cookies`. |
| **GAP-04** — canonicals | **CONFIRMED FROM RENDER.** The `/shoppers` HTML contains zero `rel="canonical"` and zero `og:url`. |

Still unresolved: **GAP-03**. Settling rewrite-vs-redirect needs the *status line*
of an unfollowed request, and every fetch path available here follows redirects.
PostHog, which could settle it by pageview timing, requires interactive approval
this session cannot give. See §4.

### Built-HTML baseline, captured 2026-08-01 (third pass)

`npm install` + `npm run build` now run clean in this environment, so the audit's
remaining findings were checked against `.next/server/app/**` — **render truth,
not source**. All confirmed:

| Check | Built-HTML result | Finding |
|---|---|---|
| `rel="canonical"` across all prerendered marketing HTML | **0** | GAP-04 |
| `/contact` `BAILOUT_TO_CLIENT_SIDE_RENDERING` | **1** | GAP-01 |
| `/contact` `<form>` count | **0** | GAP-01 |
| `/pricing` `<title>` | `Maanta — The mall, made live.` (root default — note the casing tell) | GAP-02 |
| `/shoppers` `og:url` | **absent entirely** | GAP-04 |
| `/contact`, `/pricing` `og:url` | `https://www.maanta.app` (bare origin) | GAP-04 |
| `robots.txt` legal `Disallow` lines | **absent** (founder ruling B applied) | LEG-02 |
| Legal pages `<meta name="robots">` | `noindex, nofollow` on **all four** | D42 |
| `sitemap.xml` | 13 routes, legal absent | unchanged |
| Token gate | clean — 47 rendered files scanned, no `{{TOKEN}}` | — |

**Suite baseline: 481 tests / 61 files, all passing. `tsc --noEmit` clean.** This
is the number to diff against after each finish-plan step — and note it matches
the count recorded in `docs/skills/marketing-site-phase6-audit-2026-07-31.md`,
so the suite has not drifted since that audit.

The `og:url` split is worth stating precisely because it names the bug: the five
pages that declare their own `openGraph` lose the field entirely, while the pages
that do not declare one inherit the root's — which is the bare origin. Both halves
are wrong, in opposite directions, from one cause.

---

## 1. Environment and prep state

| Fact | State | Consequence for Cursor |
|---|---|---|
| `maanta-app/node_modules` | **Absent** | `npm install` before anything in Step 2. `npm test` currently exits with `vitest: not found` — that is a missing dependency, **not** a green suite. |
| Test runner | `vitest run` via `npm test` (`maanta-app/package.json`) | 62 test files under `src/**/__tests__/`. |
| Build | `next build && npm run check:tokens` | The token gate is chained into `build`, so it cannot be skipped by building. |
| Local `main` branch | Stale — points at `c8d3e350` | `origin/main` is `314b5ef8`. Always reason about `origin/main`, never the local ref. |

---

## 2. Step 1 — Reconcile branch and `main`

**Audit finding:** RISK-01, blocking.
**Verdict: CONFIRMED, and worse than the audit could tell — the divergence runs
both ways.**

The audit asked for `git log --oneline main..<branch>` and said "if it is
non-empty, open a PR". Both directions are non-empty, so the branch is **not**
simply ahead:

```
origin/main                                = 314b5ef8
origin/claude/maanta-marketing-site-y8fesm = 038e3bc0   ← the production commit
git merge-base --is-ancestor 038e3bc0 origin/main → NO
```

**On the branch, missing from `main` (3 commits):**

| Commit | Subject |
|---|---|
| `480bdf6` | docs: Phase 6 audit brief for Cursor |
| `6a22c0f` | chore: ignore local `.tools` directory |
| `038e3bc0` | **fix(tests): close vacuous wa.me and Elite-trial guards from Phase 6 audit** |

**On `main`, missing from the branch (2 commits):**

| Commit | Subject | Contents |
|---|---|---|
| `6530b09` | Merge pull request #153 | the marketing site itself |
| `314b5ef` | Marketing site … (#154) | **`.gitignore` (+3) and `docs/ops/CURSOR-AUDIT-BRIEF.md` only** |

### What this actually means

Two things the audit could not determine, both now settled:

1. **Production is not missing product code.** `314b5ef` (#154) changed exactly two
   files, both non-executing: `.gitignore` and a docs brief. The live site is not
   running behind `main` in any way a visitor can see.
2. **`main` *is* missing the guard fix, and this is independently confirmed from
   source** — not merely inferred from the commit not being an ancestor. Both
   vacuous-guard bugs the audit describes are still present in the files at
   `origin/main`:

   | Bug | Location at `origin/main` | State |
   |---|---|---|
   | Comment stripper treats `://` as a line comment | `maanta-app/src/lib/__tests__/marketing-shell.test.ts` `codeOnly()` | **still naive** |
   | Pricing-copy test scans JSX comments | `maanta-app/src/lib/__tests__/pricing-copy.test.ts` `copyText()` | **no comment stripping at all** |

   So the audit's warning is exact: **`main`'s test suite is green for the wrong
   reason.** The full diff `origin/main → 038e3bc0` is 4 files / +121 −16:
   the two guard files, `docs/ops/IMPLEMENTATION-REPORT.md`, and a new
   `docs/skills/marketing-site-phase6-audit-2026-07-31.md`.

### The fix `main` is missing

`038e3bc0` adds a `lineCommentAt(line, start)` helper to **both** guard files that
skips a `//` preceded by `:`, plus a `withoutComments()` pass in `pricing-copy`
and a `/days of Elite/i` trigger. It is a clean, self-contained change.

### NEW FINDING — a third guard has the same bug, and `038e3bc0` does not fix it

`maanta-app/src/lib/__tests__/held-claims.test.ts:42`:

```ts
return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
```

That second `replace` is the identical `://` defect — it truncates every line from
the first `//`, so any held claim sitting on the same line as a URL is invisible to
the scanner. `038e3bc0` patched `marketing-shell` and `pricing-copy` and **left
this one**. It is not in the audit, not in the finish plan, and not on either
branch. Treat it as a fourth row in the Step 2 mutation table.

### Repo files involved

- `maanta-app/src/lib/__tests__/marketing-shell.test.ts`
- `maanta-app/src/lib/__tests__/pricing-copy.test.ts`
- `maanta-app/src/lib/__tests__/held-claims.test.ts` *(new finding)*
- `docs/ops/IMPLEMENTATION-REPORT.md`
- `.gitignore` — **touched on both sides of the divergence; expect a conflict here
  and nowhere else.**

### Blockers / dependencies

- Merging is a repo operation; **redeploying production from `main` is a Vercel
  operation this session cannot perform.** UNVERIFIABLE HERE.
- Acceptance (`githubCommitRef: main`) can only be read from Vercel.

---

## 3. Step 2 — Re-verify the guards by mutation

**Audit finding:** RISK-02, RISK-03.
**Verdict: CONFIRMED, and the structural problem is worse than "two were vacuous".**

### The nine guards, mapped to real files

The finish plan lists nine things guarded, without file names. These are the files:

| # | Plan's "guard covers" | Real file | Reads |
|---|---|---|---|
| 1 | WhatsApp number constant | `maanta-app/src/lib/__tests__/marketing-shell.test.ts` | `.tsx` source |
| 2 | Pricing copy | `maanta-app/src/lib/__tests__/pricing-copy.test.ts` | `.tsx` source |
| 3 | Elite trial terms | `maanta-app/src/lib/__tests__/pricing-copy.test.ts` (launch-offer block) + `maanta-app/src/lib/__tests__/elite-trial.test.ts` (pure functions) | source / unit |
| 4 | Held claims + demo disclosure | `maanta-app/src/lib/__tests__/held-claims.test.ts` | `.tsx` + `src/content/legal/*.md` |
| 5 | Analytics payload privacy | `maanta-app/src/lib/__tests__/marketing-analytics.test.ts` | `.tsx` source |
| 6 | Demo-mode switch / shell scoping | `maanta-app/src/lib/__tests__/marketing-shell.test.ts` | `.tsx` source |
| 7 | Node-staffing model copy | `maanta-app/src/lib/__tests__/marketing-shell.test.ts` (`NODE_TEAM`) | `.tsx` source |
| 8 | Legal draft banner + `noindex` | `maanta-app/src/lib/__tests__/marketing-a11y.test.ts` | `.tsx` source |
| 9 | Route / footer link integrity, one `<main>`, per-page metadata | `maanta-app/src/lib/__tests__/marketing-a11y.test.ts` | `.tsx` source |

Two further enforcement points the plan does not count as guards but which behave
like them:

| Extra | File | Reads |
|---|---|---|
| Token gate | `maanta-app/scripts/check-tokens.mjs` | **`.next/server/app` build output** |
| Drift-register schema | `maanta-app/src/lib/__tests__/drift-register.test.ts` | `docs/maanta-drift-register.md` |

### The structural finding

**Every single marketing guard reads `.tsx` source with `readFileSync`. Exactly one
check in the entire repo reads built output: `scripts/check-tokens.mjs`.**

That is RISK-03 stated as a repo fact rather than a worry. It is also precisely why
GAP-01 shipped: no guard in the repo is capable of noticing that a form present in
JSX is absent from HTML, because no guard has ever looked at HTML.

`check-tokens.mjs` is the working model to copy — its own docblock argues the case
("Scans the **build output**, not the source. That distinction is the whole point")
and it already walks `.html`, `.rsc` and `.body` files under `.next/server/app`.
**Any new guard from Steps 4, 5 and 6 should be built on that walker, not on
`readFileSync` of a `.tsx`.**

### A worked example of source/render divergence, available today

`marketing-a11y.test.ts` asserts the legal `noindex` like this:

```ts
expect(src).toMatch(/robots:\s*DEMO_MODE\s*\?\s*\{\s*index:\s*false/);
```

It passes. The audit reports zero `noindex` tags in the rendered HTML of all four
legal pages. Both statements can be true simultaneously, and that is the entire
lesson of Step 2. See §8 below.

### Blockers

- `npm install` is required before a single mutation can be run.
- The plan asks for a nine-row table; **budget for ten** (the `held-claims` row).

---

## 4. Step 3 — Collapse `/how-it-works`

**Audit finding:** GAP-03, High.
**Verdict: CONTRADICTED — the repo says this is already done.**

`maanta-app/next.config.mjs:29`, inside `async redirects()`:

```js
{ source: "/how-it-works", destination: "/shoppers", permanent: true },
```

`permanent: true` is a **308**, which is exactly what the finish plan asks Step 3 to
produce. It sits alongside `/for-shoppers` and `/for-merchants`, and the surrounding
docblock explains the choice. There is no `/how-it-works` entry in `rewrites()` —
that array contains only the three PostHog `/ingest/*` proxy rules.

### Why the audit saw a 200

The audit's evidence — HTTP 200, `x-matched-path: /shoppers`, a body byte-identical
to `/shoppers`, RSC `urlParts: ["","shoppers"]` — is **also exactly what a followed
308 looks like** to an HTTP client with redirect-following enabled. The audit
explicitly says it fetched rendered HTML; a fetch tool that follows redirects by
default would produce every one of those observations.

The PostHog evidence (10 pageviews at `$pathname = /how-it-works`) has an
independent explanation: `/how-it-works` was a **real page** until the marketing
rebuild — `docs/skills/e2e-surface-matrix-2026-07-30.md:22` records it at
`src/app/(public)/how-it-works/page.tsx`, live as of 2026-07-30. The redirect
landed in commit `d4f5ef7`. A 14-day PostHog window straddles that change, so
pre-redirect pageviews are expected.

Corroborating: `docs/skills/marketing-site-phase6-audit-2026-07-31.md` (on the
production branch, not on `main`) records under "Verified clean" —
*"Redirects: three 308s; `/merchants` returns 200"*.

### What Cursor must do

**Do not edit `next.config.mjs`.** Verify first, with redirect-following **off**:

```bash
curl -sI https://www.maanta.app/how-it-works | head -3   # expect 308 + location: /shoppers
curl -sIL https://www.maanta.app/how-it-works | head -20 # the audit's view, for contrast
```

If it is 308, Step 3 is already satisfied — close it, record the finding, and move
the effort to Step 4. If it is genuinely 200, something outside the repo is
intercepting the path (a Vercel project-level rewrite or a stale build), and the
fix is **not** in `next.config.mjs`.

**Also confirmed:** `how-it-works` appears in no nav, footer or sitemap array —
`maanta-app/src/lib/marketing/nav.ts` has no entry, and grep across `src/` returns
only `next.config.mjs:29` and a docblock reference at
`maanta-app/src/app/(marketing)/shoppers/page.tsx:18`. The plan's request to
"confirm no email template, QR code or print asset depends on the URL" is satisfied
inside the repo; **external print assets are UNVERIFIABLE HERE**, and the 308 keeps
them working regardless.

---

## 5. Step 4 — Canonical and Open Graph

**Audit finding:** GAP-04 (High), GAP-05 (Medium).
**Verdict: CONFIRMED — with one sub-item already done.**

### Item 1 — `metadataBase`: ALREADY SET, do not re-add

`maanta-app/src/app/layout.tsx:33`:

```ts
const SITE_ORIGIN = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.maanta.app";
export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  ...
```

Note the env-var override: `NEXT_PUBLIC_APP_URL` wins if set. Any canonical helper
must read the **same** constant, or preview deployments will emit canonicals
pointing at production.

### Item 2 — the root `openGraph` that gets discarded

`maanta-app/src/app/layout.tsx:44-49`:

```ts
openGraph: {
  type: "website",
  siteName: "MAANTA",
  locale: "en_KE",
  url: SITE_ORIGIN,        // ← the bare origin the audit sees on /faq, /privacy …
},
```

This is both halves of GAP-04 in five lines: `url` is hardcoded to the origin
rather than the page, and any page that declares its own `openGraph` replaces this
object wholesale.

### Item 3 — canonicals: CONFIRMED absent

`grep -rn "alternates\|canonical" src/` returns **zero** hits in any
`src/app/(marketing)/**` file. The only `canonical` matches in the repo are
`canonicalAuthOrigin` in the Supabase auth helpers — unrelated.

### Item 4 — the helper does not exist

There is **no `src/lib/seo/` directory**. The plan's suggested
`lib/seo/page-metadata.ts` is a new file. `maanta-app/src/lib/marketing/` is the
natural home if you prefer to keep marketing concerns together — it already holds
`facts.ts`, `nav.ts`, `og.tsx`, `analytics-events.ts`, `legal-docs.ts`,
`scenario.ts`, `demo.ts`.

### Item 5 — the call sites

Fifteen marketing pages export `metadata` today:

| Has `export const metadata` | Does **not** |
|---|---|
| `(marketing)/page.tsx`, `shoppers`, `merchants`, `mall-operators`, `about`, `contact`, `faq`, `help`, `waitlist`, `download`, `malls/bbs-mall`, `privacy`, `terms`, `merchant-terms`, `cookies` | **`pricing`**, **`merchants/join`**, **`(shopper)/feed`** |

All paths are `maanta-app/src/app/(marketing)/<route>/page.tsx` unless noted.
The three without are Step 6's subject — see §7 for why `merchants/join` cannot
simply have one added.

### Item 6 — GAP-05, the split-sentence OG pairs

The two pages are `maanta-app/src/app/(marketing)/mall-operators/page.tsx:52` and
`maanta-app/src/app/(marketing)/about/page.tsx:48`. Both are one edit once the
helper exists. **This is copy, and it is marketing copy rather than legal or
commercial copy** — writing it is in scope for Step 4, unlike anything in Step 7.

### Guard to add

New, and it **must** read `.next/server/app/**/*.html` — see §3. Model it on
`maanta-app/scripts/check-tokens.mjs`.

### Dependency

Step 3 first, per RISK-08 — a canonical on a URL that should not exist is worse
than none. Given §4, that dependency may already be satisfied.

---

## 6. Step 5 — Server-render the `/contact` form

**Audit finding:** GAP-01, the highest-severity content defect.
**Verdict: CONFIRMED in full, including the audit's inferred root cause.**

### Root cause — the audit guessed `useSearchParams()` and was right

`maanta-app/src/components/marketing/EnquiryRouter.tsx`:

| Line | Content |
|---|---|
| 1 | `"use client";` |
| 5 | `import { useSearchParams } from "next/navigation";` |
| 79 | `const searchParams = useSearchParams();` |
| 106 | `async function onSubmit(e: React.FormEvent) {` |
| 130 | `trackMarketing(MARKETING_EVENTS.formSubmit, { form: "contact", topic: submittedTopic });` |
| 206 | `<form className="mt-6 max-w-xl space-y-4" onSubmit={onSubmit}>` |

### The bailout site

`maanta-app/src/app/(marketing)/contact/page.tsx:99-104`:

```tsx
<Suspense
  fallback={
    <div className="h-96 animate-pulse rounded-card border border-line bg-paper" />
  }
>
  <EnquiryRouter />
</Suspense>
```

That fallback is, character for character, the grey pulsing rectangle in the
audit's HTML sample. The page's own docblock (lines 27-30) documents the decision:
*"The form itself lives in `EnquiryRouter`, which is a client component because it
reads `?topic=`. It is wrapped in `Suspense` so `useSearchParams` does not opt the
whole route out of static rendering."* The trade was made deliberately and its
cost — the form vanishing from server HTML — was not noticed.

### CORRECTION to the plan — the `/waitlist` pattern is not what the plan says

Finish plan Step 5.3 says *"`/waitlist` already gets this right — its form is fully
server-rendered … **Copy that pattern**."*

Repo truth: `maanta-app/src/app/(marketing)/waitlist/waitlist-form.tsx:1` is
**`"use client"`**, with `<form>` at line 112 and the `hp_url` honeypot at line 176.

It is not a server component. It prerenders because it is a client component that
**does not call `useSearchParams()`** — so React can render it to HTML at build
time and hydrate it later. The transferable pattern is therefore:

> **a client form with no `useSearchParams()`, and no `Suspense` boundary around
> it** — not "a server-rendered form".

Getting this wrong sends Cursor on a rewrite to server actions that the codebase
does not need. Of the plan's three options, the second — read `?topic=` from the
page's `searchParams` prop and pass it down as a plain prop — matches this codebase
best and deletes the `Suspense` boundary entirely. **Caveat: accepting
`searchParams` opts the route into dynamic rendering in the App Router**, so
`/contact` stops being a static prerender. Confirm that trade is acceptable before
committing to it; the cheapest alternative that keeps the prerender is to drop
`useSearchParams` and read `?topic=` in a `useEffect` after hydration, which leaves
the form itself statically rendered.

### RESOLVED — the audit's open telemetry question

The audit asked (twice, with `VERIFY IN REPO`) whether a form-submit event exists.
**It exists and it is wired:**

- `maanta-app/src/lib/marketing/analytics-events.ts:18` — `formSubmit: "marketing_form_submitted"`
- called at `EnquiryRouter.tsx:130` (contact) and
  `maanta-app/src/app/(marketing)/merchants/join/page.tsx:47` (merchant join)

So the reason PostHog has never seen `marketing_form_submitted` is not a missing
constant. It is that the contact form never renders, and `/merchants/join` had
~59 words of traffic. **No analytics work is required in Step 5** beyond confirming
the event fires once the form is visible. The event name sits outside the
`marketing_*` prefix the audit filtered on only in the sense that it *is*
`marketing_form_submitted` — it should have appeared; it has simply never fired.

### Files involved

- `maanta-app/src/components/marketing/EnquiryRouter.tsx` — the fix
- `maanta-app/src/app/(marketing)/contact/page.tsx` — the `Suspense` boundary
- `maanta-app/src/app/(marketing)/waitlist/waitlist-form.tsx` — the reference pattern
- `maanta-app/src/app/api/contact/route.ts` + `__tests__/route.test.ts` — the wired
  endpoint; **unchanged by this step**, and its test already passes
- `maanta-app/src/lib/marketing/analytics-events.ts` — read only

### Blockers

End-to-end email verification and the PostHog event check are **UNVERIFIABLE
HERE** — they need production, Resend and PostHog.

---

## 7. Step 6 — `/pricing`, `/merchants/join`, `/feed`

### 6a — `/pricing`

`maanta-app/src/app/(marketing)/pricing/page.tsx`. **Verdict: CONFIRMED unfinished.**

- **No `export const metadata`** — confirmed absent; the file starts straight at
  imports and `export default function PricingPage()`.
- **No `opengraph-image.tsx`** — the six that exist are
  `(marketing)/opengraph-image.tsx` and the same file under `about/`, `contact/`,
  `mall-operators/`, `merchants/`, `shoppers/`. `pricing/` has none.
- **Pattern to copy:** each of those six is a thin route file calling `ogImage({
  eyebrow, headline, subline })` from `maanta-app/src/lib/marketing/og.tsx`, which
  exports `OG_SIZE` and `OG_CONTENT_TYPE` alongside. Adding one is ~15 lines.
- **RESOLVED — the `/pricing.rsc` live-deals question.** The audit asked (`VERIFY IN
  REPO`) whether a `live-deals,BBS Mall` fetch remains. **It does not.** The page
  imports exactly three things — `formatKes` from `@/lib/ui`, `SUCCESS_FEE_KES` from
  `@/lib/pricing`, `FACTS` from `@/lib/marketing/facts` — has no `fetch`, no
  `async`, and no cache directives. It is a pure static component. The logged error
  came from a superseded deployment.
- **Numbers are already single-sourced** and must stay that way: `SUCCESS_FEE_KES`
  is imported, never retyped (a CLAUDE.md enforced rule), and
  `FACTS.elitePerMonthKes` / `FACTS.boostPer24hKes` / `FACTS.boostHours` /
  `FACTS.standardActiveDeals` / `FACTS.eliteActiveDeals` supply the rest. Any new
  copy must read from `facts.ts`.
- **The page has an `<h1>`** ("Simple pricing") — the audit did not flag one, and
  none is needed.

### 6b — `/merchants/join` — **the one real structural blocker in Step 6**

`maanta-app/src/app/(marketing)/merchants/join/page.tsx:1` is **`"use client"`**.

**A client component cannot export `metadata`.** Next.js will not accept it. So
"add authored metadata" is not a one-line change here, unlike `/pricing`. The
required shape is:

1. extract the form body into a sibling client component (e.g.
   `merchants/join/join-form.tsx`, mirroring how `waitlist/page.tsx` +
   `waitlist/waitlist-form.tsx` are already split — **that split is the in-repo
   precedent, copy it**);
2. make `page.tsx` a server component that exports `metadata` and renders the form.

The page uses `useState`, `useRouter` and `trackMarketing`, so the client boundary
genuinely has to exist — it just has to move down one level.

Its OG image: there is no `merchants/join/opengraph-image.tsx`, so Next resolves the
nearest ancestor, `merchants/opengraph-image.tsx`. That is the inheritance the audit
observed. Either add a file or accept it once the title is authored to match.

### 6c — `/feed` — root cause of the duplicate `<main>` FOUND

`maanta-app/src/app/(shopper)/feed/`:

| Defect | Repo location | Note |
|---|---|---|
| No authored title/description | `feed/page.tsx` — no `export const metadata` | The file also sets `export const dynamic = "force-dynamic"` |
| No `og:image` | same | Nothing in the `(shopper)` tree emits one; the root `(marketing)/opengraph-image.tsx` does not apply across route groups |
| No `<h1>` | `feed/page.tsx` | Starts at `<h2>` |
| **Duplicate `<main>`** | **`maanta-app/src/app/(shopper)/feed/loading.tsx:6`** | `<main className="px-4 pt-4">` — an **exact class match** for the audit's *"empty `class="px-4 pt-4"` skeleton"* |

The duplicate `<main>` is the Suspense loading skeleton, not a stray element in the
page. Because `/feed` is `force-dynamic`, the skeleton streams into the HTML
alongside the real content. **The fix is to change `loading.tsx`'s `<main>` to a
`<div>`** — a one-word edit in a file nobody would have opened while reading
`page.tsx`.

Note `(shopper)/layout.tsx` does **not** declare a `<main>`, so the real one comes
from within the page tree. Confirm which element the audit saw as `max-w-mobile`
before changing anything else.

Also confirmed: the shopper layout mounts `<DemoModeBanner />` at
`(shopper)/layout.tsx:10` — correct and **must not be removed**;
`marketing-shell.test.ts` fails in both directions on this.

### Guard to extend

`maanta-app/src/lib/__tests__/marketing-a11y.test.ts:55-66` holds a hardcoded
`TOP_LEVEL` array of pages that must export metadata. It currently lists ten:
root, `shoppers`, `merchants`, `mall-operators`, `about`, `contact`, and the four
legal routes. **`pricing`, `merchants/join`, `faq`, `help`, `waitlist`, `download`
and `malls/bbs-mall` are not in it** — which is exactly the hole GAP-02 and GAP-06
fell through. Extend this array in the same commit as the fix, or the gap reopens.

---

## 8. Step 7 — Legal fact-fill and the robots decision

### 7a — LEG-01, the three unfinished cells — **this is not a copy edit**

**Verdict: CONFIRMED, and materially easier than the plan assumes.**

The string *"to be confirmed with engineering"* is **not in any markdown file.** It
is generated by a component:

`maanta-app/src/components/marketing/LegalDoc.tsx:28-38`

```tsx
function PendingValue({ name }: Token) {
  const owner = TOKEN_OWNERS[name] ?? "MAANTA";
  return (<span … title={`Token ${name} — owner: ${owner}`}>to be confirmed with {owner}</span>);
}
```

The markdown carries `{{TOKEN}}` placeholders. `LegalDoc` resolves each against
`RESOLVED_TOKENS`, and renders `PendingValue` when there is no answer.

`maanta-app/src/lib/marketing/legal-docs.ts:73-77`:

```ts
export const TOKEN_OWNERS: Record<string, string> = {
  CLERK_REGION: "engineering",
  SENTRY_REGION: "engineering",
  AUTH_COOKIE_LIFETIME: "engineering",
};
```

**Those are precisely the audit's three cells** — Clerk processing location, Sentry
processing location, session-cookie retention. Nothing else is unresolved.

**The whole of Step 7a is therefore:** add three entries to `RESOLVED_TOKENS`
(alongside the existing `SUPABASE_REGION: "the EU (Ireland)"` and
`RESEND_REGION: "the United States"`, which show the register), and delete the
three from `TOKEN_OWNERS`. **Zero markdown files are touched.** The plan's
instruction *"Change nothing else on those pages"* is structurally guaranteed.

Content files, for reference only — **do not edit**:
`maanta-app/src/content/legal/{privacy-policy,terms-of-service,merchant-terms,cookie-notice}.md`.

The three values themselves are **UNVERIFIABLE HERE** — they must be read from the
Clerk dashboard (data region + session lifetime) and the Sentry project settings.
This is a lookup, not a decision.

Minor note: `PLACEHOLDER_IDS.odpc` in `maanta-app/src/lib/marketing/demo.ts` is
`"ODPC-DEMO-0000-NOT-REGISTERED"`. The audit transcribes it as
`DEMO-ODPC-NOT-REGISTERED`. The repo value is authoritative; either way, **leave it
alone** — `demo.ts`'s docblock argues at length why a plausible-looking fake is the
version that causes harm.

### 7b — LEG-02, robots vs `noindex` — **RESOLVED 2026-08-01: the audit is wrong**

> **Settled against production HTML.** `/privacy` and `/cookies` both emit
> `<meta name="robots" content="noindex, nofollow"/>`. The audit's §6.2 premise —
> "carry no `noindex` meta tag" — does not hold. The likely cause of the miss is
> that the tag is `name="robots"` while the audit's other head checks look for
> `property=` (the Open Graph convention). Recorded as **D42, closed**.
>
> **Two consequences.** First, **do not add `noindex` to anything** — option A is
> already implemented. Second, `marketing-a11y.test.ts` is *vindicated*: its
> source-level assertion was checked against render and matched. It is the one
> guard in this repo confirmed against rendered output rather than merely read,
> which is a useful data point for Step 2 — the source-reading guards are not all
> wrong, they are unverified.
>
> The rest of this section is retained because its reasoning is what predicted the
> result, and because the `DEMO_MODE` coupling it describes still governs Step 7b.

The audit reports zero `noindex` tags on all four legal pages. **The source sets
them on all four.** Each of
`maanta-app/src/app/(marketing)/{privacy,terms,merchant-terms,cookies}/page.tsx`
carries, identically:

```ts
robots: DEMO_MODE ? { index: false, follow: false } : undefined,
```

`DEMO_MODE` is a plain constant — `maanta-app/src/lib/marketing/demo.ts:21`,
`export const DEMO_MODE = true;` — not an env var and not a database row.

**This is the important part.** `maanta-app/src/app/robots.ts` builds its disallow
list from **the same constant**:

```ts
...(DEMO_MODE ? LEGAL_ROUTES : []),
```

So the `robots.txt` disallow and the page `noindex` cannot disagree — one constant
drives both. The audit **confirms the disallow lines are live**, which means
`DEMO_MODE` was `true` at build, which means the `noindex` should have rendered.

Two possibilities, and they lead to opposite work:

1. **The audit's scan missed the tag.** Next emits
   `<meta name="robots" content="noindex, nofollow"/>` — a `name=` attribute, where
   most of the audit's other checks look for `property=` (the OG convention). If so,
   **LEG-02 is not a defect at all**, option A is already implemented, and the only
   live question is the founder's A-vs-B ruling on the `Disallow` lines.
2. **The tag genuinely is not emitted**, in which case there is a real Next.js
   metadata bug on those four routes — and `marketing-a11y.test.ts`'s source-level
   assertion is a textbook vacuous guard, caught by Step 2's own logic.

**Cursor must resolve this before writing any code:**

```bash
for p in /privacy /terms /merchant-terms /cookies; do
  echo "== $p"; curl -s "https://www.maanta.app$p" | grep -i 'name="robots"'
done
```

Do **not** add `noindex` to pages that already have it.

### The founder decision is narrower than the audit frames it

Because `noindex` is (very likely) already present, the ruling reduces to a single
question: **keep or remove the four `Disallow` lines in
`maanta-app/src/app/robots.ts`?** Option A keeps them; option B removes them so app
stores and PSPs can fetch `/privacy`. Either way `noindex` stays. The change, if B
is chosen, is deleting `...(DEMO_MODE ? LEGAL_ROUTES : [])` from the `disallow`
array — one line.

Related, and worth surfacing in the same ruling: the same `DEMO_MODE` flip also
adds the four legal routes to the sitemap and drops every pre-launch disclosure —
`demo.ts`'s docblock states that is deliberate and atomic. **The founder should not
flip `DEMO_MODE` to answer LEG-02.**

---

## 9. Findings this map adds that are in neither source document

| # | Finding | Where |
|---|---|---|
| 1 | `held-claims.test.ts:42` has the same `://` comment-stripper bug; `038e3bc0` does not fix it | §2 |
| 2 | `main` and production diverged in **both** directions; production is missing only docs and `.gitignore` | §2 |
| 3 | `.gitignore` is modified on both sides — the one expected merge conflict | §2 |
| 4 | `/how-it-works` is already a `permanent: true` 308 in `next.config.mjs` | §4 |
| 5 | `metadataBase` is already set; only canonicals and per-page OG are missing | §5 |
| 6 | `/waitlist`'s form is a **client** component, not server-rendered — the plan's stated pattern is wrong | §6 |
| 7 | `marketing_form_submitted` exists **and is called** — no analytics work needed | §6 |
| 8 | `/merchants/join` is `"use client"`, so metadata needs a component split, not a one-liner | §7 |
| 9 | `/feed`'s duplicate `<main>` is `feed/loading.tsx:6`, not `page.tsx` | §7 |
| 10 | LEG-01 is three entries in `legal-docs.ts`; no markdown is touched | §8 |
| 11 | Legal `noindex` **is** set in source, from the same constant that drives the `robots.txt` disallow | §8 |
| 12 | `marketing-a11y.test.ts`'s `TOP_LEVEL` array is the specific hole GAP-02/GAP-06 fell through | §7 |
| 13 | `node_modules` is absent; `npm test` currently fails to start | §1 |
| 14 | `/pricing` has no live-deals fetch — that `VERIFY IN REPO` is closed | §7 |

---

## 10. What remains genuinely unverifiable in this environment

Everything below needs production, a dashboard, or a browser. None of it is
answered in this document, and none of it should be marked done from source.

- Whether `/how-it-works` returns 308 or 200 today (§4).
- Whether the four legal pages emit `noindex` in rendered HTML (§8).
- The Clerk data region, Clerk session lifetime, and Sentry region (§8).
- Vercel `githubCommitRef` on the production deployment (§2).
- Lighthouse under the *clerk* auth strategy — RISK-04.
- `app_config.demo_mode_enabled` on production — drift **D14**, still open.
- Whether `marketing_form_submitted` reaches PostHog once the form renders (§6).
- Any external print asset or QR code pointing at `/how-it-works` (§4).
