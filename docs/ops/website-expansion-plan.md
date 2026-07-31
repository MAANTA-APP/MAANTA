# MAANTA — Website Expansion Implementation Plan

**Status:** Ready for implementation
**Date:** 2026-07-31
**Audience:** Claude Code / Cursor working in `MAANTA-APP/MAANTA`
**Companion docs:** `website-ia.md` (sitemap, page IA, copy facts), `website-footer-legal-docs-plan.md` (footer + legal)

---

## 0. Read this first

This plan was written from **verified production truth** — the Vercel build manifest for commit `c8d3e35` and the rendered live site at `www.maanta.app` — not from source. Source-level details (component names, route groups, Tailwind tokens) were not readable and are marked **VERIFY**. Phase 0 exists to close those gaps before any code is written.

**Do not invent structure that already exists.** If the repo already has a marketing route group, a `SiteFooter`, or a nav constants module, extend it rather than creating a parallel one.

### Established facts

- Next.js **14.2.35**, App Router, Node 24, `instrumentationHook` enabled.
- ~125 routes, 94 static pages. Middleware present at 205 kB (Clerk).
- Clerk auth, Supabase, Sentry, PostHog, Stripe + IntaSend.
- Canonical host `www.maanta.app`; apex 308-redirects.
- **No `sitemap.xml`, no `robots.txt`.**
- Marketing header today: logo · How it works · Pricing · FAQ.
- Marketing footer today: `© Maanta` · Privacy · Terms · Contact.
- `/privacy` and `/terms` are live placeholders.
- A site-wide banner reads: *"Demo mode — sample data for rehearsal. These shops, deals and codes are not real."*
- Two shells coexist: marketing chrome, and an app tab bar (Feed/Browse/Map/Deals/You). `/help` uses the app shell.

---

## 1. Phase 0 — Verify in repo (no code)

Answer these and record the answers at the top of the implementation PR description.

| # | Question | Why it matters |
|---|---|---|
| 1 | Is there an `app/(marketing)/` route group, or are marketing pages flat under `app/`? | Determines whether Phase 1 creates or extends a layout. |
| 2 | Where are the header and footer components? Are they shared with the app shell? | A shared footer means changes leak into `/feed`, `/you`, etc. |
| 3 | What is the Clerk middleware `matcher`? Do public marketing routes pass through untouched? | New routes must not land behind auth. |
| 4 | Are `#FDBF2D`, the type scale and spacing expressed as Tailwind tokens, or hard-coded? | Decides whether Phase 1 adds tokens or consumes them. |
| 5 | Where is the demo banner mounted, and what flag controls it? | Highest-priority fix. See risk R1. |
| 6 | Do `/pricing`, `/for-merchants` and `/faq` read plan values from a shared constant, or repeat them? | Decides whether `lib/marketing/facts.ts` is new or a refactor. |
| 7 | Is there an existing `lib/` nav or site-config module? | Avoid a second source of truth. |
| 8 | Is `next.config.js` already carrying redirects? | Merge, do not overwrite. |
| 9 | Does `/merchants` share components with `/merchant/onboard`? | Affects the `/merchants/join` relocation. |
| 10 | Are there existing marketing tests or visual snapshots? | Determines regression safety net. |

---

## 2. Proposed routes

### New

| Route | Type | Notes |
|---|---|---|
| `/shoppers` | page | Replaces `/for-shoppers` and `/how-it-works` |
| `/merchants` | page | Expanded from the current short marketing block + form into the full marketing page; the form moves out |
| `/merchants/join` | page | Receives the relocated lead-capture form |
| `/mall-operators` | page | No current equivalent |
| `/merchant-terms` | legal | |
| `/cookies` | legal | |
| `app/sitemap.ts` | route handler | Missing today |
| `app/robots.ts` | route handler | Missing today |

### Rewritten

`/` · `/about` · `/contact` · `/privacy` · `/terms`

### Retained, demoted to footer / in-page links

`/pricing` · `/faq` · `/malls/bbs-mall` · `/download` · `/waitlist` · `/demo`

### Redirects — `next.config.js`, `permanent: true`

| From | To |
|---|---|
| `/for-shoppers` | `/shoppers` |
| `/for-merchants` | `/merchants` |
| `/how-it-works` | `/shoppers` |
| old `/merchants` form | `/merchants/join` |

**Sequencing hazard:** relocate the lead-form component to `/merchants/join` and confirm it works *before* repointing `/merchants`. Otherwise the merchant acquisition path is dark between commits.

---

## 3. Shared components

### Create

| Path | Purpose |
|---|---|
| `app/(marketing)/layout.tsx` | Marketing shell. **Must not** mount the demo banner. |
| `components/marketing/SiteHeader.tsx` | Nav exposing all three audiences + Browse deals button; mobile sheet. |
| `components/marketing/SiteFooter.tsx` | Five columns + legal base bar (see footer plan). |
| `lib/marketing/nav.ts` | **Single source of truth** for header links, footer columns, legal links. Consumed by header, footer and `sitemap.ts`. |
| `lib/marketing/facts.ts` | Fee, grace period, plan prices, mall name, trial terms — with expiry dates on time-bound offers. |
| `components/marketing/AudienceDoors.tsx` | The three-door router on Home. Load-bearing. |
| `components/marketing/StepRail.tsx` | 3–4 step process, reused on Home / Shoppers / Merchants. |
| `components/marketing/ProofStrip.tsx` | Mall name, counts, live status dot. |
| `components/marketing/CtaBand.tsx` | Full-width closing CTA, audience-parameterised. |
| `components/marketing/FaqAccordion.tsx` | Audience-filterable; sources shared answers. |
| `components/marketing/LegalDoc.tsx` | Prose layout, generated ToC, `Last updated`, contact block. |
| `components/marketing/EnquiryRouter.tsx` | `/contact` topic selector reading `?topic=`. |

### Update

| Path | Change |
|---|---|
| existing header | Replace How it works / Pricing / FAQ with the audience nav. |
| existing footer | Replace with `SiteFooter`. **VERIFY** it is not shared with the app shell. |
| `next.config.js` | Merge the redirect map. |
| demo-banner mount | Scope to app routes only. |
| `/pricing`, `/faq` | Read from `lib/marketing/facts.ts`. |

---

## 4. Dependencies

### Copy / content

- Long-form copy for six pages. Every claim must trace to the verified fact list in `website-ia.md` §2.
- **Mall Operators is the only page with no existing copy to build on.** It needs original positioning: what a node is, what the mall gets, deployment model, data governance. This is the critical path for content.
- About needs: founder name and bio, a plain statement of the business model, a dated "where we are today".
- Contact needs: monitored support email, WhatsApp number, response-time commitment, desk hours.

### Design

- Confirm or establish design tokens: `#FDBF2D` accent, neutral palette, type scale, spacing rhythm, radii, elevation.
- Accent discipline: `#FDBF2D` for CTAs and live-state only. Broad yellow reads flashy, not premium.
- Section rhythm and container widths for the marketing shell (distinct from the app shell).
- Imagery: product surfaces and the mall itself. **No stock photography.**
- Motion: entrance fades and reveals only. No parallax, no autoplay video.
- OG image template — per-page, generated.

### Legal / docs

Four launch-blocking documents (Privacy, Terms, Merchant Terms, Cookies) and six external dependencies including the registered entity name. See `website-footer-legal-docs-plan.md` §3 and §5. **These are MAANTA's to supply, not the implementing agent's to draft unreviewed.**

### Analytics

- Add PostHog events on the three audience doors, each primary CTA and each form submit, so page performance is measurable per audience from day one.
- Resolve the cookie-consent question before adding tracking to new pages.

---

## 5. Risks and unknowns

| ID | Risk | Impact | Mitigation |
|---|---|---|---|
| **R1** | Site-wide demo banner: *"These shops, deals and codes are not real."* | **Severe.** Directly contradicts premium / trustworthy / operationally serious positioning. A merchant or mall operator reading it will not convert. | Scope the banner to app routes only in Phase 1. Highest-leverage single change in this plan. |
| R2 | `/merchants` collision — repointing it dark-routes merchant acquisition. | High | Relocate and verify `/merchants/join` first, redirect second. |
| R3 | Clerk middleware may gate or rewrite new marketing routes. | High | Phase 0 item 3. Add explicit public matchers, test unauthenticated. |
| R4 | Footer may be shared with the app shell — changes leak into `/feed`, `/you`. | Medium | Phase 0 item 2. Split into `MarketingFooter` / `AppFooter` if shared. |
| R5 | No sitemap or robots — new pages go undiscovered. | Medium | `app/sitemap.ts` + `app/robots.ts` in Phase 2, generated from `lib/marketing/nav.ts`. |
| R6 | Inbound links to `/for-merchants` and `/for-shoppers` from WhatsApp, flyers and in-mall signage. | Medium | 301s are mandatory and permanent. Do not delete old routes. |
| R7 | Time-bound claims (KES 300 credit, 30-day Elite trial, "first 100 shops") go stale silently. | Medium | Constants with expiry dates in `lib/marketing/facts.ts`; render conditionally. |
| R7b | **Pricing already disagrees across pages.** The KES 500 / 24h boost price appears on `/merchants` but on neither `/pricing` nor `/for-merchants`. | Medium | Audit every price on the live site during Phase 0; collapse into `lib/marketing/facts.ts` before Phase 3. |
| R8 | Placeholder legal behind a premium footer is worse than the current thin footer. | Medium | Phase 4 ships real content, or those links carry a visible dated "in review" state. |
| R9 | `/help` lives in the app shell; a marketing footer link causes chrome whiplash. | Low | Give `/help` a marketing variant, or point the footer at `/faq` until rehomed. |
| R10 | Mall-operator positioning is unvalidated — no prior surface, only a waitlist radio. | Medium | Ship the page with a pilot-conversation CTA and instrument it. Treat the copy as v1 to be revised after the first real operator conversation. |
| R11 | Demo/sample data on `/malls/bbs-mall` ("121 shops · 190 live deals"). | Medium | Do not quote these numbers as proof on marketing pages until they are real. Use qualitative proof until then. |

### Open unknowns

- Registered legal entity name and address.
- Whether PostHog captures before consent.
- Which social accounts exist and are maintained.
- Whether `admin@maanta.app` is the intended public support address.

---

## 6. Implementation sequence

Each phase is independently shippable and independently revertible. Do not begin a phase until the previous one is merged and deployed.

### Phase 0 — Verify (no code)

Answer the ten Phase 0 questions. Record in the PR description. **Blocks everything.**

### Phase 1 — Shared layout, nav, footer

1. Create or adopt `app/(marketing)/layout.tsx`.
2. Build `lib/marketing/nav.ts` and `lib/marketing/facts.ts`.
3. Build `SiteHeader` with the audience nav + mobile sheet.
4. Build `SiteFooter` with five columns and the legal base bar. Every link resolves to real content or does not appear.
5. **Scope the demo banner to app routes only.**
6. Establish or confirm design tokens.

*Ships:* existing pages, new chrome. No new routes. Visually verifiable in isolation.

### Phase 2 — Route scaffolding, redirects, discoverability

1. Create `/shoppers`, `/mall-operators`, `/merchants/join` rendering real shells with hero + CTA (thin, not empty).
2. Relocate the lead form to `/merchants/join`; verify submissions land.
3. Convert `/merchants` to the marketing page shell. Note this is a **merge, not a from-scratch build** — `/merchants` already carries a short marketing block (fee line, boost price) alongside the form. Preserve the copy, move the form.
4. Add the 301 map to `next.config.js`.
5. Add `app/sitemap.ts` and `app/robots.ts`, generated from `lib/marketing/nav.ts`.
6. Add per-page metadata and OG images.

*Ships:* full navigable IA. Every header and footer link resolves.

### Phase 3 — Page-by-page build

In this order, one PR each:

1. **Home** — audience doors are the priority; they unblock measurement for everything downstream.
2. **Merchants** — nearest-term revenue.
3. **Shoppers** — largest volume.
4. **Mall Operators** — highest content risk, most original copy.
5. **About**.
6. **Contact** — enquiry router, `?topic=` handling, response times.

### Phase 4 — Legal and docs wiring

1. Rewrite `/privacy` and `/terms` on the `LegalDoc` component.
2. Add `/merchant-terms` and `/cookies`.
3. Resolve cookie consent — banner gating PostHog, or cookieless mode.
4. Restructure `/faq` by audience.
5. Resolve the `/help` shell question.
6. Reference Merchant Terms from `/merchants/join` and wallet top-up.

### Phase 5 — Responsive and polish

1. Breakpoint pass, mobile-first — the shopper audience is overwhelmingly mobile.
2. Accessibility: contrast against `#FDBF2D`, focus states, landmarks, keyboard nav on the mobile sheet and FAQ accordion.
3. Motion polish; `prefers-reduced-motion` respected.
4. Lighthouse and Core Web Vitals; image optimisation.
5. Cross-page copy consistency check against `lib/marketing/facts.ts` — one number, one source.
6. Verify all 301s, sitemap output and OG rendering in production.

---

## 7. Definition of done

- All six top-level pages live, each with a distinct primary CTA and real proof elements.
- Header exposes all three audiences; footer renders five columns on every marketing page.
- Every footer link resolves to real content. No `#`, no "coming soon".
- Four legal documents live with real, dated content and a named entity.
- All four 301s verified in production; no inbound path 404s.
- `sitemap.xml` and `robots.txt` served and correct.
- Demo banner appears on app routes only, never on marketing.
- Every fee, price and time-bound claim renders from `lib/marketing/facts.ts`.
- PostHog events on audience doors, primary CTAs and form submits.
- Lighthouse ≥ 90 on performance and accessibility for all six pages, mobile.
