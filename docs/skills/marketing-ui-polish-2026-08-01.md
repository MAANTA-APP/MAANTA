# Skills: marketing + app-chrome UI polish pass

Last updated: 2026-08-01 · Status: **shipped to the repo, not yet deployed.**

A visual-polish pass over the marketing shell and the two app top bars. No copy
claims, no numbers, no schema and no business rules changed. Everything here is
elevation, spacing, motion and one new presentational component.

## Why this is written down

The pass was first done in a local Cursor session and never reached the
repository — the container it ran in held the only copy. It was redone here
against `314b5ef` so it exists in git. If a future session is handed a summary
of UI work, check `git status` against the claim before building on it.

## What changed

<!-- No file count in this heading on purpose. It said "8 files" while the table
     listed 13, because the table grew over three commits and the heading did
     not. A hand-synced duplicate of something the table already states will go
     stale again; count the rows. -->


| File | Change |
|---|---|
| `tailwind.config.ts` | `fade-in-up` keyframe + animation |
| `components/marketing/sections.tsx` | Hero gradient wash, new `TrustBar`, CTA lift/press, `StepRail` card hover |
| `components/marketing/SiteHeader.tsx` | Shadow appears on scroll |
| `components/marketing/SiteFooter.tsx` | Spacing, row/column gap split, link transitions |
| `app/(marketing)/page.tsx` | `TrustBar` under the hero, door-card hover + arrow, early-access section |
| `app/(marketing)/shoppers/page.tsx` | `TrustBar` under the hero |
| `app/(marketing)/merchants/page.tsx` | `TrustBar` under the hero |
| `app/(marketing)/mall-operators/page.tsx` | `TrustBar` under the hero |
| `components/auth/auth-chrome.tsx` | **New.** `AuthChrome` — logomark + tagline + the `<main>` landmark |
| `app/login/[[...sign-in]]/page.tsx` | Wrapped in `AuthChrome` |
| `app/sign-up/[[...sign-up]]/page.tsx` | Wrapped in `AuthChrome` |
| `components/nav/merchant-top-bar.tsx` | Wallet chip elevated off the white bar |
| `components/nav/shopper-top-bar.tsx` | Header shadow over scrolling cards |
| `components/marketing/HeroShot.tsx` | **New, 2026-08-01.** CSS mockup of the feed for the Home hero — see the D50 section |
| `lib/__tests__/marketing-hero-shot.test.ts` | **New, 2026-08-01.** Guard for the mockup's disclosure |
| `docs/maanta-drift-register.md` | Row **D50** opened for the mockup |

## Decisions worth keeping

**`TrustBar` takes its items as props.** It renders no value of its own, so
every figure still resolves from `lib/marketing/facts.ts` at the call site. The
rule that every number renders from `facts.ts` survives a component that
displays numbers only if the component never owns one.

**The trust bar carries no metrics.** No shop count, no redemption total, no
shopper number. Those are measured figures, they are modelled until BBS is
live, and they would have to render through `<ScenarioStat>` inside
`<ScenarioNotice>`. What it carries instead is the commercial shape of the
product — free for shoppers, a fee only on a verified redemption, payment in
person — which is true today and needs no scenario gate.

**Each page's three items answer that audience's objections, not a house
template.** Home states the commercial shape. `/shoppers` answers the three
things that stop a shopper — will this cost me, will I miss the window, must I
install something — each of which is answered in full further down the page
(`#cost`, `#counter`, `#install`); the bar only gets the answer to someone who
will not scroll that far. `/merchants` states the whole offer before the first
scroll, reusing the same `fee` binding that `#cost` and the FAQ render, so there
is no second number to keep in step. Note `/shoppers` forbids counts by its own
page rule, which the no-metrics rule above already satisfies.

`/mall-operators` answers what an operator is actually evaluating — what does it
cost us, what must we install, what do we get — against `#commercial`,
`#deployment` and `#report`. Two things were decided there and should not be
undone casually. Its cost item names the tenant success fee rather than stopping
at "the mall pays nothing": left alone that reads as free, and an operator who
meets the fee later meets it as something withheld. And it carries no figures at
all, not even scenario-gated ones — the modelled node counts stay in the
sections that own them, behind `ScenarioStat`, and the bar sits above the point
where the page has established what Node 0 is. It makes no claim about BBS
beyond it being the mall MAANTA is live in, which `demo-mode-spec.md` §2a
requires of this page specifically.

**The hero wash is not the accent.** `from-paper via-white to-white` lifts the
hero off the header using the neutral tokens. Amber stays on primary CTAs and
live-status dots. The gradient runs top-down specifically so the CTA sits on
clean white and keeps its contrast ratio.

**`fade-in-up` is never applied to an `<h1>`.** An opacity animation on the LCP
element delays LCP. It is used on the trust bar only. `globals.css` already
collapses animation duration under `prefers-reduced-motion`, and the animation
is declared `both` so the end state survives that collapse.

**The auth chrome is one shared component, not four copies.**
`auth-routes.test.ts` requires the literal `if (isClerkAuth())` branch in each
route — a ternary fails it. The first attempt here merged the branches and broke
that guard; the guard is right, because it is what proves the route branches on
strategy at all. So each route keeps its early return, and the chrome lives in
`components/auth/auth-chrome.tsx`.

That matters more than it looks: with the chrome inline there are **four** places
it would live — two routes times two strategy branches. A change made on the
Supabase path would never reach the Clerk one, and the gap stays invisible until
`MAANTA_AUTH_STRATEGY` is flipped in production, on the one screen where a
stranger is deciding whether to trust us. `AuthChrome` also owns the `<main>`
landmark, so neither route may declare its own.

**The merchant wallet chip changed fill, not the number.** Cream on white was a
one-step tonal difference that made a tappable link read as loose text. It is
now white with a border and a lift. The balance itself is still plain `text-ink`
at every balance, which is rule M6/L11 — money is typography, not colour.

## Guards this pass had to satisfy

All 481 tests pass, `npm run build` is clean, `check-tokens` scanned 47 rendered
files, `next lint` is clean. The ones that actually constrained the work:

- `auth-routes.test.ts` — the `if (isClerkAuth())` shape (this one failed first)
- `marketing-shell.test.ts` — no demo banner on marketing, no inline prices
- `frozen-ui-rules.test.ts` — money never amber, closed vocabulary
- `marketing-a11y.test.ts` — one `<main>`, no amber focus ring
- `held-claims.test.ts` — no held claim in new copy

## Known gaps, deliberately not done

- ~~No product screenshot or phone mockup in the hero.~~ **Done 2026-08-01 —
  see the section below.** It is not a screenshot.
- Pricing page cards untouched.

## Update 2026-08-01 — the hero mockup (drift D50)

The hero now carries `components/marketing/HeroShot.tsx`, a CSS drawing of the
shopper feed, passed into `AudienceHero` through a new optional `media` slot.
Home only; the three audience pages keep the single-column hero.

**It is not a screenshot, and it could not have been one here.** Capturing the
real feed needs a running app: the local server 500s because middleware builds a
Supabase client and this container has no keys, the network policy blocks the
Vercel preview host, and Playwright is not installed. So the choice was never
"real capture vs mockup" — it was what an illustration should depict.

**The founder chose a feed with example deals** (2026-08-01), over a
mechanic-only mockup with no invented merchants and over a scaffold awaiting a
real capture. Both alternatives, and the consequence below, were on the table
before the decision.

**The consequence is a real gap, tracked as D50.** `CLAUDE.md` keeps the
demo-data banner off marketing routes on the premise that no synthetic deal rows
render there. That premise is now false on `/`. The rule as written is not
violated — D33 is about the banner's location — but its justification no longer
holds, and a session reading D33 alone would conclude marketing carries no
synthetic content. Hence a row rather than a comment.

What keeps it honest, none of which is decoration:

- a **visible** caption under the mockup, `Illustration · example shops and
  prices` — sighted visitors are the ones being shown invented prices;
- an `sr-only` sentence saying the shops and prices are invented, with the
  mockup body `aria-hidden`, so assistive tech gets one honest sentence instead
  of walking three invented listings as if they were a live feed;
- `marketing-hero-shot.test.ts`, **proved non-vacuous by mutation** — deleting
  the caption fails, moving it into a JSX comment fails (the string is still in
  the file, which is the case a naive `includes()` would pass), and a sample
  price in `text-brand` fails.

That guard reads source, not built HTML, which is against the standing rule for
new marketing guards. The reason is stated in the file rather than left to be
found: CI runs `test` before `build`, so `.next/` does not exist at test time,
and a guard that skipped on the missing directory would pass vacuously on every
run. The output was verified by hand this session instead — the caption, the
sr-only sentence, `text-ink` prices and the `aria-hidden` wrapper are all present
in `.next/server/app/index.html`, and absent from the other three pages.

**Drawn in CSS, not shipped as a PNG.** It stays sharp at any density, adds no
image bytes on mall wifi, restyles with the tokens instead of going stale the
first time the feed changes, and sidesteps the question of committing a capture
of demo data to the repo.

**The residual risk cannot be guarded:** an invented shop name could coincide
with a real Eastleigh business, which would turn an illustration into a claim
about that business. The names were chosen to be generic for exactly that
reason, but no test can check it. Replacing the mockup with a real capture from
Node 0 — once BBS carries real deals — closes both the risk and D50.

### What running the full CI gate caught

This session ran all five gates for the first time in this workstream
(`lint`, `typecheck`, `test`, `build`, `db-tests` via CI). **`typecheck` failed
where the 515-test suite passed**: `media` was added to `AudienceHero`'s prop
type but never destructured, so three references were `Cannot find name 'media'`.
Every marketing guard reads source as text, so none of them could see it. Prior
sessions on this branch verified with `npm test` and `npm run build` only —
which CLAUDE.md now says explicitly is not verified.

## Update 2026-08-01 — the pricing page (drift D51, D52)

`/pricing` was the last item on the gap list. Reading it turned up three
problems, only one of which was visual.

### What the cards now do

**Both cards state the success fee, in the same words and the same position.**
The old layout put the fee in Standard's small print and showed Elite as a bare
monthly price, which reads as "Elite is the paid plan, so the fee is included".
It is not — the fee is identical on both plans, and that *is* the pricing model.
A merchant who discovers it after signing up discovers it as something withheld.
Elite's card now says it outright: *the fee is the same on both plans; Elite buys
capacity, not a cheaper redemption.*

**The accent moved to the action.** The page had amber on the Elite heading and
an amber-tinted offer banner — and **no call to action anywhere**. The accent was
decorating a page a merchant could not act on. Elite is now carried by the dark
fill, and the one amber element is a `CtaBand` CTA to `/merchants/join`.

Beyond that: shared `Section` primitives instead of a bare `div`, a real `<h1>`,
feature lists where the icon carries meaning rather than colour, and the boost
price kept inside the Elite card where the plan context is (it is Elite-only —
`BOOST_ELITE_ONLY`, and stating it outside that context is how D34 happened).

### D51 — the launch offer was stated twice and gated once

`/merchants` renders the offer from `OFFERS.eliteTrial` and wraps it in
`isOfferLive(...)`, so a closed offer vanishes (risk R7). `/pricing` did neither:
it typed the cohort size, trial length and grace period as literals, and stated
the offer unconditionally. So four numbers duplicated constants that already
existed, and on `expiresOn` the two pages would have disagreed — one commercial
fact, two pages, no shared source, which is D34 again.

Both halves are fixed. No visible change today (`expiresOn` is 2026-10-31); the
change is that the block will now disappear on the same day `/merchants` drops
it.

**This needed a guard widened, and that is worth understanding before touching
it again.** `pricing-copy.test.ts` required the literal string `BBS` on any page
mentioning the trial — but it scans *source*, not rendered output, so no page
rendering `FACTS.launchMall` can ever satisfy it. The guard and the
single-sourcing rule were in direct conflict: satisfying one broke the other. It
now also accepts `launchMall`, which is the same accommodation its cap check
already made for `cohortShops`, for the same reason.

### D52 — the metadata guard's intent was wider than its list

`marketing-a11y.test.ts` says "every top-level marketing page needs its own title
and description", then enumerates ten paths. `/pricing` and `/merchants/join` are
not among them and had no `metadata` export at all, so both shipped sharing the
homepage's title and search snippet.

`/pricing` now has its own and is on the list. **`/merchants/join` is
deliberately not fixed here** — it needs a copy decision about what a lead form's
search snippet should say, which is a marketing call, not a mechanical one. D52
stays open for it.

The enumerated list is the real weakness: a guard walking every `page.tsx` under
`(marketing)/` would have caught both without anyone maintaining a list, and
would catch the next page added. Recorded in the row rather than done here.

### Verified

All five gates: lint, typecheck, **515/515**, build + `check-tokens` clean.
Three mutations confirm the guards are not vacuous — removing the node reference
from `/pricing` fails, removing the success-fee caveat fails, and deleting the
`metadata` export fails (which it did **not** before this change). Rendered
output checked in `.next/server/app/pricing.html`: both cards show `KES 30`, the
offer renders `100` / `BBS Mall, Eastleigh` / `30 days` / `7-day` from the
constants, the title is per-page, and there is no bare "Free" and no amber money.

Still not viewed in a browser.

## Update 2026-08-01 — `/merchants/join` metadata, and D52 closed

The last open half of D52. It lagged behind `/pricing` for a real reason, not
neglect: `/merchants/join` is a `"use client"` component, and **Next.js forbids
`export const metadata` in a client component**. Adding the export was never the
fix.

It is now split on the `/waitlist` precedent already in this repo — a server
`page.tsx` that exports metadata, wrapping `join-form.tsx` which holds the form.

**The split was checked against D41, the failure it most resembles.** `/contact`
shipped a form that existed in JSX and not in server HTML, because it called
`useSearchParams()` inside a `Suspense` boundary. This form does neither, and the
built output confirms it: `.next/server/app/merchants/join.html` contains a
`<form>`, the "Shop name" and "Get started" strings, and **zero**
`BAILOUT_TO_CLIENT_SIDE_RENDERING` markers.

The description names the KES 30 fee, read from `SUCCESS_FEE_KES`. This is the
page a merchant reaches from "list my shop", and the snippet is the last thing
they read before clicking — the fee is the one fact that decides whether MAANTA
is worth their time, so it should not be a surprise on the far side of a form.
Metadata is rendered output, so a typed fee there would be a second place for the
frozen number to drift.

### The guard now walks, and that is the actual fix

The metadata check was a hand-maintained array of ten paths. A list only checks
what someone remembered to add to it, and **both** misses were misses of memory.
It now walks every `page.tsx` under `(marketing)/`, so a page added tomorrow is
covered without anyone touching the test. It accepts `generateMetadata` as well
as static `metadata` — no marketing route uses it today, but a dynamic one
legitimately would, and a guard that failed such a page would push the next
author to delete the check rather than satisfy it.

Proved by mutation, including the case the old list could never have caught:

| Mutation | Result |
|---|---|
| A brand-new page added with no metadata | ❌ fails |
| `metadata` export removed from `/merchants/join` | ❌ fails |
| Unmodified (all 17 marketing pages) | ✅ passes |

### What the split broke, and why that was good

Moving the form moved the `formSubmit` tracking with it, and
`marketing-analytics.test.ts` asserted that call lived in `page.tsx`. It failed —
correctly. An untracked merchant lead form is invisible in the funnel, and
nothing else in the build would have noticed. Both references now point at
`join-form.tsx`.

Worth generalising: this session has now had **three** guards catch a real
mistake — `auth-routes` on the ternary, `typecheck` on the undestructured
`media` prop, and this one. Each was caught by something that reads structure
rather than behaviour, and in each case the fix was to satisfy the guard rather
than relax it. The one guard that *was* relaxed (`pricing-copy`'s node check,
D51) was relaxed because it was in direct conflict with another rule, and the
widening was mutation-tested in both directions.

**D52 is closed.** Suite 515/515, build and `check-tokens` clean.
