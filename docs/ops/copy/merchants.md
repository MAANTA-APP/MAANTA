# MAANTA — `/merchants` Copy Deck

**Status:** Ready for implementation
**Date:** 2026-07-31
**Route:** `/merchants` (301 from `/for-merchants`)
**Primary CTA:** List your shop → `/merchants/join`
**Supporting CTA:** See pricing → `/pricing`
**Companion docs:** `mall-operators.md`, `../website-ia.md`, `../website-expansion-plan.md`

---

## 0. What this page is replacing

Unlike Mall Operators, this page is **not** written from scratch. `/for-merchants` already ships six sections with good bones, and its copy is verified live:

> What it costs · Your first 10 are on us · How it works at your counter · A code always verifies · Plans · Start at BBS Mall

Two of those headings are better than anything I would have invented. **"Your first 10 are on us"** turns KES 300 of credit into ten free redemptions, which is how a shop owner actually thinks about it. **"A code always verifies"** answers the fraud objection before it is asked. Both are kept below, verbatim.

This deck consolidates that page with `/merchants` (which currently carries the form plus a boost price of KES 500 / 24h that appears nowhere else), fixes the pricing inconsistency, and adds the sections the existing page is missing: day-to-day operations, staff, the wallet, and objection handling.

**Decisions applied to this deck**

| Decision | Applied as |
|---|---|
| English, written to translate | Short declarative sentences. No idiom, no wordplay, no puns. Every heading survives translation into Swahili or Somali intact. |
| Wallet tops up by **M-Pesa**, card also accepted | Named explicitly in `#wallet`. This removes the biggest practical objection to a prepaid balance. |
| Social proof via the scenario mechanism | Reuses `ScenarioNotice` / `ScenarioStat` from `mall-operators.md` §1a. Shop counts render labelled `Modelled` and vanish when `isScenario` is false. |

---

## 1. Facts used

**Verified from the live site — safe to publish** (`lib/marketing/facts.ts`):

KES 30 per verified redemption · no listing fee · no percentage cut · no monthly minimum · flat fee regardless of basket size · expired or rejected codes cost nothing · a failed redemption does not block publishing · 6-digit code · 15-minute grace period · Standard: free, 1 active deal · Elite: KES 3,500/month, 2 active deals, flash deals, boosts · first 100 BBS shops: KES 300 opening credit · 30-day Elite trial for the first 100 BBS merchants, per-redemption fee still applies · 7-day grace after trial before reverting to Standard · boost KES 500 per 24 hours · Flash / Boosted / Map deal types · rankings from verified redemptions, never stars · no online checkout · BBS Mall, Eastleigh, Nairobi.

**Confirmed by the author, not yet on the site:** wallet tops up by **M-Pesa**, card also accepted.

**Scenario values** (`lib/marketing/scenario.ts`, gated on `isScenario`): `activeShops: 121`, `verifiedRedemptions: 6,400`, `nodeLiveSince: 'May 2026'`.

**VERIFY in repo before build:** exact M-Pesa flow wording (paybill vs STK push — `/api/topup` and `/api/webhooks/intasend` exist); whether staff accounts are on all plans or Elite only (`/merchant/staff`); whether boosts are Elite-only (`/api/boosts` exists, `/pricing` lists boosts under Elite).

---

## 2. Page metadata

**Title:** `For merchants — MAANTA`
**Meta description:** `List your shop on MAANTA. KES 30 when a customer's code is verified at your counter. No listing fee, no cut of the sale, no monthly minimum.`
**OG headline:** `You only pay when a customer walks in.`

---

## 3. Section-by-section copy

### `#hero` — `AudienceHero`

**Eyebrow**
> For merchants

**H1** *(kept from the live page — it is already the right headline)*
> You only pay when a customer walks in.

**Sub**
> Post a deal from your phone. A shopper claims it and gets a 6-digit code. Your staff check the code at the counter, the customer pays you in person, and MAANTA charges you KES 30. Nothing else.

**Primary CTA:** `List your shop`
**Secondary CTA:** `See how it works at your counter` → anchor `#counter`

**Status line** *(scenario-gated)*
> {{activeShops}} shops publishing at BBS Mall, Eastleigh `[Modelled]`

> **Fallback when `isScenario` is false:** `Live at BBS Mall, Eastleigh · Nairobi`

---

### `#cost` — what it costs

**H2** *(kept from live)*
> What it costs

**Lead**
> KES 30 for each verified redemption. That is the whole price.

**Four points**

**No listing fee.**
Putting your shop and your deals on MAANTA costs nothing.

**No cut of the sale.**
The fee is KES 30 whether the customer spends KES 200 or KES 20,000. We do not take a percentage.

**No monthly minimum.**
A quiet month costs you nothing. There is no floor to hit.

**Nothing for a code that fails.**
If a code expires, or your staff reject it, you are not charged. You pay for customers who arrived and bought.

**Closing**
> The money for the sale goes straight into your till, the way it does today. MAANTA never touches the payment.

---

### `#first-ten` — opening credit

**H2** *(kept from live — do not reword)*
> Your first 10 are on us

**Body**
> The first 100 shops we activate at BBS Mall start with KES 300 of opening credit. That is ten verified redemptions before you spend anything of your own.

> The first 100 also get 30 days of Elite. Two active deals, flash deals and boosts, at no monthly cost. The KES 30 per redemption still applies during the trial. When it ends you have seven days to decide, and if you do nothing you go back to Standard. Nothing is charged automatically.

> **Implementation:** this whole section is time-bound. Render from `facts.ts` with an expiry, and set a `remainingSlots` value if one can be tracked. When the offer closes the section must disappear, not sit there stale.

---

### `#counter` — how it works

**H2** *(kept from live)*
> How it works at your counter

**Intro**
> Four steps. Your staff learn it once.

**Step 1 — Post a deal**
Two minutes on a phone. Set the price, how many you will honour, and when it ends. You decide all three.

**Step 2 — A shopper claims it**
The deal is held for them and a 6-digit code goes to their phone. They come to you.

**Step 3 — Your staff verify the code**
Open MAANTA, type the six digits, check the deal on screen matches what the customer is asking for. Accept or reject.

**Step 4 — They pay you, we charge KES 30**
The customer pays the deal price at your till, in cash or however you normally take money. KES 30 comes off your MAANTA balance.

**Closing**
> The customer is standing in front of you for every step that matters. Nothing is agreed online and no money moves before they arrive.

---

### `#verify` — the fraud objection

> This section answers the question every merchant asks second, after price. The existing heading is exact — keep it.

**H2** *(kept from live)*
> A code always verifies

**Body**
> Every code is one use only, tied to one deal, at one shop. Yours.

**Four points**

**A code cannot be used twice.**
Once your staff accept it, it is spent.

**A code cannot be used at another shop.**
It only opens against the deal you published.

**An expired code will not verify.**
A claimed code stays valid until your deal ends, plus a 15-minute grace period so the customer can reach the counter. After that it fails, and it costs you nothing.

**Your staff can always reject.**
If something is wrong — a different item, a screenshot, an argument — reject it. You are not charged for a rejected code, and you are not obliged to honour anything you did not publish.

**Closing**
> You keep the final say at your own counter. MAANTA does not overrule it.

---

### `#operations` — running it day to day

> New section. Everything named here exists in the build (`/merchant/staff`, `/merchant/alerts`, `/merchant/deals/archived`, `/api/deals/repost`, `/api/boosts`), so it is honest and it is the strongest answer to "I do not have time for this."

**H2**
> Running it while you run the shop

**Four points**

**Your staff, their own logins.**
Add the people who work your counter. They verify codes without your phone and without your password. *(VERIFY: plan availability.)*

**Deals you can repost.**
A deal that worked once can be published again without typing it in from scratch. Old deals stay in your archive.

**Alerts when something needs you.**
A claim comes in, a deal is about to end, your balance is getting low. You are told, you do not have to check.

**Boosts when you want the traffic.**
KES 500 puts a deal at the top of the feed for 24 hours. Use it on a slow Tuesday, not every day. *(VERIFY: Elite-only?)*

---

### `#wallet` — the prepaid balance

> New section. The wallet is the one genuinely unfamiliar mechanic on the page, and it is where a merchant will hesitate. Name M-Pesa early.

**H2**
> Your balance, topped up by M-Pesa

**Body**
> MAANTA works from a prepaid balance. You top it up by M-Pesa — card also works if you prefer — and each verified redemption takes KES 30 off it.

**Three points**

**Top up what you want, when you want.**
There is no minimum to hold and no subscription taken from it.

**You can see every deduction.**
Each charge shows which deal, which code and what time. If a redemption should not have been charged, tell us and we will look at it.

**Running low does not switch you off.**
We warn you before it becomes a problem.

**Closing**
> Money for the sale itself never enters this balance. Customers pay you directly at the till. The balance only covers the KES 30 fees.

---

### `#plans` — Standard and Elite

**H2** *(kept from live)*
> Plans

**Intro**
> Most shops never need to leave Standard. Elite is for shops that want to run more than one offer at a time.

**Standard — free**
- One active deal
- KES 30 per verified redemption
- No monthly fee, ever

**Elite — KES 3,500 per month**
- Two active deals
- Flash deals — short-window offers that sit at the top of the feed
- Boosts included
- KES 30 per verified redemption still applies

**Below the table**
> Boosts can also be bought on Standard at KES 500 for 24 hours. Full detail on the [pricing page](/pricing).

> **Implementation — R7b:** the KES 500 boost price currently appears only on `/merchants` and on neither `/pricing` nor `/for-merchants`. Every price on this page must read from `facts.ts`. Fix the inconsistency in the same commit.

---

### `#start` — activation

**H2** *(kept from live)*
> Start at BBS Mall

**Body**
> You do not have to work this out on your own. Our team is in the mall. We will come to your shop, set you up, publish your first deal with you, and stay until a real code has been verified at your counter.

> If you would rather do it yourself, it takes about ten minutes. Shop name and phone number to start.

**CTA:** `List your shop` → `/merchants/join`

---

### `#faq` — `FaqAccordion`

**H2**
> Questions shop owners ask

**Will this take customers who would have paid full price?**
You choose the deal, the discount and how many you will honour. Set ten and only ten are claimable. A deal is a decision you make each time, not a permanent price change.

**What if nobody claims my deal?**
Then it costs you nothing. There is no fee for publishing, and no penalty for a deal that does not move.

**Do I need a smartphone or a computer at the counter?**
A phone with a browser is enough. There is nothing to download and nothing to install on a till.

**How quickly do I get the money?**
Immediately. The customer pays you at your counter. MAANTA is never between you and the payment.

**What if I am busy and cannot honour a deal right then?**
Your staff can reject a code, and you are not charged. If it is going to be a busy day, end the deal early or do not publish one.

**Can I stop?**
Yes. End your deals and stop publishing. There is no notice period, no contract length and no exit fee. Anything left in your balance stays yours. *(VERIFY: refund mechanism for a remaining balance.)*

**Who do I call when something goes wrong?**
WhatsApp support, and a desk in the mall. You are not filing a ticket and waiting.

---

### `#cta` — `CtaBand`

**H2**
> List your shop.

**Body**
> Shop name and a phone number to start. If you want us to come to you at BBS Mall, say so and we will.

**Primary CTA:** `List your shop` → `/merchants/join`
**Secondary CTA:** `See pricing` → `/pricing`

**Reassurance line under the CTA**
> No listing fee. No contract. KES 30 when a customer's code is verified at your counter.

---

## 4. `/merchants/join` — form copy

The lead form relocates here from `/merchants`. Field labels are verified live and should not change.

**H1**
> List your shop on MAANTA

**Sub**
> Two fields to start. We will call you to finish setting up, or come to your shop if you are at BBS Mall.

**Fields:** `Shop name` · `Phone` (`+254` prefilled)
**Submit:** `Get started`

**Under the form**
> Prefer to do it in person? Find us at the MAANTA desk in BBS Mall, Eastleigh.

**Legal line** *(required once Merchant Terms exists — see the footer/legal plan)*
> By continuing you agree to our [Merchant Terms](/merchant-terms).

---

## 5. Claims register

Fewer open items than the Mall Operators page — most of this copy is verified. These are the exceptions.

| # | Claim | Status | Resolution |
|---|---|---|---|
| 1 | `activeShops` shop count in the hero | **Modelled** | Scenario-gated and badged. Replace with a real count or remove. |
| 2 | Wallet tops up by M-Pesa, card accepted | **Author-confirmed, not on site** | Confirm the exact flow (paybill vs STK push) before writing final microcopy. |
| 3 | Staff accounts available | **Route exists** (`/merchant/staff`) | Confirm plan availability — all plans or Elite only. |
| 4 | Boosts at KES 500 / 24h on Standard | **Price verified, availability not** | `/pricing` lists boosts under Elite. Resolve, then state one answer everywhere. |
| 5 | Deal repost and archive | **Routes exist** | Confirm both are merchant-facing, not admin-only. |
| 6 | Low-balance alerts | **`/merchant/alerts` exists** | Confirm a balance-threshold alert specifically. |
| 7 | "Anything left in your balance stays yours" | **Unconfirmed** | Needs a real refund or withdrawal mechanism, and matching Merchant Terms. Remove the line if neither exists. |
| 8 | In-mall desk and WhatsApp support | **WhatsApp verified on `/help`** | Confirm the desk is staffed before promising it. |
| 9 | "About ten minutes" self-serve setup | **Estimate** | Time a real onboarding and correct it. |
| 10 | KES 300 credit / 30-day Elite trial / first 100 shops | **Verified, but time-bound** | Render with an expiry. Section must disappear when the offer closes. |

---

## 6. Design and build notes

- **This audience reads for money, not for polish.** Prices, the word *free*, and the phrase *you are not charged* are the elements that need visual weight. Nothing else on the page should compete with them.
- **`#cost` and `#verify` carry the page.** Cost answers "what is the catch", verify answers "how do I get cheated". If a merchant reads only two sections, these are the two.
- **Write for a phone.** Most shop owners will open this on a mid-range Android on mall wifi. Test on a small viewport and a throttled connection before calling it done.
- **Translation-ready structure.** Every heading is a plain statement. Keep them that way — no wordplay in headings, ever, or the Swahili version needs a rewrite rather than a translation.
- **Numbers from `facts.ts` only.** KES 30, KES 300, KES 500, KES 3,500, 15 minutes, 6 digits, 100 shops, 30 days, 7 days. Ten numbers, one source. This page is where a pricing inconsistency does the most damage.
- **Scenario gating** as specified in `mall-operators.md` §1a. `ScenarioNotice` must be mounted if any scenario stat renders.
- **Instrument:** PostHog events on both CTAs, on `#plans` reaching viewport, on FAQ expansion, and on `/merchants/join` submit. Watch how far merchants scroll before converting — if they convert at `#cost`, the page below it is too long.
