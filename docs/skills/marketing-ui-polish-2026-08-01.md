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

## What changed (8 files)

| File | Change |
|---|---|
| `tailwind.config.ts` | `fade-in-up` keyframe + animation |
| `components/marketing/sections.tsx` | Hero gradient wash, new `TrustBar`, CTA lift/press, `StepRail` card hover |
| `components/marketing/SiteHeader.tsx` | Shadow appears on scroll |
| `components/marketing/SiteFooter.tsx` | Spacing, row/column gap split, link transitions |
| `app/(marketing)/page.tsx` | `TrustBar` under the hero, door-card hover + arrow, early-access section |
| `app/(marketing)/shoppers/page.tsx` | `TrustBar` under the hero |
| `app/(marketing)/merchants/page.tsx` | `TrustBar` under the hero |
| `components/auth/auth-chrome.tsx` | **New.** `AuthChrome` — logomark + tagline + the `<main>` landmark |
| `app/login/[[...sign-in]]/page.tsx` | Wrapped in `AuthChrome` |
| `app/sign-up/[[...sign-up]]/page.tsx` | Wrapped in `AuthChrome` |
| `components/nav/merchant-top-bar.tsx` | Wallet chip elevated off the white bar |
| `components/nav/shopper-top-bar.tsx` | Header shadow over scrolling cards |

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

- No `TrustBar` on `/mall-operators` — the other three audience pages have one.
  Not an oversight to fix blind: an operator is evaluating the model, not a
  price or a fee, so the three items would have to be written for that question
  rather than copied from `/merchants`.
- No product screenshot or phone mockup in the hero.
- Pricing page cards untouched.
