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
| `app/login/[[...sign-in]]/page.tsx` | Logomark + tagline chrome, factored into `LoginChrome` |
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

**The hero wash is not the accent.** `from-paper via-white to-white` lifts the
hero off the header using the neutral tokens. Amber stays on primary CTAs and
live-status dots. The gradient runs top-down specifically so the CTA sits on
clean white and keeps its contrast ratio.

**`fade-in-up` is never applied to an `<h1>`.** An opacity animation on the LCP
element delays LCP. It is used on the trust bar only. `globals.css` already
collapses animation duration under `prefers-reduced-motion`, and the animation
is declared `both` so the end state survives that collapse.

**The login chrome is a wrapper, not two copies.** `auth-routes.test.ts`
requires the literal `if (isClerkAuth())` branch in the route — a ternary fails
it. The first attempt here merged the branches and broke that guard. The shape
that satisfies both the guard and the no-duplication goal is: keep the early
return, extract the chrome into `LoginChrome`, wrap each branch. The guard is
right — it is what proves the route branches on strategy at all.

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

- **`/sign-up` did not get the login chrome.** The two auth pages now differ:
  `/login` has the logomark and tagline, `/sign-up` does not. Applying
  `LoginChrome` to `app/sign-up/[[...sign-up]]/page.tsx` is the fix and is a few
  lines; it was outside the eight-file scope of this pass.
- No `TrustBar` on `/shoppers` or `/merchants` — Home only so far.
- No product screenshot or phone mockup in the hero.
- Pricing page cards untouched.
