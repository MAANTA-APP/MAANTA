# MAANTA — `/about` Copy Deck

**Status:** Ready for implementation — two content dependencies (see §4) — *(at time of writing; built and shipped, see the note below)*
**Date:** 2026-07-31
**Route:** `/about`
**Primary CTA:** Contact us → `/contact`
**Supporting CTA:** See how it works → `/shoppers`
**Companion docs:** `home.md`, `merchants.md`, `mall-operators.md`, `../website-ia.md`

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

## 0. Who actually reads this page

Not shoppers. Shoppers go to the feed.

About is read by people doing diligence: a mall operator deciding whether to take a meeting, a merchant checking whether this outfit will still exist in six months, a journalist, a prospective hire, an investor. All of them are asking one question — **is this serious, and are these people straight with me?**

That makes About the page where the usual moves are most damaging. Mission statements, "we believe" paragraphs, and any sentence containing *empower*, *revolutionise* or *seamless* will do more harm here than anywhere else on the site, because this audience has read a thousand of them and knows they signal nothing.

Three things earn trust with this reader, and the page is built entirely from them:

1. **Say what the company does, mechanically.** No metaphor.
2. **Say how it makes money, in the open.** Most companies bury this. Putting it on About is a confidence signal, and it costs nothing.
3. **Say what you have not done.** A dated, honest status paragraph is worth more than any claim.

The strongest device on this page is `#not` — defining MAANTA by what it refuses to be. Negative space describes a company more precisely than positive claims, and it is very hard to fake.

---

## 1. Facts used

**Verified:** KES 30 per verified redemption · Elite KES 3,500/month · boosts KES 500 per 24 hours · no listing fee, no percentage cut, no monthly minimum · no online checkout · rankings from verified redemptions, never stars · 6-digit code · 15-minute grace · BBS Mall, Eastleigh, Nairobi = Node 0 · shoppers pay nothing · browsing requires no sign-in · a phone number is the shopper sign-up.

**Known from the repo:** founder **Mohamed Elmi**, currently reachable at `admin@maanta.app` (GitHub org `MAANTA-APP`; the same identity owns the Vercel team and the PostHog project). Field-agent tooling exists in the build (`/agent/leads`), consistent with an in-person activation team.

**Scenario values** (gated, per `mall-operators.md` §1a): three months live, `activeShops`, `verifiedRedemptions`.

**Content dependencies — this page cannot ship without them:** founder biography, registered legal entity name and address. See §4.

---

## 2. Page metadata

**Title:** `About — MAANTA`
**Meta description:** `MAANTA makes the deals inside a mall visible before you walk in and verifiable after you walk out. Live at BBS Mall, Eastleigh. Here is how it works and how we make money.`
**OG headline:** `What MAANTA is, and how it makes money.`

---

## 3. Section-by-section copy

### `#what` — what MAANTA is

**H1**
> About MAANTA

**Lead paragraph** *(the whole company in four sentences — no metaphor, no mission language)*
> MAANTA makes the deals inside a shopping mall visible before you walk in, and verifiable after you walk out.
>
> Shops publish offers from a phone. Shoppers see them in one live feed, claim one, and receive a 6-digit code. Staff verify the code at the counter, the shopper pays the shop in person, and MAANTA charges the shop KES 30 for that verified redemption.
>
> That loop is the entire product.

---

### `#not` — what MAANTA does not do

> **The strongest section on the page.** Keep the closing line intact — it is what converts a list of gaps into a list of decisions.

**H2**
> What MAANTA does not do

**Lead**
> It is quicker to describe MAANTA by what it refuses to be.

**Six points**

**We do not process payments.**
There is no checkout in MAANTA. Money moves at the till, between a shopper and a shop, exactly as it did before we existed.

**We do not deliver anything.**
The shopper walks in. That is the point.

**We do not host reviews or star ratings.**
A deal rises because people redeemed it, not because people rated it.

**We do not take a percentage of any sale.**
KES 30 is KES 30 whether the basket is KES 200 or KES 20,000.

**We do not sell shopper data.**
Not to advertisers, not to brokers, not to other malls.

**We are not a marketplace.**
We do not stand between a shop and its customer, and we do not want to.

**Closing**
> Every one of those is a decision we intend to keep, not a feature we have not got to yet.

---

### `#why` — why Nairobi malls first

**H2**
> Why Nairobi malls, and why in person

**Body**
> Mall retail in Nairobi already works. Shoppers come, shops sell, money changes hands at a counter. Nothing about that transaction is broken and nothing about it needs disrupting.

> What fails is information. A shop runs a good offer and tells the forty people in a WhatsApp group and whoever happens to look at the chalkboard. Two floors up, someone who would have bought it never finds out. In a place like Eastleigh — hundreds of shops behind hundreds of similar shutters — that gap is expensive for everyone standing on either side of it.

> So MAANTA fixes the information problem and leaves the transaction alone. We are not trying to move mall retail online. We are trying to make the mall legible.

---

### `#principle` — the one rule

**H2**
> Verified redemption is the only signal we trust

**Body**
> Everything on MAANTA ranks on one thing: a code that a member of shop staff verified at a counter, with the shopper standing there.

> Not impressions. Not clicks. Not stars, which can be bought, farmed, or left by someone who never entered the shop.

> It is a deliberately narrow signal, and narrow is the point. It is the only event in this business that is expensive to fake and equally meaningful to all three sides — a shopper who walked in, a shop that made a sale, and a mall that got footfall it can account for.

---

### `#money` — how we make money

> Unusual to put on an About page. That is exactly why it belongs here.

**H2**
> How we make money

**Body**
> Shops pay KES 30 when a shopper's code is verified at their counter. That is the core of the business.

> A shop that wants more than one live offer can take Elite at KES 3,500 a month, and any shop can buy a boost — top of the feed for 24 hours — at KES 500. Those are the only other charges that exist.

**Three points**

**Shoppers pay nothing.** There is no paid tier, no subscription, and nowhere to enter a card.

**Malls pay nothing.** Operator partnerships are not billed.

**We take no percentage and sell no data.** Our revenue does not rise because a basket was large or because we learned something about a shopper.

**Closing — this is the line to keep**
> If nobody walks into a shop, we earn nothing. That is deliberate. It keeps our incentive pointed at the same thing the merchant already cares about.

---

### `#today` — where we are

> Must carry a visible date and be genuinely updated. A stale "where we are today" is worse than not having one.

**H2**
> Where we are today

**Scenario version** *(gated — renders with `ScenarioNotice`)*
> *Last updated {{lastUpdated}}.*
>
> MAANTA has been live at BBS Mall, Eastleigh for {{monthsLive}} months. {{activeShops}} shops publish deals, and {{verifiedRedemptions|number}} redemptions have been verified at a counter. `[Modelled]`

**Fallback version** *(when `isScenario` is false — write the real one in this shape)*
> *Last updated {{lastUpdated}}.*
>
> MAANTA is live at BBS Mall, Eastleigh — our first mall, and the only one so far.

**What we have not done yet** *(keep this subsection in both versions)*
> We are in one mall. We have not opened a second, and we would rather do the first one properly than announce three.
>
> We have no outside investment to point at and no awards to list. What we have is a working loop, shops using it, and a team that is in the building most days.

**Closing**
> If any of that changes, this page changes with it.

---

### `#team` — who is building it

**H2**
> Who is building it

**Founder block**
> **Mohamed Elmi** — Founder
>
> {{FOUNDER_BIO}}
>
> admin@maanta.app

> **Writing guidance for `{{FOUNDER_BIO}}` — two to four sentences, no more.**
> What earns trust with this reader is specific and checkable: where you are from, what you did before this, and the concrete thing that made you build MAANTA rather than something else. A sentence like *"I grew up shopping in Eastleigh and watched shops write offers on chalkboards that nobody two floors up ever saw"* does more than any list of credentials.
> What does not work: adjectives about yourself, "passionate about", a mission restatement, or a career summary that could belong to anyone. If a sentence would be true of a hundred other founders, cut it.

**Team block**
> Alongside the product, MAANTA runs an activation team that works the mall floors — onboarding shops in person, setting up staff accounts, and staying at a counter until a real code has been verified. Most of what we have learned came from that, not from analytics.

> **Do not state a headcount** unless it is accurate and you are comfortable with it being small. "A team that is in the building most days" reads better than a number that invites the wrong follow-up question.

---

### `#contact` — `CtaBand`

**H2**
> Talk to us

**Body**
> Merchants, mall operators, press and anyone doing due diligence — the fastest route is the contact page, and it goes to a person.

**Primary CTA:** `Contact us` → `/contact`
**Secondary CTA:** `See how it works` → `/shoppers`

**Entity line — legally required, see §4**
> MAANTA APP · BBS Mall, Eastleigh · Nairobi, Kenya

---

## 4. Content dependencies and claims register

**Blocking — the page cannot publish without these**

| # | Item | Why |
|---|---|---|
| A | `{{FOUNDER_BIO}}` | The founder block is the reason a diligence reader opens this page. A blank or generic bio undoes the rest. Guidance is in `#team`. |
| B | `MAANTA APP` and `BBS Mall, Eastleigh` | Already flagged as an open dependency in the footer/legal plan. About is where a diligence reader looks for it first. |

**Claims register**

| # | Claim | Status | Resolution |
|---|---|---|---|
| 1 | "Live for {{monthsLive}} months", `activeShops`, `verifiedRedemptions` | **Modelled** | Scenario-gated and badged. Fallback copy written. |
| 2 | "We do not sell shopper data" | **Must match `/privacy` exactly** | Cannot ship before the Privacy Policy is rewritten. Same sentence, both pages. |
| 3 | "No outside investment to point at" | **Assumed** | If this has changed, rewrite — do not leave it as false modesty. |
| 4 | Activation team works the floors | **Consistent with `/agent/leads` in the build** | Confirm the team exists at the scale implied before publishing. |
| 5 | Elite KES 3,500/mo, boost KES 500/24h | **Verified, but inconsistent across the site** | Risk R7b. Read from `facts.ts`; fix `/pricing` in the same commit. |
| 6 | `admin@maanta.app` | **`admin@maanta.app` is the only address evidenced** | Use a named address — `mohamed@maanta.app` — not a shared admin inbox. On an About page, `admin@` reads like nobody is home. |
| 7 | "It goes to a person" | **Promise** | Only true once `/contact` routes somewhere monitored. |

---

## 5. Design and build notes

- **Set this page in prose, not cards.** About is the one page where a reader has decided to read. Long measure (~68ch), generous leading, minimal chrome. Breaking it into feature tiles would undercut the seriousness the copy is going for.
- **`#not` is the section to design around.** Six short statements, strong vertical rhythm, no icons. Icons would make a deliberately austere list look decorative.
- **`#money` deserves a distinct surface** — a bordered block or a tinted band. A reader scanning for "how do they make money" should find it without reading.
- **One photograph, at most.** The founder, or the team working a mall floor. Real, not staged. If there is no real photograph, use none — an obvious stock portrait on an About page is worse than no image at all.
- **`Last updated` must be real** and driven by a constant, not typed into JSX. Set a calendar reminder to revisit `#today` quarterly. A "where we are today" dated eight months ago is a credibility problem, not a content gap.
- **No accent colour except the CTA.** This page earns nothing from `#FDBF2D`.
- **Instrument lightly:** CTA clicks and scroll depth. If readers reach `#money` and leave, the money section is doing its job and the contact CTA should also appear directly beneath it.
