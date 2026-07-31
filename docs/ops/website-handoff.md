# MAANTA — Website Handoff Pack

**Status:** Ready for Claude Code / Cursor
**Date:** 2026-07-31
**Repo:** `MAANTA-APP/MAANTA` · Next.js 14.2.35 App Router · Vercel team `maanta` · `www.maanta.app`

**Start here.** This file is the index. Read it first, then the document for whatever you are building.

---

## 1. What exists

| File | What it is |
|---|---|
| `docs/ops/website-handoff.md` | **This file.** Index, Phase 0, blockers, tokens, constants. |
| `docs/ops/website-expansion-plan.md` | Routes, components, risks, 5-phase sequence, redirect map |
| `docs/ops/website-ia.md` | Repo audit, sitemap, page-by-page IA, verified product facts |
| `docs/ops/website-footer-legal-docs-plan.md` | Footer architecture, legal/docs link set with status |
| `docs/ops/copy/home.md` | `/` copy |
| `docs/ops/copy/shoppers.md` | `/shoppers` copy |
| `docs/ops/copy/merchants.md` | `/merchants` + `/merchants/join` copy |
| `docs/ops/copy/mall-operators.md` | `/mall-operators` copy + **scenario marker spec (§1a)** |
| `docs/ops/copy/about.md` | `/about` copy |
| `docs/ops/copy/contact.md` | `/contact` copy |
| `docs/legal/privacy-policy.md` | `/privacy` draft — **counsel review required** |
| `docs/legal/terms-of-service.md` | `/terms` draft — **counsel review required** |
| `docs/legal/merchant-terms.md` | `/merchant-terms` draft — **counsel review required** |
| `docs/legal/cookie-notice.md` | `/cookies` draft — **counsel review required** |

Every copy deck has the same shape: facts used → metadata → section-by-section copy → claims register → design/build notes. The **claims register** is the part not to skip; it lists what is not yet true.

---

## 2. Three bugs to fix now, independent of the rebuild

These are live defects found while auditing. None depends on any decision.

1. **`/api/contact` does not exist.** The production build has `/api/leads`, `/api/waitlist`, `/api/staff`, `/api/support` — but `/contact` renders a form with a Send button. Either it piggybacks another endpoint or **enquiries are being discarded.** Check first. Resend is already connected to the account and is the obvious fix: form → `/api/contact` → Resend → monitored inbox + autoresponder.
2. **Typo on the homepage.** *"**Merchant** write offers on chalkboards"* → *"Merchants"*.
3. **Pricing inconsistency (risk R7b).** The KES 500 / 24h boost price appears on `/merchants` but on neither `/pricing` nor `/for-merchants`, and the two pages disagree on whether boosts are Elite-only. Resolve, then source from `facts.ts` (§6).

---

## 3. Phase 0 — verify in repo, no code

Answer these and paste the answers into the first PR description. Everything else waits on them.

| # | Question | Consequence |
|---|---|---|
| 1 | Is there an `app/(marketing)/` route group, or are pages flat under `app/`? | Create vs extend a layout |
| 2 | Where are the header and footer components? Shared with the app shell? | A shared footer leaks changes into `/feed`, `/you` |
| 3 | Clerk middleware `matcher` — do public marketing routes pass through? | New routes must not land behind auth |
| 4 | Are `#FDBF2D`, type scale and spacing Tailwind tokens or hard-coded? | Add tokens vs consume them |
| 5 | **Where is the demo banner mounted, and what flag controls it?** | Risk R1 — the highest-leverage fix in the project |
| 6 | Do `/pricing`, `/for-merchants`, `/faq` read plan values from a constant? | `facts.ts` is new vs a refactor |
| 7 | Is there an existing `lib/` nav or site-config module? | Avoid a second source of truth |
| 8 | Does `next.config.js` already carry redirects? | Merge, do not overwrite |
| 9 | Does `/merchants` share components with `/merchant/onboard`? | Affects the `/merchants/join` move |
| 10 | Any existing marketing tests or visual snapshots? | Regression safety net |
| 11 | Where does the current `/contact` form POST to? | See §2.1 |
| 12 | Are staff accounts all-plans or Elite-only? Are boosts Standard-available? | Copy in `merchants.md` §3 and Merchant Terms 5.1, 9.3 |
| 13 | M-Pesa top-up flow — paybill or STK push? | Wallet microcopy in `merchants.md` `#wallet` |
| 14 | Processing regions for Supabase, Clerk, Sentry, Resend | Privacy Policy §6 and Cookie Notice §6 |

---

## 4. What Claude Code can start today

Nothing below is blocked by MAANTA, counsel, or any pending decision.

**Phase 1 — shared shell**
- `app/(marketing)/layout.tsx`
- `components/marketing/SiteHeader.tsx` — audience nav + mobile sheet
- `components/marketing/SiteFooter.tsx` — five columns + legal base bar
- `lib/marketing/nav.ts`, `lib/marketing/facts.ts`, `lib/marketing/scenario.ts` — **starter code in §6**
- **Scope the demo banner to app routes only** (risk R1)
- `ScenarioNotice` + `ScenarioStat` per `copy/mall-operators.md` §1a

**Phase 2 — scaffolding and discoverability**
- Create `/shoppers`, `/mall-operators`, `/merchants/join`
- Move the lead form to `/merchants/join`, **verify submissions land, then** repoint `/merchants`
- Redirect map in `next.config.js` (§5)
- `app/sitemap.ts` and `app/robots.ts` — neither exists today
- Per-page metadata and OG images

**Phase 3 — page builds**
Home → Merchants → Shoppers → Mall Operators → About → Contact.
Build with tokens rendering as visible placeholders in preview, and a build-time check that fails production if any `{{TOKEN}}` survives.

**`?topic=` routing on `/contact` must ship before `/mall-operators`** — that page's primary CTA points at `/contact?topic=mall-operator`.

---

## 5. Redirect map

`next.config.js`, `permanent: true`.

| From | To |
|---|---|
| `/for-shoppers` | `/shoppers` |
| `/for-merchants` | `/merchants` |
| `/how-it-works` | `/shoppers` |
| old `/merchants` form | `/merchants/join` |

Header nav label "How it works" must change in the same commit. `/merchant/onboard` is the authenticated app onboarding and is unaffected — do not confuse it with `/merchants/join`.

---

## 6. Constants — starter code

Three files, three purposes. **Do not inline any of these values into JSX.**

### `lib/marketing/facts.ts` — verified, safe to publish

```ts
// Verified against the live site 2026-07-31.
// Every number on the marketing site reads from here. One number, one source.
export const FACTS = {
  successFeeKes: 30,
  elitePerMonthKes: 3_500,
  boostPer24hKes: 500,
  boostHours: 24,
  codeLength: 6,
  graceMinutes: 15,
  standardActiveDeals: 1,
  eliteActiveDeals: 2,
  launchMall: 'BBS Mall, Eastleigh',
  city: 'Nairobi',
  nodeLabel: 'Node 0',
} as const

// Time-bound. Render conditionally — these must not go stale silently.
export const OFFERS = {
  openingCredit: {
    amountKes: 300,
    cohortShops: 100,
    expiresOn: '{{SET_A_DATE}}',
  },
  eliteTrial: {
    days: 30,
    postTrialGraceDays: 7,
    cohortShops: 100,
    expiresOn: '{{SET_A_DATE}}',
  },
} as const

export const isOfferLive = (o: { expiresOn: string }) =>
  !o.expiresOn.startsWith('{{') && new Date(o.expiresOn) > new Date()
```

### `lib/marketing/scenario.ts` — modelled, never production

```ts
// SCENARIO DATA — MODELLED, NOT MEASURED.
// Renders only via <ScenarioStat>, and only while <ScenarioNotice> is mounted.
// Flip isScenario to false to ship: marker disappears, every stat falls back.
export const SCENARIO = {
  isScenario: true,
  nodeLiveSince: 'May 2026',
  monthsLive: 3,
  activeShops: 121,
  liveDeals: 190,
  verifiedRedemptions: 6_400,
  merchantParticipation: '78%',
  repeatShopperRate: '41%',
  activationWeeks: 3,
} as const
```

> `ScenarioStat` must throw in development if it mounts without `ScenarioNotice` in the tree. That turns unlabelled projections into a build error rather than a live page. Spec: `copy/mall-operators.md` §1a.
>
> **Shopper-facing deal counts never come from here.** Pull live from `/api/deals` or omit the number.

### `lib/marketing/nav.ts` — single source for header, footer and sitemap

```ts
export const HEADER_LINKS = [
  { label: 'Shoppers', href: '/shoppers' },
  { label: 'Merchants', href: '/merchants' },
  { label: 'Mall operators', href: '/mall-operators' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
] as const

export const HEADER_CTA = { label: 'Browse deals', href: '/feed' } as const

export const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Shoppers', href: '/shoppers' },
      { label: 'Merchants', href: '/merchants' },
      { label: 'Mall operators', href: '/mall-operators' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Browse deals', href: '/feed' },
      { label: 'Install the app', href: '/download' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Join the waitlist', href: '/waitlist' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help centre', href: '/help' },
      { label: 'FAQ', href: '/faq' },
      { label: 'BBS Mall (Node 0)', href: '/malls/bbs-mall' },
    ],
  },
] as const

export const LEGAL_LINKS = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Merchant Terms', href: '/merchant-terms' },
  { label: 'Cookies', href: '/cookies' },
] as const

// Careers, Press kit, Merchant guide, Security, Status: deferred.
// Do not add a link until the page has real content — no "#", no "coming soon".
```

`app/sitemap.ts` should generate from these arrays, so adding a route updates header, footer and sitemap in one edit.

> **`/help` shell caveat:** it currently renders inside the app shell (Feed/Browse/Map/Deals/You). Linking to it from the marketing footer drops visitors into different chrome. Either give it a marketing variant or point Resources at `/faq` until it is rehomed.

---

## 7. Blocked — and who unblocks it

### MAANTA (Mohamed)

| # | Item | Blocks |
|---|---|---|
| 1 | **Registered entity name + address** | 12 references across About, footer, and all 4 legal docs. **The single biggest unlock.** |
| 2 | Monitored inboxes: support, privacy, a named operator address | Contact, About, footer, all legal docs |
| 3 | WhatsApp number + hours; BBS desk location + hours | Contact `#channels` |
| 4 | Response-time commitments | Contact `#response` |
| 5 | Founder bio, 2–4 sentences | About `#team` — guidance is in that file |
| 6 | Which social accounts exist and are maintained | Footer — ship none rather than dead icons |
| 7 | Real go-live date, shop count, redemption count | Flips `isScenario` to false everywhere |
| 8 | Whether the BBS desk is actually staffed | Contact, Merchants `#start`, Mall Operators |

### Counsel

| # | Item | Blocks |
|---|---|---|
| 9 | **CBK: does the prepaid wallet need PSP/e-money authorisation?** | Merchant Terms 7.5–7.7, and the merchants copy line *"anything left in your balance stays yours"*. **Highest consequence item in the project.** |
| 10 | ODPC registration status | Privacy §1 |
| 11 | Cross-border transfer basis. **Corrected 2026-07-31:** production Postgres is **Supabase `eu-west-1` (Ireland)**, not US — verified against the live project. PostHog is EU. The actual cross-border exposure is **Resend (US)** and probably Clerk, whose region is not determinable from the repo | Privacy §12 |
| 12 | Liability caps | Merchant Terms 13.3, ToS 11.3 |
| 13 | Consumer Protection Act 2012 duties on MAANTA as intermediary | Merchant Terms 1.2, ToS 2.1 |
| 14 | Retention periods, VAT treatment, prohibited categories | Privacy §8, Merchant Terms 7.9, 4.4 |

### Product decisions

| # | Decision | Blocks |
|---|---|---|
| 15 | Analytics consent architecture — consent banner, cookieless, or split at sign-in | Cookie Notice, and Phase 4 build |
| 16 | Enforcement process when a shop refuses a valid code | ToS 6.3, and the shoppers FAQ claim |
| 17 | Wallet refundability and credit expiry | Follows from #9 |
| 18 | Loss allocation on disputed redemptions | Merchant Terms 8.4 |
| 19 | Elite auto-renewal behaviour | Merchant Terms 9.5 |

---

## 8. Token register

**57 distinct tokens across 10 documents.** Filling the first four rows resolves roughly half of all occurrences.

| Token | Uses | Owner |
|---|---|---|
| `MAANTA APP` | 12 | MAANTA |
| `admin@maanta.app` | 9 | MAANTA |
| `BBS Mall, Eastleigh` | 8 | MAANTA |
| `admin@maanta.app` | 8 | MAANTA |
| `31 July 2026 (DRAFT)` / `{{lastUpdated}}` | 6 | Build — generate, never type |
| `{{FOUNDER_BIO}}`, `admin@maanta.app` | 5 | MAANTA |
| `+44 7746 170752`, `{{WHATSAPP_HOURS}}`, `{{WHATSAPP_RESPONSE}}` | 5 | MAANTA |
| `{{DESK_LOCATION}}`, `{{DESK_HOURS}}` | 4 | MAANTA |
| `admin@maanta.app`, `{{OPERATOR_CONTACT_*}}`, `{{OPERATOR_RESPONSE}}` | 5 | MAANTA |
| `admin@maanta.app`, `{{EMAIL_RESPONSE}}`, `{{PRIVACY_ACK}}` | 4 | MAANTA |
| `{{REFUND_POLICY}}`, `{{CREDIT_EXPIRY}}` | 4 | Counsel — gated on CBK |
| `{{LIABILITY_CAP}}` | 2 | Counsel |
| `{{ENFORCEMENT_COMMITMENT}}` | 2 | Product + counsel |
| `{{*_REGION}}` — Supabase, Clerk, Sentry, Resend | 4 | Engineering (Phase 0 #14) |
| `{{ANALYTICS_*}}`, `{{COOKIE_CONSENT_STATEMENT}}`, `{{SENTRY_BASIS_STATEMENT}}` | 6 | Product + counsel |
| `{{*_RETENTION}}` — shopper, redemption, analytics, contact | 4 | Counsel |
| `{{STAFF_PLAN_AVAILABILITY}}`, `{{BOOST_PLAN_AVAILABILITY}}` | 2 | Product (Phase 0 #12) |
| Remaining Merchant Terms / ToS tokens | ~12 | Counsel |
| Scenario tokens — `activeShops`, `monthsLive`, etc. | 17 | Resolve by flipping `isScenario` |

**Build rule:** render tokens as visibly styled placeholders in preview, and fail the production build if any `{{` survives in rendered output. That way an unfilled token cannot reach `www.maanta.app`.

---

## 9. Copy claims that must not ship yet

Marketing that currently outruns what is true or agreed. Each is in the relevant claims register.

| Claim | Where | Why held |
|---|---|---|
| "Anything left in your balance stays yours" | `copy/merchants.md` `#faq` | Depends on the CBK question. **Remove until resolved.** |
| "A shop that does not honour its own deals does not stay on MAANTA" | `copy/shoppers.md` `#faq` | Needs ToS 6.3 to exist |
| "We do not sell shopper data" | `copy/about.md`, `copy/mall-operators.md` | Must match the rewritten Privacy Policy word for word |
| Monthly operating report | `copy/mall-operators.md` `#report` | Confirm someone owns producing it |
| BBS Mall as a signed partner, 3 months live | `copy/mall-operators.md` throughout | Scenario. Marker required; prose claims need editing out for public use |
| "121 shops · 190 live deals" | Any page | These are the demo figures already on `/malls/bbs-mall` |
| Every stated response time | `copy/contact.md` | Publish only what can be met |

---

## 10. Definition of done

- Six top-level pages live, each with a distinct primary CTA and real proof
- Header exposes all three audiences; five-column footer on every marketing page
- Every footer link resolves to real content — no `#`, no "coming soon"
- Four legal documents live, dated, counsel-reviewed, with a named entity
- All four 301s verified in production; no inbound path 404s
- `sitemap.xml` and `robots.txt` served and correct
- **Demo banner on app routes only, never on marketing**
- Every fee, price and time-bound claim renders from `facts.ts`
- No `{{TOKEN}}` in production output
- `/contact` delivers to a monitored inbox and sends an autoresponder
- PostHog events on audience doors, primary CTAs, form submits
- Lighthouse ≥ 90 performance and accessibility, mobile, all six pages
