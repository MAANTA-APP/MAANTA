# Marketing site — finish checklist

**Date:** 2026-08-01
**Companions:** `docs/ops/marketing-site-repo-map.md`, `docs/ops/cursor-marketing-site-finish-handoff.md`
**Source:** `docs/ops/marketing-site-gap-audit.md`, `docs/ops/marketing-site-finish-plan.md`

Operational only. Tick nothing from source agreement alone — items marked
**`[HTML]`** require built or fetched output, and items marked **`[EXT]`** require a
system outside this repo (Vercel, PostHog, Clerk, Sentry, production).

---

## 0. Prep

- [x] `cd maanta-app && npm install` — verified 2026-08-01
- [x] `npm test` runs and reports a real result
- [x] Baseline recorded: **481 passed / 0 failed, 61 files** (matches the
      phase-6 audit count — the suite has not drifted)
- [x] `npm run build` succeeds; `.next/server/app` exists; token gate clean
      (47 rendered files scanned)
- [x] `npm run typecheck` clean
- [ ] Read `docs/ops/marketing-site-repo-map.md` §9 (findings absent from both source docs)

---

## 1. Repo verification — resolve before writing code

The three source-vs-render disagreements. Record the observed value, not an opinion.

- [ ] **`[HTML]`** `curl -sI https://www.maanta.app/how-it-works | head -3` → status: ______
  - [ ] 308 + `location: /shoppers` → **Step 3 already done**; close it, edit nothing
  - [ ] 200 → escalate: the cause is outside `next.config.mjs:29`
- [x] **`[HTML]`** legal `noindex` → **PRESENT** on `/privacy` and `/cookies`
      (`content="noindex, nofollow"`), verified 2026-08-01. Audit refuted, D42 closed.
  - [x] LEG-02 reduces to the `Disallow` ruling only — **add no `noindex`**
  - [ ] optional: repeat for `/terms` and `/merchant-terms` (same source pattern, expected present)
- [x] `/pricing` carries no live-deals fetch — verified by inspection, nothing to remove
- [x] `metadataBase` already set (`src/app/layout.tsx:33`) — do not re-add
- [x] `marketing_form_submitted` exists and is called — no analytics work in Step 5

---

## 2. Step 1 — branch / main reconcile *(blocking)*

- [ ] `git fetch origin`
- [ ] `git log --oneline origin/main..origin/claude/maanta-marketing-site-y8fesm` → expect 3 commits
- [ ] `git log --oneline origin/claude/maanta-marketing-site-y8fesm..origin/main` → expect 2 commits
- [x] `038e3bc0`, `6a22c0f`, `480bdf6` merged into the finish-pass branch —
      **clean, no conflicts.** `origin/main` is an ancestor of that branch, so `main`
      can fast-forward to it.
- [x] ~~`.gitignore` conflict~~ — **does not occur.** `314b5ef` already carried the
      same three lines including `.tools/`; both sides are byte-identical. Prediction
      withdrawn.
- [x] `main` updated — PR #155 merged as `136af6b`, **merge commit not squash**
      (a squash would rewrite `038e3bc0` out of `main`'s ancestry and fail the
      acceptance check below while appearing to pass)
- [x] **`[EXT]`** production redeployed from `main` — `dpl_A14D3ms…`,
      `githubCommitRef: main`, 03:26:34 UTC, by the GitHub integration on merge
- [x] **`[EXT]`** verified by rendered truth: live `robots.txt` serves the eleven
      operational `Disallow` lines, legal routes absent
- [x] **D37 closed**
- [ ] `git merge-base --is-ancestor 038e3bc0 origin/main && echo OK`
- [ ] **`[EXT]`** production redeployed from `main`
- [ ] **`[EXT]`** Vercel production deployment reports `githubCommitRef: main`
      — **as of 2026-08-01 01:07 UTC it reads `claude/maanta-marketing-site-y8fesm`
      on `dpl_8Pvcon…`; do NOT "roll back" to the `314b5ef` deployment, that
      discards the guard fix**
- [ ] Branch `claude/maanta-marketing-site-y8fesm` deleted after merge
- [ ] Drift row **D37** closed with evidence

---

## 3. Step 2 — guard mutation pass *(gates steps 3–7)*

One row per guard: mutation applied → `FAIL` observed → mutation reverted.

- [x] `marketing-shell.test.ts` — WhatsApp constant → planted `https://wa.me/254700000000`
      in a marketing page. **FAIL observed** on the reconciled tree; **same mutation
      PASSES 7/7 on `origin/main`'s copy** — the vacuity, demonstrated. Reverted.
- [ ] `marketing-shell.test.ts` — demo-banner scoping → mount the banner on the marketing layout
- [ ] `marketing-shell.test.ts` — `NODE_TEAM` staffing copy → replace with "our team"
- [x] `pricing-copy.test.ts` — success fee → planted `KES 40 success fee` in rendered
      JSX. **FAIL observed.** Note: this one **also fails on `origin/main`** — the fee
      pattern was never vacuous. Reverted.
- [ ] `pricing-copy.test.ts` — launch offer → drop the first-100 cap from the offer line.
      **This is the one that was actually vacuous on `main`** (the `mentionsOffer`
      trigger fired on a JSX comment rather than rendered copy). Mutate it against both
      trees — it is the row that proves the second half of `038e3bc0`.
- [ ] `elite-trial.test.ts` — trial terms → `30-day` to `60-day`
- [ ] `held-claims.test.ts` — held claim / draft banner → remove a banner from one legal page
- [ ] `marketing-analytics.test.ts` — payload privacy → add a `name` or `phone` field to a `trackMarketing` call
- [ ] `marketing-a11y.test.ts` — link integrity / one `<main>` / per-page metadata → point a footer link at a dead route
- [ ] `scripts/check-tokens.mjs` — plant a `{{TOKEN}}` in a rendered page; `npm run build` must fail
- [x] **Tenth row — `held-claims.test.ts`**: `lineCommentAt()` ported in and `codeOnly()`
      rewritten. Planted `anything left in your balance stays yours` on the same line as
      an `https://` link → **FAIL observed**; **same mutation passes 5/5 on `origin/main`'s
      copy**. Negative controls green (claim inside a `{/* */}` comment, and after a real
      `//` comment, both still ignored). Reverted. **D38 closed.**
- [x] Comment stripping extracted to `src/lib/__tests__/helpers/comment-stripping.ts`
      — one implementation, three importers. Re-verified with a four-positive /
      four-negative mutation matrix after the refactor. **D38 closed.**
- [ ] Any guard that cannot be made to fail is fixed or deleted — **not left green**
- [ ] Mutation table committed
- [ ] Every guard that asserts a *rendered* property has been rewritten to read `.next/server/app/**` — model on `scripts/check-tokens.mjs`

---

## 4. Step 3 — `/how-it-works`

- [ ] §1 check completed and recorded
- [ ] If 308: no code change; finding recorded, drift row **D38** closed
- [ ] If 200: cause identified outside `next.config.mjs`, fixed, retested
- [ ] **`[HTML]`** `/sitemap.xml` contains `/shoppers` once, `/how-it-works` zero times

---

## 5. Step 4 — canonical and Open Graph

- [ ] Metadata helper created (`src/lib/marketing/page-metadata.ts` or `src/lib/seo/`)
- [ ] Helper reads the **same** `NEXT_PUBLIC_APP_URL ?? "https://www.maanta.app"` constant as `src/app/layout.tsx`
- [ ] Root `openGraph.url` no longer hardcoded to the bare origin
- [ ] All 15 existing marketing pages routed through the helper
- [ ] `alternates.canonical` set per page
- [ ] `og:url`, `og:site_name`, `og:locale`, `og:type` preserved on the five pages that declare their own `openGraph`
- [ ] GAP-05 fixed: `mall-operators/page.tsx:52` OG title/description stand alone
- [ ] GAP-05 fixed: `about/page.tsx:48` OG title/description stand alone
- [ ] No canonical added to `src/app/not-found.tsx`
- [ ] **`[HTML]`** every route prints a canonical whose `href` is its own URL
- [ ] **`[HTML]`** every route prints an `og:url` equal to its own URL, never the bare origin
- [ ] New guard added, asserting against **built HTML**, failing on zero canonicals or an origin-equal `og:url`
- [ ] Drift row **D39** updated

---

## 6. Step 5 — `/contact` form in server HTML

- [ ] `useSearchParams()` removed from the render path, or `?topic=` read via the page's `searchParams` prop
- [ ] If `searchParams` prop used: the loss of static prerendering on `/contact` is accepted and recorded
- [ ] `Suspense` fallback no longer a bare pulsing rectangle (boundary removed, or fallback is real form markup)
- [ ] Pattern followed is `waitlist-form.tsx` — a **client** component with no `useSearchParams` (not a server form)
- [ ] `<noscript>` block added naming WhatsApp and `admin@maanta.app`
- [ ] **`[HTML]`** `grep -c 'BAILOUT_TO_CLIENT_SIDE_RENDERING'` on `/contact` = **0**
- [ ] **`[HTML]`** `grep -oE '<form[^>]*>'` on `/contact` prints a form
- [ ] **`[HTML]`** `grep -oE 'name="[^"]+"'` lists every field
- [ ] Manual pass with JavaScript disabled: form visible and legible
- [ ] **`[EXT]`** one real enquiry submitted end to end
- [ ] **`[EXT]`** both emails arrive (enquiry with `reply_to` set, plus autoresponder)
- [ ] **`[EXT]`** `marketing_form_submitted` appears in PostHog
- [ ] New guard: `/contact` built HTML contains `<form>` and zero bailout markers
- [ ] Drift row **D40** closed

---

## 7. Step 6 — `/pricing`, `/merchants/join`, `/feed`

### 7a — `/pricing`

- [ ] Authored `title` + `description` via the Step 4 helper
- [ ] `pricing/opengraph-image.tsx` added on the existing `ogImage()` pattern
- [ ] Page expanded reusing `/merchants` copy — no new commercial claims
- [ ] Every number read from `facts.ts` / `SUCCESS_FEE_KES`; none retyped
- [ ] CTA to `/merchants/join` added
- [ ] `pricing-copy.test.ts` still green after the expansion

### 7b — `/merchants/join`

- [ ] Form extracted to a client child; `page.tsx` is a server component
- [ ] Split mirrors `waitlist/page.tsx` + `waitlist/waitlist-form.tsx`
- [ ] Authored metadata exported
- [ ] OG image resolved: own `opengraph-image.tsx`, or title authored to match the inherited `/merchants` card
- [ ] `trackMarketing(MARKETING_EVENTS.formSubmit, { form: "merchant-join" })` still fires after the split

### 7c — `/feed`

- [ ] `(shopper)/feed/loading.tsx:6` `<main>` changed to `<div>`
- [ ] Authored `title` + `description`
- [ ] `og:image` added
- [ ] `<h1>` added
- [ ] `/feed` **not** moved into the `(marketing)` layout
- [ ] `<DemoModeBanner />` still mounted at `(shopper)/layout.tsx:10`

### 7d — guard

- [ ] `marketing-a11y.test.ts` `TOP_LEVEL` array extended to include `pricing` and `merchants/join`
- [ ] **`[HTML]`** no route in `/sitemap.xml` returns the root-default title (`Maanta — The mall, made live.`)

---

## 8. Step 7 — legal fact-fill and robots

### 8a — fact-fill

- [ ] **`[EXT]`** Clerk processing region read from the Clerk dashboard: ____________
- [ ] **`[EXT]`** Sentry processing region read from the Sentry project settings: ____________
- [ ] **`[EXT]`** Clerk session-cookie lifetime read from the session configuration: ____________
- [ ] `CLERK_REGION`, `SENTRY_REGION`, `AUTH_COOKIE_LIFETIME` moved from `TOKEN_OWNERS` into `RESOLVED_TOKENS` in `src/lib/marketing/legal-docs.ts`
- [ ] **Zero files under `src/content/legal/` modified**
- [ ] `PLACEHOLDER_IDS.odpc` unchanged
- [ ] **`[HTML]`** zero occurrences of `to be confirmed` in any route's built HTML

### 8b — robots ruling — **DONE 2026-08-01**

- [x] §1 `noindex` check completed first
- [x] Founder ruling recorded in `docs/maanta-decisions-log.md`: **B** — remove the
      `Disallow` lines, keep `noindex`
- [x] `src/app/robots.ts` matches the ruling (spread + two orphaned imports removed)
- [x] `DEMO_MODE` **not** flipped as a side effect — still `true`
- [x] **`[HTML]`** built `robots.txt` carries no legal `Disallow`; all four pages
      still emit `noindex, nofollow`; `sitemap.xml` still excludes them
- [x] Suite still 481/481 after the change

---

## 9. Final acceptance

Run the full block from `docs/ops/marketing-site-finish-plan.md` §5. A clean run
prints every sitemap URL with nothing after it.

- [ ] **`[HTML]`** every sitemap route: canonical present
- [ ] **`[HTML]`** every sitemap route: `og:url` equals its own URL
- [ ] **`[HTML]`** every sitemap route: no root-default title
- [ ] **`[HTML]`** every sitemap route: no `BAILOUT_TO_CLIENT_SIDE_RENDERING`
- [ ] **`[HTML]`** every sitemap route: no `to be confirmed`
- [ ] **`[HTML]`** every sitemap route: exactly one `<main>`
- [ ] **`[HTML]`** `/how-it-works` returns 308
- [ ] **`[HTML]`** `/contact` reports at least one `<form>`
- [ ] `/contact` usable with JavaScript disabled
- [ ] **`[EXT]`** one enquiry produces both emails and a PostHog submit event
- [ ] **`[EXT]`** production Vercel deployment reports `githubCommitRef: main`
- [ ] Ten-row guard mutation table committed, `FAIL` observed on every row
- [ ] `npm test` green
- [ ] `npm run build` green (token gate included)
- [ ] Drift register swept: every open row reconciled, `Last updated` bumped

---

## 10. Explicitly out of scope — do not do these

- [ ] ~~Restructure the IA~~
- [ ] ~~Redesign the footer~~
- [ ] ~~Rewrite any legal document~~
- [ ] ~~Remove the pre-launch notice or DRAFT banners~~
- [ ] ~~Invent a registration, licence or ODPC number~~
- [ ] ~~Move `/feed` into the marketing layout~~
- [ ] ~~Delete `/how-it-works`~~ (redirect it)
- [ ] ~~Re-hunt the WhatsApp placeholder~~ (D36 closed and held)
- [ ] ~~Chase `{{TOKEN}}` placeholders in rendered output~~ (none survive)
- [ ] ~~Re-add `metadataBase`~~ (already set)

---

## 11. Polish backlog — not required for done

Tracked so it is not lost. See finish plan §3 for the full argument.

- [ ] GAP-11 — mobile nav without JS (`SiteHeader.tsx:94` `aria-controls` points at
      `id="marketing-mobile-nav"`, rendered at line 112 only when open)
- [ ] GAP-10 — `/help` has no `<h1>`
- [ ] FOOT-01 — footer column headings are outline `<h2>`s (`SiteFooter.tsx:64,84`)
- [ ] GAP-08 — `/contact` absent from `HEADER_LINKS` in `src/lib/marketing/nav.ts`
- [ ] GAP-09 — `/malls/bbs-mall` is ~75 words
- [ ] GAP-13 — no JSON-LD anywhere
- [ ] GAP-12 — `src/app/not-found.tsx` inherits root metadata and drops all chrome
- [ ] GAP-14 — `/login` has no `<a>` in the body
- [ ] RISK-04 — **`[EXT]`** re-measure Lighthouse under the *clerk* auth strategy
- [ ] RISK-06 — `/waitlist` is dynamically rendered; find what opts it out
- [ ] RISK-07 / D14 — **`[EXT]`** `app_config.demo_mode_enabled` is `true` on production
