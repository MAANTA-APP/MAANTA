# MAANTA marketing claims register

**Status:** CURRENT for the factual columns (verified against production and the
decisions log on 2026-09-01); **DRAFT** for anything marked as such below.
**Audience:** founder, agency, agents, and anyone writing a sentence about MAANTA
that leaves the building — a page, a post, a deck, a pitch, an email.
**Rule:** if a claim is not on the green list, it is not approved. Ask.

**Why this exists:** MAANTA's public surfaces already have machine guards —
every number renders from `lib/marketing/facts.ts`, modelled figures render only
through `<ScenarioStat>` inside `<ScenarioNotice>`, and held claims are scanned
by `held-claims.test.ts`. Those guard the **website**. Nothing guards a
WhatsApp message, a pitch at a counter, a deck, or a caption. This register is
the human half.

---

## 1. Approved now — say these freely

### Shopper-facing

- MAANTA shows deals from shops in this mall.
- You claim a deal, get a **6-digit code**, show it to staff, and pay the shop.
- **MAANTA is free for shoppers.** There is no payment of any kind inside the
  app.
- Your code stays valid until the deal ends **plus 15 minutes**.
- If a code does not work, **you are not charged** either way.
- Scanning a shop's QR **checks you in**; it does not redeem, pay, or use up your
  code, and it is optional.

### Merchant-facing

- **KES 30 per verified redemption.** No listing fee, no monthly minimum, no cut
  of the sale, and nothing for a code that expires or is rejected.
- The shopper pays you **directly and in full**, in person. MAANTA never handles
  your customer's money.
- Your Node 0 wallet starts with **KES 300** of MAANTA credit — ten redemptions
  before you spend your own money.
- **Typing a code charges nothing.** Only an explicit Confirm charges.
- **An empty wallet never blocks a redemption.** It only blocks publishing new
  deals.
- A disputed fee is reviewed by an admin and resolved **within 72 hours** —
  upheld means the redemption is reversed and the KES 30 credited back.
- You can give counter staff their own access.
- Elite: **"Pricing coming soon."**

### Positioning

- MAANTA connects digital discovery to **attributable physical retail visits**.
- The loop: merchant publishes → shopper discovers and claims → shopper
  physically arrives → staff verifies → MAANTA attributes the redemption.
- MAANTA is **pre-launch**, running a controlled field validation at **BBS Mall,
  Nairobi (Node 0)**.

---

## 2. Prohibited until evidence exists

Each of these is currently **false, unproven, or unauthorised**. Do not use them
in any form, including softened ones ("shops are seeing…", "shoppers love…").

| Prohibited claim | Why | Unlocks when |
|---|---|---|
| Any merchant count, or "X shops on MAANTA" | Production holds 215 merchant rows, **213 of them synthetic** and the other 2 internal. **External genuine merchants: 0** | Genuine external merchants exist and are counted per `docs/ops/evidence-classification-guide.md` |
| Any redemption, GMV or transaction volume figure | 1 non-demo success exists and it is **internal** (MAANTA's own E2E). External: **0** | Genuine external redemptions exist |
| Any conversion, footfall-uplift or "drives X% more visits" claim | Never measured. At pilot n, a rate is false precision | A sample large enough to support a rate, which Node 0 will not produce |
| Any savings figure ("shoppers save KES X") | Never measured | Measured |
| Testimonials, quotes or case studies | **None exist.** Never fabricate or composite one | A real participant says it, in writing, with a signed content release |
| "Live at BBS Mall" / "BBS Mall is our partner" | No signed mall partnership. Node 0 is where the pilot runs, not a partnership announcement | A signed agreement |
| A paid Elite monthly price | Founder ruling 2026-08-24 removed KES 3,500; **no replacement number is authorized** | A new decisions-log entry |
| "M-Pesa top-up available" | IntaSend availability **must not be assumed**; Stripe is in **sandbox** | The founder confirms the rail is live |
| "Earn MAANTA Points" / any reward promise | `fast_visit_enabled = false` on production. Zero reward events ever | The gate is on **and** Points terms exist |
| "Fast Visit is active" | Same | Same |
| Any fraud-prevention guarantee | Guardian raises holds and flags; it does not guarantee anything | Never as a guarantee |
| "Fully production-hardened" / "enterprise-grade" | CI green is not the same claim | Never in this form |
| "One claim per phone per day" as an enforced rule | Stated as frozen, **implemented at no layer** (D136) | It is implemented |
| Multi-mall, multi-node or city-wide coverage | Node 0 is one mall | More nodes exist |
| ODPC-registered / data-protection-registered | Registration status is **unowned** (D146). The site says "in progress" — do not upgrade that wording | Registration is established and evidenced |

---

## 3. Vocabulary — the words, and the ones that are wrong

The fee is the most-misdescribed thing in the company. Get it right every time.

| Say | Never say |
|---|---|
| **success fee** | commission · transaction fee · cut · take rate · listing fee · % of sale |
| **verified redemption** | sale · transaction · purchase · conversion |
| **claim** | book · reserve · buy · order |
| **redeem** / **verify** | scan the code · check out · pay |
| **wallet** / **top up** | account balance · deposit · float |
| **check in** (arrival) | redeem · scan to pay · confirm |
| **MAANTA Points** (promotional, no cash value) | credit · balance · cashback · currency · KES |
| **deal** | voucher · coupon · offer code |
| **merchant** / **shop** | vendor · partner (unless one is signed) |
| **Node 0 / BBS Mall pilot** | launch · rollout · going live citywide |

**Money words near Points are the highest-risk error in the whole register.**
Points are promotional and are not cash, not KES, not transferable, not
purchasable, not withdrawable and not a purchasing currency. Never style them
like money and never put them next to a KES figure without separation.

---

## 4. Numbers, and where each one comes from

Never type a number. Read it from its source.

| Number | Value | Source |
|---|---|---|
| Success fee | KES 30 | `app_config.success_fee_kes`; `SUCCESS_FEE_KES` in `src/lib/pricing.ts` is the single copy constant |
| Grace period | 15 minutes | `DEAL_GRACE_MINUTES` |
| Code length | 6 digits | `facts.ts` |
| Node 0 opening credit | KES 300 | `app_config.node0_opening_credit_kes` |
| Elite trial | 30 days + 7-day grace | decisions log |
| Elite price | **none published** | founder ruling 2026-08-24 |
| Dispute SLA | 72 hours | founder ruling 2026-07-22 |
| Support response | WhatsApp same day; 1 business day by email | `RESPONSE_TIMES` |
| Fast Visit window | 15 minutes | `FAST_VISIT_WINDOW_MINUTES` (feature **off**) |
| Points per Fast Visit | 50 | `app_config.fast_visit_points` (feature **off**) |

Any figure that is **modelled rather than measured** must render inside
`<ScenarioNotice>` on the website, and must be labelled "illustrative" anywhere
else. Production runs with `NEXT_PUBLIC_SCENARIO_MODE` unset, which renders
honest fallbacks and makes no claim BBS Mall is a signed partner.

---

## 5. Before a case study or a testimonial exists

Three things must be true, and none can be obtained retroactively:

1. The activity is classified **genuine external** (evidence guide §3).
2. The participant said it **in their own words**, recorded at the time.
3. A **signed content/photography release** exists — see
   `docs/legal/legal-gap-checklist-2026-09-01.md` §7. This is the item with a
   Merchant 01 deadline.

**Never** compose a quote, average several people into one voice, or use a
participant's words without the release.

---

## 6. Sample-size discipline

Node 0 produces single-digit and low-double-digit counts. At that scale:

- Report **counts**, not percentages. "3 of 8 claims" — never "38%".
- Never make a causal claim. Nothing in a ten-person pilot establishes cause.
- Never extrapolate to a mall, a city or a market.
- Say **"we do not know yet"** where it is true. Pre-launch honesty is an asset
  in front of investors; a discovered overclaim is not.
- **Failure is never reported as zero.** If a number could not be read, say it
  could not be read.

---

## 7. Marketing state, and what is not being built

The website is live and complete for the six core pages plus legal and support
routes. Marketing **campaign** gates M2–M7 (email platform, sequences, content
calendar, approval workflow, KPI review, agency handoff) are **not started**, and
that is deliberate: Node 0 Field Validation Mode freezes non-essential work, and
a campaign that drives demand to a one-merchant pilot would create a bad first
impression at scale.

**Nothing in this register authorizes a campaign.** It exists so that the
conversations already happening — an agent pitching a shop, a founder talking to
an investor — stay accurate.
