# Cursor handoff — marketing site finish pass

**Date:** 2026-08-01
**Read first:** `docs/ops/marketing-site-repo-map.md` (repo truth, with `path:line`)
**Source documents:** `docs/ops/marketing-site-gap-audit.md`, `docs/ops/marketing-site-finish-plan.md`
**Checklist:** `docs/ops/marketing-site-finish-checklist.md`

---

## The one thing to understand before you start

The gap audit was written **without reading the repo**. It is excellent on what
production *serves* and guesses at where that lives. The repo map is the
correction layer. Where the two disagree, **the map tells you which claim to test,
not which one to believe** — and there are three such disagreements, all listed in
§3 below.

Two of the seven steps are already done in the repo. If you work the plan
front-to-back without reading the map first, you will spend a session re-fixing
`/how-it-works` and re-adding `metadataBase`.

---

## 1. Already done — do not redo

Verified in the files at `origin/main`. Re-implementing any of these is wasted work
and risks regressing a passing guard.

| Thing | Evidence |
|---|---|
| Six target pages in a shared `(marketing)` layout, header + footer + skip link | `src/app/(marketing)/layout.tsx` |
| Footer covers all four required categories + brand + pre-launch disclosure | `src/components/marketing/SiteFooter.tsx`, `src/lib/marketing/nav.ts` |
| `/how-it-works` → `/shoppers`, **`permanent: true` (308)** | `next.config.mjs:29` — **Step 3 is very likely already satisfied** |
| `metadataBase` set on the root layout | `src/app/layout.tsx:33` — **Step 4 item 1 is done** |
| Four legal docs, dated, DRAFT-bannered, rendered from `src/content/legal/*.md` | `src/components/marketing/LegalDoc.tsx` |
| `sitemap.xml` (13 routes) and `robots.txt`, both generated from `nav.ts` | `src/app/sitemap.ts`, `src/app/robots.ts` |
| Six page-specific OG images, generated at build | `src/lib/marketing/og.tsx` + 6 `opengraph-image.tsx` |
| `/contact` wired to `/api/contact` via Resend, with a passing route test | `src/app/api/contact/route.ts` + `__tests__/` |
| **`marketing_form_submitted` exists and is called** on both forms | `src/lib/marketing/analytics-events.ts:18`; `EnquiryRouter.tsx:130`; `merchants/join/page.tsx:47` |
| WhatsApp placeholder eliminated; one constant sitewide | `ENTITY.whatsappLink` in `src/lib/marketing/demo.ts` |
| Token gate scanning **build output** | `scripts/check-tokens.mjs` — the only check in the repo that reads rendered HTML |
| Legal `noindex` set in source on all four pages | `robots: DEMO_MODE ? { index: false, follow: false }` — see §3 |
| Demo banner scoped off marketing, kept on both app shells | `(shopper)/layout.tsx:10`, `merchant/(app)/layout.tsx` |

---

## 2. Prep before the first commit

```bash
cd maanta-app && npm install     # node_modules is ABSENT — `npm test` currently
                                 # fails with `vitest: not found`, which is not a
                                 # green suite
npm test                         # establish a real baseline
npm run build                    # produces .next/server/app — every new guard
                                 # needs this directory to exist
```

Do not report any test as passing until `npm install` has run.

---

## 3. The three source-vs-render disagreements — resolve these first

Each is a place where the repo says one thing and production reportedly says
another. **Run the check. Do not fix from either side alone.**

### 3.1 `/how-it-works` — repo says 308, audit saw 200

```bash
curl -sI https://www.maanta.app/how-it-works | head -3   # redirect-following OFF
```

The audit's evidence (200, `x-matched-path: /shoppers`, byte-identical body) is
also exactly what a **followed** 308 looks like. If this returns 308, close Step 3
without touching `next.config.mjs`.

### 3.2 Legal `noindex` — **RESOLVED 2026-08-01, no action needed**

Checked against production HTML: `/privacy` and `/cookies` both emit
`<meta name="robots" content="noindex, nofollow"/>`. The audit was wrong — the tag
is `name="robots"`, and its other head checks look for `property=`.

**Do not add `noindex` to any legal page.** Option A is already implemented. The
founder ruling narrows to one line in `src/app/robots.ts` (see §6). Drift **D42**
is closed. `marketing-a11y.test.ts` is vindicated rather than vacuous.

### 3.3 `/pricing` live-deals fetch — audit asked, repo answers no

Already resolved by inspection: `pricing/page.tsx` has no `fetch`, no `async`, and
imports only `formatKes`, `SUCCESS_FEE_KES` and `FACTS`. Nothing to remove.

---

## 4. What must be implemented, in the safest order

### PR-A — Step 1: reconcile `main` and production **(blocking, do first)**

`main` and the production branch have diverged **both ways**. `main` is missing the
guard fix; production is missing only `.gitignore` and a docs file.

```bash
git fetch origin
git log --oneline origin/main..origin/claude/maanta-marketing-site-y8fesm
git log --oneline origin/claude/maanta-marketing-site-y8fesm..origin/main
```

> **DONE IN THE REPO, 2026-08-01.** `038e3bc0`, `6a22c0f` and `480bdf6` are merged
> into `claude/marketing-site-repo-prep-010wpw`, cleanly. `origin/main` is an
> ancestor of that branch, so **`main` can fast-forward to it** — no rebase, no
> cherry-pick. The `.gitignore` conflict predicted here **did not occur**: `314b5ef`
> already carried the same three lines including `.tools/`. Prediction withdrawn.
>
> Two things remain, and neither is a repo operation: update `main`, and redeploy
> production from it.
>
> **The guard fix is proved, not assumed.** Planting `https://wa.me/254700000000`
> into a marketing page turns `marketing-shell.test.ts` red on the reconciled tree —
> and the *same mutation passes 7/7 against `origin/main`'s copy of that file*. `main`
> would ship the D36 placeholder number undetected. That is rows 1 of the Step 2
> table, observed.
>
> **One correction to this document's own earlier claim:** `pricing-copy`'s *fee*
> pattern was never vacuous — `KES 40 success fee` fails on `main` too. The vacuity
> in that file was confined to the Elite-trial / launch-offer trigger, which fired on
> a JSX comment instead of rendered copy. Mutate *that* to prove the second half.

Do not skip this. Until `main` is updated, every guard someone relies on when
working from `main` is still the vacuous version.

### PR-B — Step 2: mutation-test the guards **(gates everything after)**

**Budget for ten rows, not nine.** The tenth:
`src/lib/__tests__/held-claims.test.ts:42` carries the *same* `://` comment-stripper
bug that `038e3bc0` fixed in the other two files, and neither branch fixes it:

```ts
.replace(/\/\/.*$/gm, "")   // truncates every line at the first `//`, URLs included
```

Port the `lineCommentAt()` helper from `038e3bc0` into it.

**The structural finding that matters more than any individual guard:** every
marketing guard reads `.tsx` source via `readFileSync`. Exactly one check in the
repo reads built HTML — `scripts/check-tokens.mjs`. That is why GAP-01 shipped: no
guard in this repo has ever been capable of noticing that a form present in JSX is
absent from HTML. Build new guards on that walker.

### PR-C — Steps 3 + 4: canonical and Open Graph

`metadataBase` is done. What is missing:

- **Zero canonicals sitewide** — no `alternates` key exists in any marketing page.
- **Root `openGraph.url` is hardcoded to the origin** (`src/app/layout.tsx:47`), and
  a page-level `openGraph` replaces the parent's object wholesale — which is why
  the five richest pages lose `og:url`, `og:site_name`, `og:locale` and `og:type`.

Create the helper (`src/lib/seo/page-metadata.ts` or, to match this codebase's
conventions, `src/lib/marketing/page-metadata.ts` — `src/lib/seo/` does not exist).
**It must read the same `NEXT_PUBLIC_APP_URL ?? "https://www.maanta.app"` constant
the root layout uses**, or previews will emit production canonicals.

Fix the GAP-05 split-sentence OG pairs in the same pass —
`mall-operators/page.tsx:52` and `about/page.tsx:48`. This is marketing copy and is
in scope; nothing in Step 4 touches legal or commercial copy.

Do not add a canonical to `src/app/not-found.tsx`.

### PR-D — Step 5: server-render the `/contact` form

Root cause confirmed exactly as the audit predicted: `EnquiryRouter.tsx:79` calls
`useSearchParams()`, and `contact/page.tsx:99-104` wraps it in a `Suspense` whose
fallback is the grey pulsing rectangle.

**Correction to the finish plan.** It says `/waitlist`'s form is "fully
server-rendered — copy that pattern". It is not: `waitlist-form.tsx:1` is
`"use client"`. It prerenders because it is a **client component that never calls
`useSearchParams()`**. That is the pattern to copy.

Cheapest correct fix: drop `useSearchParams`, delete the `Suspense` boundary, and
read `?topic=` after hydration (or from the page's `searchParams` prop). **If you
take the `searchParams` prop route, note it opts `/contact` out of static
rendering** — confirm that trade before committing.

No analytics work needed: `marketing_form_submitted` is already fired at
`EnquiryRouter.tsx:130`. It has never appeared in PostHog because the form has
never rendered.

Add the guard the plan asks for — `/contact`'s **built** HTML contains a `<form>`
and zero `BAILOUT_TO_CLIENT_SIDE_RENDERING`.

### PR-E — Step 6: `/pricing`, `/merchants/join`, `/feed`

- **`/pricing`** — add metadata via the PR-C helper; add
  `pricing/opengraph-image.tsx` on the existing pattern (thin file calling
  `ogImage()` from `src/lib/marketing/og.tsx`); expand the page reusing `/merchants`
  copy. Every number must come from `facts.ts` / `SUCCESS_FEE_KES` — never retyped.
- **`/merchants/join`** — **structural blocker**: the page is `"use client"`, and a
  client component cannot export `metadata`. Split it the way
  `waitlist/page.tsx` + `waitlist/waitlist-form.tsx` are already split: server page
  exports metadata, client child holds the form. That split is the in-repo
  precedent — copy it rather than inventing one.
- **`/feed`** — the duplicate `<main>` is **`(shopper)/feed/loading.tsx:6`**, not
  `page.tsx`. Its `className="px-4 pt-4"` is an exact match for the audit's
  description. Change that `<main>` to a `<div>`. Then add metadata, an `og:image`
  and an `<h1>` to `page.tsx`. Do **not** move `/feed` into the marketing layout,
  and do **not** remove `<DemoModeBanner />` from `(shopper)/layout.tsx:10` —
  `marketing-shell.test.ts` fails in both directions on that.
- **Extend `marketing-a11y.test.ts:55-66`** — its hardcoded `TOP_LEVEL` array lists
  only ten pages and omits `pricing` and `merchants/join`. That omission *is* the
  hole GAP-02 and GAP-06 fell through. Extend it in the same commit or the gap
  reopens.

### PR-F — Step 7: legal fact-fill, then the robots ruling

**7a is not a copy edit.** The string "to be confirmed with engineering" is
generated by `LegalDoc.tsx`'s `PendingValue` component from unresolved `{{TOKEN}}`
placeholders. The three unfinished cells are exactly the three entries in
`src/lib/marketing/legal-docs.ts:73-77`:

```ts
export const TOKEN_OWNERS = {
  CLERK_REGION: "engineering",
  SENTRY_REGION: "engineering",
  AUTH_COOKIE_LIFETIME: "engineering",
};
```

Move all three into `RESOLVED_TOKENS` above it, with real values. **Do not open a
single markdown file.** The plan's "change nothing else on those pages" is
structurally guaranteed by doing it this way.

**7b needs the founder — see §6.**

---

## 5. Exact repo areas to touch, and exact areas not to

### Touch

```
maanta-app/src/lib/__tests__/held-claims.test.ts        PR-B  (the third vacuous guard)
maanta-app/src/lib/__tests__/marketing-a11y.test.ts     PR-E  (TOP_LEVEL array)
maanta-app/src/lib/marketing/page-metadata.ts   (NEW)   PR-C
maanta-app/src/app/layout.tsx                           PR-C  (openGraph.url only)
maanta-app/src/app/(marketing)/**/page.tsx              PR-C  (route through helper)
maanta-app/src/components/marketing/EnquiryRouter.tsx   PR-D
maanta-app/src/app/(marketing)/contact/page.tsx         PR-D  (Suspense boundary)
maanta-app/src/app/(marketing)/pricing/page.tsx         PR-E
maanta-app/src/app/(marketing)/pricing/opengraph-image.tsx (NEW) PR-E
maanta-app/src/app/(marketing)/merchants/join/page.tsx  PR-E  (split server/client)
maanta-app/src/app/(shopper)/feed/loading.tsx           PR-E  (<main> → <div>)
maanta-app/src/app/(shopper)/feed/page.tsx              PR-E
maanta-app/src/lib/marketing/legal-docs.ts              PR-F  (three tokens)
maanta-app/src/app/robots.ts                            PR-F  (only after the ruling)
docs/maanta-drift-register.md                           every PR
```

### Do not touch

- `maanta-app/src/content/legal/*.md` — **no legal prose changes anywhere in this
  plan.**
- `maanta-app/src/lib/marketing/demo.ts` — `DEMO_MODE`, `PLACEHOLDER_IDS`,
  `REGULATORY_STATUS`. Flipping `DEMO_MODE` is a launch action, not a fix, and it
  atomically removes every pre-launch disclosure sitewide.
- `PLACEHOLDER_IDS.odpc` (`"ODPC-DEMO-0000-NOT-REGISTERED"`) — deliberate, argued
  in the file's docblock. Never invent a real number.
- `src/lib/marketing/nav.ts` structure — the footer and IA are done.
- `(shopper)/layout.tsx` / `merchant/(app)/layout.tsx` demo-banner mounts.
- `SUCCESS_FEE_KES` — re-declaring it anywhere fails `pricing-copy.test.ts`.
- `next.config.mjs` — unless §3.1 proves the redirect is genuinely not working.
- The IA, the footer design, and the six target pages' structure.

---

## 6. What requires a founder decision

> **RULED AND APPLIED, 2026-08-01 — option B.** The `Disallow` lines are removed
> from `src/app/robots.ts`; `noindex` stays on all four pages; `DEMO_MODE` is
> untouched. Recorded in `docs/maanta-decisions-log.md` and verified against built
> output. **Step 7b is done — PR-F is now 7a only.** Nothing below needs deciding;
> it is retained as the rationale.

**LEG-02 — the four legal pages' `Disallow` lines. `DECISION REQUIRED — FOUNDER`.**

The repo map narrows this considerably. Because `noindex` is already set in source
from the same `DEMO_MODE` constant that drives the `robots.txt` disallow, the
ruling is not "noindex or not" — it is one question:

> Keep the four `Disallow` lines in `src/app/robots.ts`, or remove them so app
> stores and payment providers can fetch `/privacy`?

- **Option A** — keep them. Consistent, may block reviewers.
- **Option B** — remove them; `noindex` still prevents ranking. **Recommended if any
  store or PSP submission is near.** The change is deleting
  `...(DEMO_MODE ? LEGAL_ROUTES : [])` from the `disallow` array.

Confirm §3.2 before putting this to the founder — if the `noindex` turns out not to
render, the question changes.

**Not a founder decision, despite looking like one:** the three Clerk/Sentry values
in 7a. Those are lookups in the Clerk and Sentry dashboards, not rulings.

---

## 7. What must be verified against built HTML, never source

This build has now produced three defects that were correct in JSX and wrong in the
rendered output. Treat source agreement as a hypothesis.

| Claim | How to verify |
|---|---|
| `/contact` renders a form | `curl -s …/contact \| grep -c '<form'` ≥ 1, and `BAILOUT_TO_CLIENT_SIDE_RENDERING` count 0 |
| Every route has a canonical and a self-referencing `og:url` | the loop in finish plan §4 |
| No sitemap route serves the root-default title | finish plan §6 acceptance block — note the casing tell: root default says **"Maanta"**, authored pages say **"MAANTA"** |
| `/how-it-works` is a 308 | `curl -sI`, redirect-following **off** |
| Legal pages emit `noindex` | `grep -i 'name="robots"'` |
| `/feed` has exactly one `<main>` | `grep -c '<main'` = 1 |
| No "to be confirmed" survives | `grep -i 'to be confirmed'` = 0 |
| No `{{TOKEN}}` survives | `npm run build` (chained gate) |

Anything a guard asserts by reading a `.tsx` file proves only that the source says
so. That is the entire lesson of `038e3bc0`, and of GAP-01.

---

## 8. Per-PR obligations

1. **Update `docs/maanta-drift-register.md` in the same commit as the fix**, not
   after. D34 sat `open` for four commits while the implementation report called it
   closed. Rows **D37–D40** are already open for this work — close them by ID,
   do not write new rows describing the same findings.
2. A closed row must cite a guard — a test, a migration, or a decisions-log entry —
   or say `no guard: <reason>`. `drift-register.test.ts` enforces this, and it also
   fails if a cited path does not exist.
3. Bump `Last updated` at the top of the register; the test compares it against the
   newest row.
4. One step, one PR. A step is done when its check passes against **built HTML**.
5. CLAUDE.md's mandatory session rule: leave a durable artifact every session.
