# MAANTA — Website Information Architecture

**Status:** Proposed — *(at time of writing; built and shipped, see the note below)*
**Date:** 2026-07-31
**Repo:** `MAANTA-APP/MAANTA` (private) — Next.js 14.2.35 App Router
**Canonical host:** `https://www.maanta.app` (apex `maanta.app` 308-redirects to `www`)
**Scope:** Public marketing surface only. Does not cover `/app`-shell, `/merchant/*`, `/admin/*`, `/agent/*`.

> **Implemented as of PR #153 (2026-08-01).** This deck is the input that was
> written before the build, kept unedited as the record of what was asked for.
> It is **not** the description of what shipped, and several passages were
> deliberately departed from — see the 17 recorded deviations in
> `docs/ops/IMPLEMENTATION-REPORT.md` §5, and the founder rulings in §14.
>
> **Where this deck and the code disagree, the code and the implementation
> report win.** Do not copy a line out of here into a page without checking it
> against `docs/ops/website-handoff.md` §9 (held claims) and
> `maanta-app/src/lib/marketing/facts.ts` (every rendered number) first.


---

## 1. Audit — what exists today

Established from the production build manifest (deployment `dpl_6ehhPw9d6cHNNgprpMxDpnSJ4FNN`, commit `c8d3e35`) and the rendered live site. Anything below marked **VERIFY** was not readable from source and must be confirmed in-repo before Phase 1.

### Confirmed

| Item | Truth |
|---|---|
| Framework | Next.js 14.2.35, App Router, `instrumentationHook` experiment enabled |
| Route count | ~125 routes, 94 statically generated |
| Auth | Clerk — `/login/[[...sign-in]]`, `/sign-up/[[...sign-up]]` |
| Observability | Sentry (`/sentry-example-page`, `/api/sentry-example-api`), PostHog project "MAANTA" |
| Payments | Stripe + IntaSend (`/api/webhooks/stripe`, `/api/webhooks/intasend`) |
| Middleware | present, 205 kB (Clerk) |
| Brand token | theme-color `#FDBF2D` |
| `sitemap.xml` | **404 — does not exist** |
| `robots.txt` | not present |

### Two shells already exist

- **Marketing shell** — header: logo · How it works · Pricing · FAQ. Footer: `© Maanta` · Privacy · Terms · Contact.
- **App shell** — bottom tab bar: Feed · Browse · Map · Deals · You.

`/help` renders inside the **app** shell. Linking to it from the marketing footer causes shell whiplash — see the footer plan.

### Existing public marketing routes

| Route | State |
|---|---|
| `/` | Real landing page. Hero, 3-step loop, deal types, merchant CTA, waitlist. |
| `/for-merchants` | Substantive merchant marketing page. |
| `/merchants` | Short marketing block **plus** a lead-capture form (Shop name, Phone `+254`). Carries a boost price — **KES 500 per 24 hours** — not stated on `/pricing` or `/for-merchants`. Collides with `/for-merchants`. |
| `/for-shoppers` | Thin. Reuses homepage hero copy. |
| `/how-it-works` | Thin hub. Duplicates `/for-shoppers` + `/for-merchants`. |
| `/pricing` | Real: Standard vs Elite, trial mechanics. |
| `/faq` | Real, 4 Q&As, not audience-grouped. |
| `/about` | **Thin.** Homepage hero copy with a short paragraph. |
| `/contact` | Bare form: email/phone + message. No address, entity, hours or response time. |
| `/malls/bbs-mall` | Substantive. "Nairobi's launch node", shops/deals counts by floor. |
| `/privacy` | **Placeholder** — "Our full privacy policy is being finalised ahead of launch." |
| `/terms` | **Placeholder** — "Our full terms of service are being finalised ahead of launch." |
| `/help` | Thin (2 Q&As) + WhatsApp link. App shell. |
| `/waitlist` | Real. Role-segments shopper / merchant / **mall operator**. |
| `/download`, `/demo`, `/founder`, `/founder/reports` | Present, out of scope for this IA. |

### Gaps

1. **No mall-operator surface anywhere.** `/waitlist` offers the role but has nowhere to send them.
2. **No sitemap or robots** — new pages will not be discovered.
3. **`/merchants` vs `/for-merchants` collision.**
4. **Legal is placeholder text on a live production domain.**
5. **Site-wide demo banner:** "Demo mode — sample data for rehearsal. These shops, deals and codes are not real." This renders on marketing pages and is incompatible with the intended positioning.

### VERIFY in repo before Phase 1

- Does a route group (`app/(marketing)/`) already exist, or are marketing pages flat under `app/`?
- Where are the header and footer components defined, and are they shared with the app shell?
- Clerk middleware `matcher` — does it already exclude public marketing routes?
- Tailwind config: are `#FDBF2D` and the type scale expressed as design tokens or hard-coded?
- Where is the demo banner mounted (root layout vs a provider), and what flag controls it?
- Is `/pricing` sourcing plan values from a shared constant or hard-coded per page?

---

## 2. Product facts available as copy (verified from the live site)

Use these. Do not invent new claims.

- Shopper loop: **Discover → Claim → Redeem.** Tap a deal, get a **6-digit code**, show it at the counter, pay the deal price in person.
- **15-minute grace period** after a deal expires.
- Merchant fee: **KES 30 per verified redemption.** No listing fee, no percentage cut, no monthly minimum.
- **Expired or rejected codes cost the merchant nothing.**
- Plans: **Standard** (free, 1 active deal) · **Elite** (KES 3,500/mo, 2 active deals, flash deals, boosts). First 100 BBS Mall merchants: **30-day Elite trial + KES 300 opening credit**, then a 7-day grace before reverting to Standard.
- Deal types: **Flash** (short-window top picks), **Boosted** (neighbourhood favourites pushed to the top), **Map** ("pins with precise pickup spots" — use this wording, it is the live copy).
- Boost price: **KES 500 per 24 hours** (currently stated only on `/merchants`). **Reconcile** — this belongs on `/pricing` and the Merchants page, from a single constant.
- **what3words** is a real merchant-side feature — `/how-it-works` says merchants "list shops with what3words locations", and the build manifest contains `/api/w3w/validate`. It is *merchant address precision*, **not** the shopper-facing Map label. Do not put "what3words" in shopper copy without confirming the shopper-visible behaviour in repo.
- Ranking is by **verified redemptions, never stars/reviews**.
- **No download required** — runs in the browser as a PWA.
- **No online checkout.** Payment happens in person at the till.
- Launch node: **BBS Mall, Eastleigh, Nairobi — "Node 0".**

---

## 3. Proposed sitemap

```
/                          Home
/shoppers                  ← 301 from /for-shoppers and /how-it-works
/merchants                 ← 301 from /for-merchants  (marketing page)
  /merchants/join          ← current /merchants lead form relocates here
/mall-operators            NEW
/about
/contact

Supporting (retained, demoted to footer / in-page links)
/pricing        /faq        /malls/bbs-mall
/download       /waitlist   /demo

Legal
/privacy        rewrite
/terms          rewrite
/merchant-terms NEW
/cookies        NEW

Infrastructure (missing today)
app/sitemap.ts  app/robots.ts
```

### Redirect map (301, `next.config.js`, `permanent: true`)

| From | To | Note |
|---|---|---|
| `/for-shoppers` | `/shoppers` | |
| `/for-merchants` | `/merchants` | |
| `/how-it-works` | `/shoppers` | Shopper-first mechanics. Header nav label must change in the same commit. |
| `/merchants` (old form) | `/merchants/join` | **Order matters** — relocate the form component before repointing the route. |

`/merchant/onboard` (authenticated app onboarding) is unaffected and must not be confused with `/merchants/join`.

---

## 4. Page-by-page IA

### Home — `/`

- **Goal:** any of three audiences self-identifies and routes correctly within five seconds.
- **Primary audience:** mixed, shopper-weighted.
- **Core sections**
  1. Hero — "Claim in-mall deals before you pay."
  2. Live proof strip — mall name, shop count, deal count, verified-redemption framing.
  3. The loop — Discover / Claim / Redeem, three steps, no more.
  4. **Three audience doors** — Shoppers · Merchants · Mall operators. This is the load-bearing section; it must be above the fold on desktop.
  5. Why verified redemption beats reviews.
  6. Node 0 — why Nairobi malls first.
  7. Waitlist band (role-segmented).
- **Primary CTA:** Browse live deals → `/feed`
- **Supporting CTA:** List your shop → `/merchants` · For mall operators → `/mall-operators`
- **Proof / trust:** named live mall; flat KES 30 stated openly on the homepage; "no online checkout"; 15-minute grace period.

### Shoppers — `/shoppers`

- **Goal:** reach `/feed`, or install the PWA.
- **Primary audience:** mall shoppers in Nairobi.
- **Core sections**
  1. Hero — deals at the mall you are already going to.
  2. How claiming works — 6-digit code, +15 min grace, redeem at the counter.
  3. What's on the feed — Flash / Boosted / Map.
  4. No download needed — PWA install path.
  5. What it costs you — nothing; no card, no online payment.
  6. Where it works — mall coverage, link to `/malls/bbs-mall`.
  7. Shopper FAQ subset.
- **Primary CTA:** Browse live deals → `/feed`
- **Supporting CTA:** Install the app → `/download`
- **Proof / trust:** one-time code; no in-app payment; precise in-mall pickup spots on the map; explicit grace-period promise.

### Merchants — `/merchants`

- **Goal:** start onboarding.
- **Primary audience:** shop owners and managers inside partner malls.
- **Core sections**
  1. Hero — "You only pay when a customer walks in."
  2. The economics — KES 30 flat, no listing fee, no percentage, no minimum.
  3. Operating loop — post a deal (2 min) → shopper claims → verify the code → pay KES 30.
  4. Plans — Standard vs Elite; trial and KES 300 opening credit as a time-bound banner, not body copy.
  5. **What happens when a code fails** — expired or rejected costs nothing. This is the top objection; give it its own section.
  6. Day-to-day ops — staff accounts, wallet top-up, alerts.
  7. Objection FAQ.
  8. Activation support — we come to your shop at BBS.
- **Primary CTA:** List your shop → `/merchants/join`
- **Supporting CTA:** See pricing → `/pricing`
- **Proof / trust:** fee charged only on verified redemption; failed codes free; opening credit; in-person activation; transparent plan table.

### Mall Operators — `/mall-operators`

- **Goal:** book a pilot conversation. **Positioning: pilot partnership, not licensed software.**
- **Primary audience:** mall management, leasing and marketing leads.
- **Core sections**
  1. Hero — make your mall's deals visible, and measurable.
  2. The problem — offers live on chalkboards and WhatsApp groups; no footfall attribution.
  3. What a MAANTA node is — BBS Mall is Node 0.
  4. What the mall gets — verified redemption data, merchant activation, tenant engagement, **no POS integration required**.
  5. Deployment model — phases, timeline, what "live" means.
  6. What we need from the mall — introductions, comms access, a desk during activation.
  7. Data governance — what is collected, who owns it, how it is shared.
  8. Pilot CTA band.
- **Primary CTA:** Book a pilot conversation → `/contact?topic=mall-operator`
- **Supporting CTA:** Join as a mall operator → `/waitlist?role=mall-operator`
- **Proof / trust:** Node 0 already live; redemption-verified methodology; explicit zero-integration claim; named operations contact; data-handling section.

### About — `/about`

- **Goal:** prove the operator is serious, local and commercially honest.
- **Primary audience:** merchants and mall operators doing diligence; press; prospective hires.
- **Core sections**
  1. What MAANTA is — one paragraph, no vision language.
  2. Why Nairobi malls first.
  3. The principle — verified redemption over reviews.
  4. **How we make money** — stated plainly.
  5. Where we are today, and what is next.
  6. Founder and team.
  7. Contact band.
- **Primary CTA:** Contact us → `/contact`
- **Supporting CTA:** See how it works → `/shoppers`
- **Proof / trust:** named founder with a real email; physical location; explicit business model; dated "where we are today" statement.

### Contact — `/contact`

- **Goal:** route each enquiry type to the right channel, fast.
- **Primary audience:** all three, plus press and legal.
- **Core sections**
  1. Enquiry router — Shopper support · Merchant support · Mall operator · Press · Legal & privacy. Accepts a `?topic=` query param.
  2. Form, with the routed subject pre-filled.
  3. Direct channels — WhatsApp support, support email, in-mall desk.
  4. **Response times, stated.**
  5. Location and hours.
  6. Registered legal entity block.
- **Primary CTA:** Send message
- **Supporting CTA:** WhatsApp support
- **Proof / trust:** committed response window; a physical desk; a named entity.

---

## 5. Global navigation

**Header (desktop):** `Shoppers · Merchants · Mall operators · Pricing · About` + primary button **Browse deals**.
Mobile: same set in a sheet, with **Browse deals** pinned.

Rationale: the header must expose all three audiences. Today it exposes none — only How it works / Pricing / FAQ. `How it works` is folded into `/shoppers`; `FAQ` moves to the footer.

**Footer:** see `website-footer-legal-docs-plan.md`.

---

## 6. Content and design principles

- Every claim on the site must be traceable to a product fact in section 2. No invented metrics.
- Numbers appear once, from a shared constant (`lib/marketing/facts.ts`) — never re-typed per page.
- Time-bound offers (Elite trial, KES 300 credit, "first 100 shops") render from a dated constant with an expiry, so they cannot silently go stale.
- Calm over flashy: restrained motion, generous whitespace, one accent (`#FDBF2D`) used sparingly for CTAs and live-state indicators only.
- Trust markers are structural, not decorative: real names, real addresses, real response times, real fee numbers.
- No stock-photo hero. Use product surfaces and the mall itself.
