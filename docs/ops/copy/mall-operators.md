# MAANTA — `/mall-operators` Copy Deck

**Status:** Ready for implementation — *(at time of writing; built and shipped, see the note below)*
**Date:** 2026-07-31
**Route:** `/mall-operators`
**Primary CTA:** Book a pilot conversation → `/contact?topic=mall-operator`
**Supporting CTA:** Join as a mall operator → `/waitlist?role=mall-operator`
**Companion docs:** `../website-ia.md`, `../website-expansion-plan.md`

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

## ⚠️ Read before shipping

This copy is written to a **forward-dated scenario**, at the author's instruction: BBS Mall is treated as a signed mall-level partner and MAANTA as three months post-launch with product-market fit established. **Neither is true as of 2026-07-31.** BBS Mall management has not yet been approached.

That is a legitimate way to build a plug-and-play demonstration to show a prospective anchor partner. It is not publishable copy.

Two rules follow:

1. **Do not deploy this to `www.maanta.app` unaltered.** Every scenario figure is centralised in §1 and listed again in the register at the end. All of them must be replaced with real values, or the affected sections removed, before the page is public.
2. **The demo build carries a visible scenario marker.** *(Decided 2026-07-31.)* Presenting projected figures as achieved results to the counterparty you are asking to sign is the kind of thing that ends a partnership discussion permanently — and BBS are the one party positioned to know the numbers are not real. The marker is specified in §1a and is bound to the same flag as the figures, so the numbers cannot render without it.

Everything below is written to be genuinely good copy. The integrity problem is the numbers, not the argument — and the argument holds without them.

---

## 1. Scenario constants

Implement as `lib/marketing/scenario.ts`, kept **separate** from `lib/marketing/facts.ts`. Facts are verified. These are not. Keeping them in different files makes it impossible to ship one while believing it is the other.

```ts
// SCENARIO DATA — MODELLED, NOT MEASURED. Do not render in production.
export const SCENARIO = {
  isScenario: true,              // gate every consumer on this
  nodeLiveSince: 'May 2026',
  monthsLive: 3,
  activeShops: 121,
  liveDeals: 190,
  verifiedRedemptions: 6_400,
  merchantParticipation: '78%',  // of onboarded shops active in last 30 days
  repeatShopperRate: '41%',      // shoppers redeeming more than once
  activationWeeks: 3,
} as const
```

---

## 1a. Scenario marker — `ScenarioNotice`

The marker and the figures share one flag. If `SCENARIO.isScenario` is true, both appear. If it is false, both disappear and the fallback copy takes over. There is no state in which modelled numbers render unlabelled.

### Placement

**Top of page**, above the hero, full-width, sticky on scroll. Not dismissible — a marker you can close is a marker that gets closed thirty seconds into a walkthrough.

### Copy

**Full (desktop):**
> **Preview build.** Figures on this page are modelled to show what a live node looks like at three months. They are not measured results.

**Compact (mobile, and the sticky state after scroll):**
> Preview build — figures modelled, not measured

**Badge beside each scenario stat** (hero status line, Node 0 callout):
> `Modelled`

### Design

Calm and matter-of-fact. This is a statement of method, not a warning.

- Neutral surface — a light neutral band with a hairline bottom rule. **Not** amber, red, or any alert styling. `#FDBF2D` stays reserved for CTAs.
- Body-size text, normal weight, with only `Preview build.` emphasised.
- The inline `Modelled` badge: small caps, hairline border, neutral foreground, no fill.
- Sticky state collapses to a single line roughly 40px tall.

### Build rule

Bind it structurally, not by convention:

```ts
// Scenario figures render only through this component.
<ScenarioStat value={SCENARIO.verifiedRedemptions} fallback={null} />
```

In development, `ScenarioStat` should throw if it mounts while `ScenarioNotice` is absent from the tree. That makes the failure mode a build error rather than a live page with unlabelled projections. Never inline a `SCENARIO.*` value directly into JSX.

**Flip to production:** set `isScenario: false`. The marker disappears, every scenario stat falls back, and the `#stage` fallback copy replaces the three-months paragraph. One line, one commit, no hunting.

---

**Verified facts** (safe, drawn from the live site — reuse from `facts.ts`): KES 30 success fee per verified redemption · no listing fee · no percentage cut · no monthly minimum · expired or rejected codes cost nothing · 6-digit code · 15-minute grace period · Flash / Boosted / Map deal types · rankings from verified redemptions, never stars · no online checkout · PWA, no download · BBS Mall, Eastleigh, Nairobi = Node 0.

---

## 2. Page metadata

**Title:** `Mall operators — MAANTA`
**Meta description:** `MAANTA makes every tenant promotion in your mall visible, redeemable and measurable. No POS integration. No cost to the mall.`
**OG headline:** `Your mall runs hundreds of promotions a month.`
**OG subline:** `None of them are measured.`

---

## 3. Section-by-section copy

### `#hero` — `AudienceHero`

**Eyebrow**
> For mall operators

**H1**
> Your mall runs hundreds of promotions a month. None of them are measured.

**Sub**
> MAANTA puts every tenant offer into one live feed, redeems it at the counter with a one-time code, and reports back what actually moved. No POS integration. No hardware. No cost to the mall.

**Primary CTA:** `Book a pilot conversation`
**Secondary CTA:** `See how Node 0 works` → anchor `#node`

**Status line** *(scenario-gated)*
> Live at BBS Mall, Eastleigh since {{nodeLiveSince}} · {{activeShops}} shops · {{verifiedRedemptions|number}} verified redemptions

> **Fallback when `isScenario` is false:** `Live at BBS Mall, Eastleigh · Nairobi` — the line already used across the site.

---

### `#problem` — prose + three-column list

**H2**
> Promotion without attribution

**Body**
> Walk any floor of a busy mall and you will find offers written on chalkboards, taped to shutters, and posted into WhatsApp groups with forty members. A tenant runs twenty percent off for a weekend. On Monday, nobody can say what it did.

**Three points**

**Offers stop at the shop doorway.**
A deal reaches the people already standing in front of it. The shopper two floors up never learns it existed.

**Footfall counters tell you how many, never why.**
A gate count records that four thousand people entered on Saturday. It cannot tell you that six hundred came for a specific offer in a specific unit.

**Tenant performance is self-reported.**
When a lease comes up for review, the strongest evidence on the table is usually the tenant's own account of a good quarter.

**Closing line**
> The promotions are already happening. The measurement is what is missing.

---

### `#node` — `StepRail` + prose

**H2**
> A node is a mall that runs live

**Body**
> MAANTA operates mall by mall. When a mall goes live it becomes a node: every participating tenant can publish offers to one feed that shoppers open on their phone, before and during a visit.

**Four steps**

1. **A tenant publishes.** Two minutes on a phone. Price, quantity, expiry.
2. **A shopper claims.** The offer is reserved and a 6-digit code is issued to their phone.
3. **Staff verify at the counter.** The code is entered, checked, and the shopper pays the deal price in person.
4. **The redemption is recorded.** Shop, time, deal, verified.

**Closing**
> There is no online checkout. Money moves at your tenant's till, exactly as it does today. What changes is that the visit is now attributable to a specific offer.

**Node 0 callout** *(scenario-gated)*
> **BBS Mall, Eastleigh — Node 0.** Live for {{monthsLive}} months. {{activeShops}} shops publishing, {{liveDeals}} offers active, {{verifiedRedemptions|number}} redemptions verified at the counter.

---

### `#value` — four cards

**H2**
> What the mall gets

**Card 1 — Verified redemption data**
Not impressions. Not clicks. A redemption is counted only when a member of your tenant's staff verifies a code at the counter and the shopper is standing there. It is the closest thing to a receipt for footfall.

**Card 2 — Tenant activation, done in person**
Our team works the floors unit by unit. We onboard shops, set up staff accounts, and stay until the first redemption goes through. Tenants who have never run a digital promotion are the ones we spend the most time with.

**Card 3 — Every offer in one place**
A shopper deciding where to spend Saturday sees what your mall has before they leave the house. Offers rank by verified redemptions, never by stars or reviews, so the feed reflects what people actually walked in for.

**Card 4 — Nothing to integrate**
No POS connection. No hardware. No IT project, no procurement cycle, no vendor security review of your systems. Your tenants use a phone they already own.

---

### `#report` — the operating report

> This section converts a current limitation — there is no operator dashboard — into the stronger offer. Do not replace it with a dashboard promise unless one is genuinely being built.

**H2**
> A monthly operating report, delivered by a person

**Body**
> You are not asked to log into anything, learn a tool, or chase a login for a colleague. Each month you receive a written report on how the node performed, and we sit down and go through it.

**What the report covers**

- Verified redemptions by shop, by floor, by day of week and by hour
- Which offer types moved — Flash, Boosted, standard
- Merchant participation: active, dormant, newly onboarded, and who needs a visit
- Repeat-shopper rate across the mall
- A written read on what changed since last month, and what we think caused it

**Closing**
> The last item is the one that matters. Numbers without an interpretation are another dashboard nobody opens.

---

### `#deployment` — timeline

**H2**
> What deployment actually involves

**Intro**
> Four steps. Roughly a month from agreement to live feed.

**Week 0 — Scope**
One meeting. We walk the floor plan, the tenant list and the category mix, and agree which floors to activate first.

**Weeks 1–{{activationWeeks}} — Activation**
Our team is in the building. We onboard tenants unit by unit, set up wallets and staff accounts, and run each shop through a live redemption before we leave the counter.

**Week 4 — Go live**
The feed opens to shoppers. Signage goes up at the entrances your team approves.

**Month 2 onward — Operate and report**
We keep working the floors, onboarding new tenants, and supporting staff. The first operating report lands at the end of the month.

**Closing**
> Nothing is installed. Nothing is procured. Nothing is invoiced to the mall.

---

### `#requirements` — what we need

**H2**
> What we need from you

**Four items**

1. **An introduction to your tenants.** A letter, or a line in the comms you already send. Tenants respond very differently when the mall has vouched for us.
2. **A table during activation.** Somewhere on the concourse for roughly {{activationWeeks}} weeks.
3. **Permission for signage.** Entrances and concourse, in whatever format your standards allow.
4. **One named contact on your side.** Someone we can reach, and who can reach us.

**Closing**
> That is the whole list. There is no systems access, no data export from your side, and no procurement step.

---

### `#commercial` — cost

**H2**
> The mall pays nothing

**Body**
> MAANTA earns a KES 30 success fee, charged to a tenant only when a shopper's code is verified in store. No listing fee. No percentage of the sale. No monthly minimum. An expired or rejected code costs the tenant nothing.

> The mall is not billed at any point during a pilot, and we are not asking you to sign a commercial agreement to start one. If the pilot works and both sides want to continue, we agree terms then, with three months of your own data on the table.

---

### `#data` — governance

**H2**
> What we collect, and who it belongs to

**We record**
Deal claims, verified redemptions, timestamps, and the shop the redemption belongs to. Shoppers create an account with a phone number.

**We do not handle payment data**
There is no online checkout in MAANTA. Payment happens at your tenant's till, on your tenant's terms, exactly as it does now. No card details pass through us.

**Mall reporting is aggregated**
Your operating report covers shop-level and mall-level activity. It does not identify individual shoppers.

**We do not sell shopper data**
Not to advertisers, not to data brokers, not to other malls.

**Jurisdiction**
MAANTA operates under the Kenya Data Protection Act 2019. Full detail is in our [Privacy Policy](/privacy), and a Data Processing Addendum forms part of any pilot agreement.

---

### `#stage` — honest positioning

**H2**
> One mall. Deliberately.

**Body** *(scenario-gated)*
> MAANTA has been live at BBS Mall for {{monthsLive}} months. We are choosing the next three malls carefully rather than collecting logos.
>
> That is a deliberate constraint, and it is worth being direct about what it buys you. A mall that joins now gets our team on its floors, not a support queue. It gets the product shaped around problems its tenants actually have. And it gets an operating report written by the people who were in the building that month.
>
> There is a version of this business that signs twenty malls and serves none of them properly. We are not building it.

**Fallback when `isScenario` is false**
> MAANTA is live at BBS Mall, Eastleigh — our first node. We are choosing the next malls carefully rather than collecting logos. A mall that joins now gets our team on its floors, not a support queue, and a product shaped around problems its tenants actually have.

---

### `#faq` — `FaqAccordion`

**H2**
> Questions operators ask

**Does this compete with our own marketing?**
No. It distributes it. Your campaigns bring people to the mall; MAANTA tells them what is worth walking to once they are deciding. Mall-level campaigns can be surfaced in the feed alongside tenant offers.

**What if our tenants don't take part?**
Participation costs a tenant nothing to try — no listing fee, and the success fee only applies when a code is verified at their own counter. In practice the harder problem is not persuasion, it is sitting with a shop owner while they publish their first offer. That is what activation weeks are for.

**Do we need to change our POS or our systems?**
No. There is no integration of any kind. Staff verify a code on a phone.

**Who supports our tenants day to day?**
We do. WhatsApp support, plus a desk in the mall during activation and on request afterwards. Tenant support does not land on your team.

**What happens to the data if we stop?**
Your operating reports are yours to keep. We stop reporting, tenants can continue or close their accounts, and the terms of any data handling are set out in the pilot agreement before it starts.

**How long before we see anything meaningful?**
The first redemption usually happens within a day of a shop going live. A month of data is enough to see patterns by floor and by hour. A quarter is enough to see whether tenant behaviour has changed.

---

### `#cta` — `CtaBand`

**H2**
> Start with a conversation, not a contract.

**Body**
> Tell us about your mall — floors, tenant mix, and what you have tried before. If it is not a fit, we will say so in the first call.

**Primary CTA:** `Book a pilot conversation` → `/contact?topic=mall-operator`
**Secondary CTA:** `Join as a mall operator` → `/waitlist?role=mall-operator`

**Contact line** *(requires a real name and address — see dependencies)*
> Or write directly: Mohamed Elmi, admin@maanta.app

---

## 4. Unverified claims register

Every line below is currently false or unconfirmed. Resolve each before the page goes public.

| # | Claim in copy | Status | Resolution |
|---|---|---|---|
| 1 | BBS Mall is a mall-level partner | **False today** | Approach BBS. Until signed, remove partner framing; BBS is merchant-density proof only. |
| 2 | "Live for 3 months" / `nodeLiveSince: May 2026` | **False today** | Replace with the real go-live date, or drop the duration. |
| 3 | `activeShops: 121`, `liveDeals: 190` | **Demo data** — these are the sample figures on `/malls/bbs-mall` | Replace with production counts before public use. |
| 4 | `verifiedRedemptions: 6,400` | **Modelled** | Replace with the real figure or remove the stat. |
| 5 | `merchantParticipation: 78%` | **Modelled** | Only publish once measurable. |
| 6 | `repeatShopperRate: 41%` | **Modelled** | Only publish once measurable. |
| 7 | Monthly operating report exists as a deliverable | **Not built** | Confirm someone owns producing it before promising it. |
| 8 | Activation team works floors unit by unit | **Partly true** — `/agent/leads` exists in the build, implying field agents | Confirm team capacity matches the promise. |
| 9 | 4-week deployment timeline | **Unvalidated** | Derive from the first real activation. |
| 10 | Data Processing Addendum forms part of pilot agreements | **Does not exist** | Flagged as deferred in the footer/legal plan. Draft before making this claim. |
| 11 | Kenya DPA 2019 compliance statement | **Unconfirmed** | Depends on ODPC controller registration — an open dependency. |
| 12 | "We do not sell shopper data" | **Should be true, must be verifiable** | Must match the rewritten Privacy Policy exactly. |
| 13 | `{{OPERATOR_CONTACT_NAME/EMAIL}}` | **Missing** | Needs a real person and a monitored inbox. |

**Mitigation in force:** while `isScenario` is true, rows 2–6 are visibly marked by `ScenarioNotice` (§1a) and each carries a `Modelled` badge. Rows 1 and 7–13 are **not** covered by the marker — they are claims in prose, not figures — and must be resolved by editing the copy itself.

---

## 5. Design and build notes

- **Restraint carries this page.** The operator audience is the least tolerant of decoration. Long measure, generous vertical rhythm, `#FDBF2D` reserved for the two CTAs and the live-status dot — nowhere else.
- **No stock photography.** If imagery is used, it is the mall floor and the merchant redemption screen. An empty escalator photo reads as a template.
- **The `#report` section is the differentiator.** Give it the strongest visual treatment on the page. It is the answer to "what do I actually get", and it is honest about MAANTA doing the work rather than shipping a dashboard.
- **Scenario gating must be structural,** not a comment. Every scenario value renders through `ScenarioStat`, which returns the fallback when `SCENARIO.isScenario` is false. `ScenarioNotice` is mounted by the same flag. Never inline a modelled number into JSX. See §1a.
- **Build `ScenarioNotice` before the hero.** It is the first thing on the page and the thing that makes the rest of it safe to show.
- **`?topic=mall-operator`** must be handled by `EnquiryRouter` on `/contact` — build that before this page's primary CTA goes live, or it lands on an unrouted form.
- **Instrument it.** PostHog events on both CTAs, on `#report` reaching viewport, and on FAQ expansion. This page's copy is v1 by definition; the first real operator conversation should rewrite parts of it.
