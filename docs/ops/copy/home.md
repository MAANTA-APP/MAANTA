# MAANTA — `/` Home Copy Deck

**Status:** Ready for implementation — *(at time of writing; built and shipped, see the note below)*
**Date:** 2026-07-31
**Route:** `/`
**Primary CTA:** Browse live deals → `/feed`
**Supporting CTAs:** List your shop → `/merchants` · For mall operators → `/mall-operators`
**Companion docs:** `shoppers.md`, `merchants.md`, `mall-operators.md`, `../website-ia.md`

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

## 0. The problem this page has to solve

The current homepage is a **shopper page with a merchant CTA bolted on**. There is no mall-operator door anywhere on the site, despite `/waitlist` offering the role. A merchant or a mall operator landing on `maanta.app` today has to guess where to go.

The fix is not to split the hero three ways. A homepage that serves three audiences equally serves none of them, and a hero written by committee is exactly what makes a site read as generic. The structure below does something more deliberate:

- **The hero stays shopper-weighted** — highest volume, and shopper demand is the thing that makes the merchant and operator arguments credible in the first place.
- **The sub-headline carries all three propositions in two sentences**, so a merchant reading the hero already knows the economics before they scroll.
- **One explicit three-door router**, high on the page, doing the routing job properly instead of leaving it to the nav.

`#doors` is the load-bearing section. If it is below the fold on desktop, this page has failed at its only structural job.

**Decisions carried forward:** English written to translate — short declarative sentences, no wordplay in headings. Scenario mechanism available but used sparingly (see §1).

---

## 1. Facts used

**Verified live:** Discover → Claim → Redeem · 6-digit code · 15-minute grace · KES 30 per verified redemption, no listing fee, no percentage cut, no monthly minimum · expired or rejected codes cost nothing · Flash / Boosted / Map · rankings from verified redemptions, never stars · no online checkout · nothing to download, runs in the browser · BBS Mall, Eastleigh, Nairobi = Node 0 · `/waitlist` segments shopper / merchant / mall operator · browsing `/feed` and `/browse` requires no sign-in · a phone number is required to claim, and that number is the sign-up.

**Existing homepage copy worth keeping:** the tagline **"The mall, made live."** (currently the title tag) and the problem framing *"Malls have deals. Shoppers rarely see them."* Both are good. Both are reused below.

> **Bug on the live site:** the current homepage reads *"**Merchant** write offers on chalkboards and WhatsApp groups."* Should be *"Merchants"*. Fix in the same commit whether or not this copy ships.

**Scenario use on Home:** permitted for the merchant-facing shop count only, via `ScenarioStat` (`mall-operators.md` §1a). **Any live deal count must be pulled from `/api/deals`, never modelled** — the same rule as the Shoppers page, for the same reason.

---

## 2. Page metadata

**Title:** `MAANTA — The mall, made live.`
**Meta description:** `See every deal in your mall before you get there. Claim on your phone, show a 6-digit code at the counter, pay the shop in person. Live at BBS Mall, Eastleigh.`
**OG headline:** `Every deal in your mall, live on your phone.`

---

## 3. Section-by-section copy

### `#hero` — `AudienceHero`

**H1**
> Every deal in your mall, live on your phone.

> **Note on the tagline.** *"The mall, made live."* is strong and already in the title tag. Keep it, but as the brand line in the header lockup or the footer — not as the H1. It is memorable once you know what MAANTA is, and opaque before that. The H1 has to do the explaining.
>
> **A/B variant:** the current live H1 *"Claim in-mall deals before you pay."* is worth keeping as variant B.

**Sub** *(carries all three audiences — do not shorten)*
> Claim a deal on your phone, show a 6-digit code at the counter, and pay the shop in person. Free for shoppers, with no card and no online checkout. Shops pay KES 30 only when a code is verified at their till.

**Primary CTA:** `Browse live deals` → `/feed`
**Secondary CTA:** `Install the app` → `/download`

**Under the CTAs**
> No sign-in needed to look around.

**Status line**
> Live at BBS Mall, Eastleigh · Nairobi

---

### `#problem` — two lines, then move

**H2** *(kept from live)*
> Malls have deals. Shoppers rarely see them.

**Body** *(typo corrected)*
> Merchants write offers on chalkboards, on paper taped to the shutter, and in WhatsApp groups. Shoppers walk past without knowing.

---

### `#loop` — `StepRail`

**H2**
> How it works

**Discover**
Open the feed for your mall. Deals sorted by what is nearest and what ends soonest.

**Claim**
Tap a deal. A 6-digit code appears on your phone and the deal is held for you.

**Redeem**
Show the code at the counter. Staff verify it, you pay the deal price in person.

**Closing — this line matters, give it space**
> No online checkout. Money moves at the till, between you and the shop, the way it always has.

---

### `#doors` — the three-audience router

> **The most important section on the page.** Three equal cards, visible without scrolling on desktop, first thing after the loop on mobile. Each card names its audience in plain language, states the single most relevant fact, and links out. Resist adding a fourth card.

**H2**
> Three ways in

**Card 1 — Shoppers**
See what the shops in your mall are offering right now. Free, no card, and nothing to download.
**Link:** `For shoppers` → `/shoppers`

**Card 2 — Merchants**
Publish a deal in two minutes. Pay KES 30 only when a customer's code is verified at your counter — no listing fee, no cut of the sale.
**Link:** `For merchants` → `/merchants`

**Card 3 — Mall operators**
Make every tenant promotion in your mall visible and measurable. No POS integration, no cost to the mall.
**Link:** `For mall operators` → `/mall-operators`

---

### `#verified` — the differentiator

> This is what separates MAANTA from a coupon app, and it is the one idea worth repeating on every page. Give it a full-width band.

**H2**
> Ranked by who actually walked in.

**Body**
> Nothing on MAANTA is ranked by stars or reviews. A deal rises because shoppers claimed it and staff verified the code at a counter — a real person, in a real shop, at a real time.

> That single rule is why merchants trust the ranking, why shoppers trust the feed, and why a mall can treat the numbers as evidence rather than marketing.

---

### `#deals` — what is in the feed

**H2**
> Flash, Boosted, and what is near you

**Flash**
Short-window top picks, often under an hour. Worth walking to now.

**Boosted**
Neighbourhood favourites, pushed to the top.

**Map**
Pins with precise pickup spots, so you find the right shop the first time.

---

### `#merchant-band` — merchant conversion band

> The live page has a version of this and it works. Keep it, tighten it, and make the numbers read from `facts.ts`.

**H2** *(kept from live)*
> Run a shop at BBS Mall?

**Body**
> KES 30 per verified redemption. No listing fee, no percentage cut, no monthly minimum. A code that expires or gets rejected costs you nothing.

> The first 100 shops we activate at BBS start with KES 300 of opening credit — ten redemptions before you spend anything.

**CTA:** `List your shop` → `/merchants`

**Scenario line** *(gated, badged `Modelled`)*
> {{activeShops}} shops publishing at BBS Mall

---

### `#node` — why Nairobi malls first

**H2** *(kept from live, it is good)*
> Built for Nairobi malls first

**Body** *(lightly tightened from the live copy)*
> MAANTA starts at BBS Mall, Eastleigh — Node 0. A precise, in-person loop for shoppers and merchants who already meet at the till.

> We are not building an online marketplace. There is no checkout, no delivery and no escrow. The transaction that already works — a person, a counter, a price — stays exactly as it is. We make the offer visible before it happens, and verifiable after.

**Link:** `See what's live at BBS Mall` → `/malls/bbs-mall`

---

### `#waitlist` — early access band

**H2** *(kept from live)*
> Get early access

**Body**
> Join as a shopper, a merchant, or a mall operator. We will email you before the next mall goes live.

**Role selector:** `Shopper` · `Merchant` · `Mall operator`
**Field:** Email
**Submit:** `Join waitlist`

**Under the form** *(kept from live — it sets expectations honestly)*
> Continues to the waitlist — we will ask for your name and phone next.

---

## 4. Claims register

| # | Claim | Status | Resolution |
|---|---|---|---|
| 1 | `{{activeShops}}` in `#merchant-band` | **Modelled** | Scenario-gated and badged. Replace with a real count or remove the line. |
| 2 | Any live deal count | **Not used** | If added, pull live from `/api/deals`. Never a constant. |
| 3 | KES 300 credit / first 100 shops | **Verified, time-bound** | Render with an expiry; the sentence disappears when the offer closes. |
| 4 | "No sign-in needed to look around" | **Verified logged out** | Safe. Re-check if middleware changes. |
| 5 | "We will email you before the next mall goes live" | **Implies a next mall** | Fine as intent, but do not name a mall until one is signed. |
| 6 | Everything else | **Verified live** | — |

---

## 5. Design and build notes

- **`#doors` above the fold on desktop.** If a visitor has to scroll to discover that MAANTA serves merchants and malls, the page has not done its job. On mobile it sits directly after `#loop`.
- **One accent, used four times.** `#FDBF2D` on the primary CTA, the live-status dot, the Flash badge, and the merchant band. Nowhere else. Broad yellow is what makes a site read as flashy rather than premium.
- **The hero needs a real product surface**, not an illustration — a deal card showing tier badge, countdown, distance in metres and `You pay KES X` against the struck-through price. Once demo data is gone, use a real deal.
- **Do not let the page get long.** Home routes; it does not persuade. Everything below `#doors` is reinforcement, and each section should survive the question *"would removing this cost us a conversion?"*
- **The demo banner must not render here** (risk R1). This is the page most likely to be seen by a merchant, an operator and an investor on the same day.
- **Numbers from `facts.ts`:** KES 30, KES 300, 6 digits, 15 minutes, 100 shops. Five numbers, one source.
- **Fix the `Merchant` → `Merchants` typo** in `#problem` regardless of whether the rest of this copy ships.
- **Instrument `#doors` hardest.** Click-through by card tells you which audience the homepage is actually serving, and whether the shopper-weighted hero is costing you merchant conversions. That is the single most useful number this site can produce in its first month.
