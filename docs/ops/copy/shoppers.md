# MAANTA — `/shoppers` Copy Deck

**Status:** Ready for implementation
**Date:** 2026-07-31
**Route:** `/shoppers` (301 from `/for-shoppers` and `/how-it-works`)
**Primary CTA:** Browse live deals → `/feed`
**Supporting CTA:** Install the app → `/download`
**Companion docs:** `merchants.md`, `mall-operators.md`, `../website-ia.md`

---

## 0. What this page has to overcome

The merchant page argues about money. This page has almost no economic argument to make — MAANTA is free for shoppers, so "what does it cost" is answered in four words. The barriers are different, and two of them are rarely written about:

**1. Embarrassment at the counter.** The real risk a shopper is weighing is not money, it is standing at a till, holding up a phone, and being told *"that doesn't work here"* with a queue behind them. That is a social cost, and it is why people ignore discount apps. The page has to remove it explicitly. `#counter` exists for this, and the line doing the work is *"You are not asking for a favour."*

**2. "What's the catch?"** A free app asking for a phone number invites a reasonable assumption about spam, data resale, or a subscription that starts later. The strongest answer available is structural and verified: **there is no online checkout in MAANTA at all.** No card details, no payment inside the app, ever. `#cost` leads with it.

Everything else — what the feed looks like, the 15-minute grace, no download — is supporting evidence.

**Decisions carried forward**

| Decision | Applied as |
|---|---|
| English, written to translate | Short declarative sentences, no idiom or wordplay. Headings survive translation into Swahili or Somali intact. |
| Scenario mechanism available | Used sparingly here — see §1, deal counts should be **live from the API**, not modelled. |

---

## 1. Facts used

**Verified from the live site — safe to publish:**

Discover → Claim → Redeem · tap a deal, get a **6-digit code** on your phone · show the code at the counter and pay the deal price in person · **15-minute grace period** after a deal expires · **no online checkout** · runs in the browser, **nothing to download**, Add to Home Screen via `/download` · deal types **Flash** ("short-window top picks"), **Boosted** ("neighbourhood favourites pushed to the top"), **Map** ("pins with precise pickup spots") · rankings from **verified redemptions, never stars** · BBS Mall, Eastleigh, Nairobi is the launch node, more malls coming · *"Merchants write offers on chalkboards and WhatsApp groups. Shoppers walk past without knowing."*

**Verified this session by fetching the live app logged out:**

- **`/feed` and `/browse` require no sign-in.** Deals, prices and countdowns are fully visible to a logged-out visitor. This is a significant trust asset and the page should say so plainly.
- Feed sections are titled **"Top picks near you"**, **"Neighbourhood favourites"**, **"Deals near me"**.
- Browse offers filters **Expiring soon · Flash · Favourites · Live now · Today**, sorted by **Nearest**.
- Deal cards show tier badge, expiry countdown, shop name, **distance in metres**, and `You pay KES X` against a struck-through original price.
- App tabs: **Feed · Browse · Map · Deals · You**.

**VERIFY in repo before build:**

1. ~~At what point is a phone number required?~~ **Confirmed by the author 2026-07-31:** browsing is open; a phone number is required at launch **to claim a deal**, and the phone number *is* the sign-up — no password, no email. This is a stronger trust position than originally drafted and `#cost` has been updated to say so directly.
2. Can a shopper hold more than one active claim at a time?
3. Is `Favourites` (`/api/favourites`) available logged out or only after sign-in?

**Do not use scenario constants for deal counts on this page.** A shopper-facing count must be true at the moment it is read, or it damages exactly the trust the page is building. Pull live from `/api/deals`, or omit the number.

---

## 2. Page metadata

**Title:** `For shoppers — MAANTA`
**Meta description:** `See the deals in your mall before you get there. Claim on your phone, show a 6-digit code at the counter, pay the deal price in person. Free, no card needed.`
**OG headline:** `The deals in your mall, before you get there.`

---

## 3. Section-by-section copy

### `#hero` — `AudienceHero`

**Eyebrow**
> For shoppers

**H1**
> The deals in your mall, before you get there.

> **A/B note:** the live homepage currently uses *"Claim in-mall deals before you pay."* That version leads with a verb the shopper has not learned yet. Mine leads with the benefit. Both are worth testing — keep the live one as variant B rather than discarding it.

**Sub**
> Open the feed and see what the shops in your mall are offering right now. Tap a deal, get a 6-digit code, and show it at the counter. You pay the deal price in person, the way you normally pay.

**Primary CTA:** `Browse live deals`
**Secondary CTA:** `Install the app`

**Under the CTAs**
> Free. No card. No sign-in needed to look.

**Status line**
> Live at BBS Mall, Eastleigh · Nairobi

---

### `#problem` — short, then move on

> Keep this to three sentences. The shopper does not need persuading that malls have hidden deals — they have walked past them. State it and go.

**H2**
> The offers are already there. You just never see them.

**Body**
> Shops write their offers on chalkboards, on paper taped to the shutter, and in WhatsApp groups you are not in. You walk past a shop that was doing forty percent off and find out on the way home.

> MAANTA puts all of it in one place, on your phone, before you decide where to go.

---

### `#how` — `StepRail`

**H2**
> Three steps

**Step 1 — Find a deal**
Open the feed for your mall. Deals are sorted by what is closest to you and what is ending soonest.

**Step 2 — Claim it**
Tap the deal. It is held for you and a 6-digit code appears on your phone.

**Step 3 — Show the code**
Give the six digits to the person at the counter. They check it, you pay the deal price, you leave.

**Closing**
> No printing. No screenshots. No queue for a separate desk.

---

### `#feed` — what you will actually see

> Written from the real logged-out UI. Describing the actual screen beats describing the idea.

**H2**
> What is in the feed

**Four points**

**Top picks near you.**
Flash deals — short windows, often under an hour. These are the ones worth walking to now.

**Neighbourhood favourites.**
Deals other shoppers have actually redeemed, pushed to the top.

**Deals near me.**
Everything else in your mall, with the distance in metres so you know if it is on your floor.

**The map.**
Pins with precise pickup spots, so you find the right shop the first time. Eastleigh has a lot of shops behind a lot of similar shutters.

**Below**
> You can filter by *Expiring soon*, *Flash*, *Live now* or *Today*, and sort by what is nearest.

**Ranking note — give this its own line, it is a differentiator**
> Nothing here is ranked by stars or reviews. A deal moves up because people claimed it and actually redeemed it at the counter. You are seeing what other shoppers walked in for, not what someone rated five stars.

---

### `#counter` — the moment that matters

> **This is the most important section on the page.** It exists to remove the fear of being turned away at a till with people watching. Do not cut it for length, and do not bury it below the fold on mobile.

**H2**
> What happens at the counter

**Body**
> The shop published the deal. They are expecting people to arrive with codes. **You are not asking for a favour.**

**Four points**

**They type the six digits.**
The same deal you claimed appears on their screen — the item, the price, the time.

**You pay the deal price.**
In cash, or however you normally pay that shop. The money goes to them directly.

**You have 15 minutes after it ends.**
A claimed code stays valid until the deal expires, plus a 15-minute grace period. You do not have to run.

**If it does not work, you owe nothing.**
No charge, no penalty, nothing to cancel. Claiming a deal is not a purchase and it never becomes one.

---

### `#cost` — the catch, answered

**H2**
> What it costs you

**Lead**
> Nothing. There is no version of MAANTA that charges you.

**Four points**

**No card details. Not now, not later.**
There is no online checkout in MAANTA. There is nowhere to enter a card, because no money is ever taken through the app.

**You pay the shop, in person.**
Exactly as you would if you had walked in without us.

**Claiming a deal is not buying it.**
If you change your mind, do nothing. It expires and that is the end of it.

**Your phone number, and nothing else.**
Browse the whole feed without an account. When you claim your first deal you give a phone number — and that is the sign-up. No password to invent, no email address, no form. The number exists so a code can be tied to one person and used once.

**Closing**
> Shops pay us a flat KES 30 when a code is verified at their counter. That is the whole business. We have no reason to charge you and no reason to sell what we know about you — [our privacy policy](/privacy) sets out exactly what we hold.

---

### `#install` — no download

**H2**
> Nothing to download

**Body**
> MAANTA runs in your browser. There is no app store, no install, and nothing taking up space on your phone.

> If you use it often, add it to your home screen and it opens like any other app. Takes about ten seconds.

**CTA:** `How to add it to your home screen` → `/download`

---

### `#where` — coverage

**H2**
> Where it works

**Body**
> MAANTA is live at **BBS Mall, Eastleigh, Nairobi**. That is our first mall, and the shops there are the ones publishing deals today.

> More malls are coming. If you want yours next, [tell us](/waitlist) — we go where shoppers ask us to.

**Link:** `See what's live at BBS Mall` → `/malls/bbs-mall`

---

### `#faq` — `FaqAccordion`

**H2**
> Questions

**Is it really free?**
Yes. Shops pay MAANTA a flat KES 30 when a code is verified at their counter. Shoppers pay nothing at any point.

**Do I need to give card or M-Pesa details?**
No. There is no payment of any kind inside MAANTA. You pay the shop at the till.

**Do I need to download anything?**
No. It runs in your browser. You can add it to your home screen if you want it to open faster.

**What if the deal expires while I am walking to the shop?**
You have the deal's full window plus a 15-minute grace period after it ends. If you are in the mall, you have time.

**What if the shop will not honour it?**
Tell us. Every code is tied to a deal that shop published themselves, so we can see exactly what was promised. You are never charged either way, and a shop that does not honour its own deals does not stay on MAANTA.

**Do I need to make an account?**
Not to look around. When you claim your first deal you give a phone number, and that is your account — there is no password to remember and no email needed.

**Why does it need my phone number?**
So a code can be tied to one person and used once. It is not used to sell you anything you did not ask for.

**Are the deals real?**
Every deal is published by the shop itself, and rankings come from redemptions that staff verified at a counter — not from reviews or ratings.

---

### `#cta` — `CtaBand`

**H2**
> See what is live in your mall right now.

**Body**
> No sign-up to look around.

**Primary CTA:** `Browse live deals` → `/feed`
**Secondary CTA:** `Install the app` → `/download`

---

## 4. Claims register

| # | Claim | Status | Resolution |
|---|---|---|---|
| 1 | Phone number needed only at claim; the number *is* the sign-up | **Confirmed** — browsing verified open, claim/sign-up confirmed by author | Resolved. Safe to publish. |
| 2 | "A shop that does not honour its own deals does not stay on MAANTA" | **Policy claim, unconfirmed** | Confirm an enforcement process exists. If not, soften to what is true. |
| 3 | "We have no reason to sell what we know about you" | **Must match Privacy Policy** | Cannot ship before `/privacy` is rewritten. |
| 4 | Filters listed (`Expiring soon`, `Flash`, `Live now`, `Today`) | **Verified logged out** | Re-check if the feed UI changes. |
| 5 | Feed section names | **Verified logged out** | Same. |
| 6 | "About ten seconds" to add to home screen | **Estimate** | Harmless, but time it. |
| 7 | Any live deal or shop count | **Not used in this deck** | If added later, pull live from `/api/deals`. Never a scenario constant on a shopper page. |
| 8 | Distance shown in metres | **Verified** | — |

---

## 5. Design and build notes

- **Mobile is not the secondary case, it is the only case that matters.** Assume a mid-range Android on mall wifi. Design at 360px first and let desktop be the adaptation.
- **`#counter` gets the strongest treatment on the page.** It answers the fear that actually stops people. On mobile it should be reachable within two scrolls.
- **`#cost` is the trust section.** "No card details. Not now, not later." should be the largest non-heading text on the page.
- **Show the product, not a metaphor.** A real deal card — tier badge, countdown, distance in metres, `You pay KES X` against the struck-through price — does more than any illustration. Use actual UI, and once demo data is gone, actual deals.
- **The demo banner must not appear here.** *"These shops, deals and codes are not real"* on a page whose entire argument is that the deals are real is the worst possible placement of risk R1. Phase 1 scoping is a hard prerequisite for shipping this page.
- **Numbers from `facts.ts`:** 6 digits, 15 minutes, KES 30. Three numbers, one source.
- **Translation-ready:** every heading is a plain statement. `#counter`'s *"You are not asking for a favour"* is the one line where tone carries meaning — flag it for careful translation rather than a literal one.
- **Instrument:** PostHog on both CTAs, on `#counter` and `#cost` reaching viewport, and on FAQ expansion. If shoppers open *"Is it really free?"* more than anything else, move that answer up into `#cost` as a headline.
