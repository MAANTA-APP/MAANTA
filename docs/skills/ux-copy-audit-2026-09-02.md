# UX copy audit — external site review, verified against the repo (2026-09-02)

**Status:** CURRENT · **Owner:** founder · **Class:** INTERNAL
**Mode:** Node 0 Field Validation. Reviewer session, not a build session.
**Source under review:** an external UX/copy review of `maanta.app`, written from
the rendered public site only, with no access to this repository.
**Method:** every claim and every recommendation in that review was checked
against `maanta-app/` source. Verdicts are `CONFIRMED`, `ALREADY SHIPPED`,
`CONTRADICTED` or `FOUNDER CALL`, each with a `path:line`.

**No product code changed in this session.** Four confirmed defects are recorded
as drift rows **D223–D226** and the corrections proposed below are written but
not applied, because each is a change to a **public claim** and the operating
state freezes discretionary product and copy work. Section 7 is the approval
list.

---

## 0. Headline

The external review is directionally right about the product story and wrong
about most of the gaps. Nearly everything it recommends for the app **already
ships** — YOU PAY on tile, detail and claim bar; a labelled illustration on the
hero; a merchant walkthrough; a merchant dashboard carrying claims, verified
visits, claim-to-verified rate, success fees, deal slots and wallet balance.

Its one genuinely load-bearing observation is the one it states most weakly:
**"Flash" and "Boosted" wording is unclear.** Checked against the code, that is
not a clarity problem. It is a **truth problem**, and it runs the wrong way:

> The marketing site tells **merchants** that KES 500 buys top-of-feed placement,
> and tells **shoppers** that the same rail is what other shoppers redeemed.

That is undisclosed paid placement described to the buyer's customer as earned
ranking. It is the single finding in this audit worth a founder ruling, and it
is not a matter of taste.

---

## 1. What the feed actually does

The frozen three-rail structure, from `maanta-app/src/lib/deal-list-controls.ts`
and pinned by `maanta-app/src/lib/__tests__/locked-feed-order.test.ts`:

| Rail | Shopper-facing title | Ordered by | Who decides position |
|---|---|---|---|
| 1 `flash` | Top picks near you | soonest expiry first | the clock |
| 2 `boosted` | Neighbourhood favourites | most recently boosted first | **the merchant, by paying** |
| 3 `standard` | Deals near me | all-time verified redemptions descending | shoppers who walked in |

Rail 2 is a purchase: KES 500 per 24 hours, debited from the merchant wallet,
Elite-only and not bypassable by admin or `service_role`
(`maanta-app/supabase/migrations/20260715194145_boost_elite_only_gate.sql`;
price `FACTS.boostPer24hKes`, canonically `app_config.boost_fee_kes`).

The feed default sort is `featured` — the locked structure —
(`deal-list-controls.ts:40`). `nearest` is **Browse's** default
(`deal-list-controls.ts:47`), not the feed's.

Flash duration is a merchant slider with **minimum 1 hour**, maximum 24, default
6 (`maanta-app/src/components/ui/inputs.tsx:433-445`).

Everything in section 2 follows from that table.

---

## 2. Confirmed defects

### D223 — `/shoppers` describes the paid rail as the earned one

`maanta-app/src/app/(marketing)/shoppers/page.tsx:143` tells shoppers that
**Neighbourhood favourites** is:

> "Deals other shoppers have actually redeemed, pushed to the top."

That is the description of **rail 3**, not rail 2. Rail 2 is ordered by most
recent paid boost. The same grid then describes rail 3
(`shoppers/page.tsx:147`) as "Everything else in your mall, with the distance in
metres" — so the two rails' descriptions are effectively swapped against their
real orders, and the one a merchant pays for is the one credited to shoppers.

The merchant-facing pages state the truth plainly and correctly —
`/merchants:284` ("On Elite, KES 500 puts a deal at the top of the feed for 24
hours"), `/pricing:169`, `/about:195`, `/faq:103`. So the site is internally
consistent for the buyer and misleading for the buyer's customer. Nothing on any
shopper surface — marketing or in-app — says a boosted deal was paid for. The
in-app rail subtitle is "Boosted deals near you"
(`maanta-app/src/app/(shopper)/feed/page.tsx:255-256`), which names the mechanism
without disclosing that it is bought.

**Severity:** highest in this audit. It is a trust claim on a money-adjacent
surface, of exactly the class `held-claims.test.ts`,
`src/lib/marketing/live-claims.ts` and drift rows D87/D90 exist to prevent.

### D224 — the site-wide ranking claim is true of one rail in three

`maanta-app/src/app/(marketing)/page.tsx:224` heads a full dark section:

> "Ranked by who actually walked in." … "A deal rises because shoppers claimed it
> and staff verified the code at a counter."

`/shoppers:160-163` puts the same claim in a raised card: "A deal moves up
because people claimed it and actually redeemed it at the counter. You are
seeing what other shoppers walked in for."

Both are unqualified and site-wide. In fact verified redemptions order **rail 3
only**. Rail 1 is ordered by expiry and rail 2 by payment. The claim's own
contrast — "not what someone rated five stars" — is used to establish that
nothing buys position, while a rail directly above it is sold at KES 500/24h.

This is the load-bearing trust argument of the whole site, and it is the
paragraph a merchant, a mall operator or an investor is most likely to quote
back. It should survive being read next to the pricing page.

### D225 — "often under an hour" is not reachable

`/:245` — "Short-window top picks, often under an hour."
`/shoppers:139` — "Flash deals — short windows, often under an hour."

The flash slider's minimum is **1 hour** and its default is 6
(`src/components/ui/inputs.tsx:433-445`). A flash deal under an hour cannot be
created. "Often" additionally asserts an observed frequency; there is no
operating history to observe — external field validation stands at zero genuine
merchants and zero genuine successes (CLAUDE.md, Node 0 counters).

### D226 — the "Discover" step describes a sort the feed does not use

`/:168` — "Open the feed for your mall. Deals sorted by what is nearest and what
ends soonest."

The feed's default is `featured`, the locked three-rail structure
(`deal-list-controls.ts:40`). `nearest` is Browse's default
(`deal-list-controls.ts:47`), and "ends soonest" is rail 1 only. The homepage
therefore gives **three different accounts of ranking in one scroll** — nearest
and soonest at `:168`, verified redemptions at `:224`, and an unexplained
"pushed to the top" at `:247` — none of which is the actual rule.

Lowest severity of the four: it misdescribes rather than misleads about money.
It is listed because the three accounts are inconsistent with each other, which
is what makes the section hard to fix one line at a time.

---

## 3. Proposed corrections — written, not applied

Each is the smallest edit that makes the sentence true without inventing a
product rule. Wording that changes a **public commitment or a disclosure
posture** is a founder call, so none of this is in the code.

| Row | Where | Now | Proposed |
|---|---|---|---|
| D223 | `shoppers/page.tsx:143` | "Deals other shoppers have actually redeemed, pushed to the top." | "Deals the shop has boosted to the top of the feed for a day." |
| D223 | `page.tsx:247` | "Neighbourhood favourites, pushed to the top." | "Deals a shop paid to put at the top of the feed for 24 hours." |
| D223 | `feed/page.tsx:256` (in-app subtitle) | "Boosted deals near you" | "Boosted by the shop" |
| D224 | `page.tsx:224` heading | "Ranked by who actually walked in." | "Deals near me is ranked by who actually walked in." |
| D224 | `page.tsx:227-230` body | "A deal rises because shoppers claimed it…" | "In *Deals near me*, a deal rises because shoppers claimed it and staff verified the code at a counter. *Top picks* is ordered by what expires soonest, and *Neighbourhood favourites* by what a shop has boosted. Nothing anywhere is ranked by stars or reviews." |
| D224 | `shoppers/page.tsx:160-163` | same claim, raised card | same qualification, shopper voice |
| D225 | `page.tsx:245`, `shoppers/page.tsx:139` | "often under an hour" | "as short as an hour" |
| D226 | `page.tsx:168` | "Deals sorted by what is nearest and what ends soonest." | "Open the feed for your mall. Three rails: what ends soonest, what shops have boosted, and what other shoppers have redeemed." |

Two constraints any wording must respect:

1. **The rail titles are frozen** — founder ruling R2, decisions log 2026-08-09,
   guarded by `maanta-app/src/lib/__tests__/rail-names.test.ts` in both
   directions. "Top picks near you", "Neighbourhood favourites" and "Deals near
   me" are the names everywhere a rail is named to a user. Every proposal above
   changes the *description beside* a rail, never the rail's name. Renaming
   "Neighbourhood favourites" to something that discloses payment would be a new
   ruling superseding R2, and is the alternative worth considering if the
   founder judges the description insufficient.
2. **The orders are frozen** — D1, guarded by `locked-feed-order.test.ts`. The
   fix is to describe rail 2 truthfully, never to re-order it.

If any of this is approved, the change is one commit plus a guard extending
`held-claims.test.ts` with the unqualified ranking claim, so it cannot return.

---

## 4. The external review's seven priorities, scored

| # | Recommendation | Verdict | Evidence |
|---|---|---|---|
| 1 | Make launch status unmistakable | **ALREADY SHIPPED** | Every trading claim resolves through `src/lib/marketing/live-claims.ts`, gated on `DEMO_MODE`; the footer of every marketing page carries `PrelaunchNotice` — "Pre-launch demonstration. MAANTA is not yet trading." The reviewer read the site and did not register it, which is worth knowing, but the disclosure exists and its placement is a deliberate, documented trade-off (risk R1) |
| 2 | Label example deal cards | **ALREADY SHIPPED** | `src/components/marketing/HeroShot.tsx` carries a visible "Illustration · example shops and prices" caption plus a screen-reader sentence; guarded by `marketing-hero-shot.test.ts`, tracked as D50 |
| 3 | Add "what a redemption looks like" for merchants | **ALREADY SHIPPED** | `src/components/marketing/MerchantWalkthrough.tsx` and `ShopperWalkthrough.tsx` draw exactly that, both ends of the loop |
| 4 | Tighten Flash / Boosted wording | **CONFIRMED, and understated** | This is D223 and D225. Not a clarity gap — a disclosure defect |
| 5 | Reduce ranking ambiguity | **CONFIRMED** | D224 and D226. But the reviewer's proposed line ("verified in-store redemptions, alongside distance and time remaining") is itself untrue — distance is not a ranking input on the feed at all. Do not adopt it |
| 6 | Outcome-oriented merchant CTA ("Publish your first deal in 2 minutes") | **FOUNDER CALL, and one variant is unshippable** | "Get your first 10 redemptions covered" restates the KES 300 opening credit as a headline promise, and that offer is cohort-capped at 100 shops and expires 2026-10-31 (`FACTS.OFFERS.openingCredit`). A CTA is the wrong place for a gated offer — it will outlive the gate |
| 7 | Give the KES 300 credit a visual | **PARTLY SHIPPED** | It renders in the merchant band at `page.tsx:305-309`, correctly gated by `isOfferLive` so it disappears rather than going stale. Promoting it to a card is presentation, frozen under Node 0 |

---

## 5. The seven copy tests, scored

| Current | Proposed variant | Verdict |
|---|---|---|
| "Every deal in your mall, live on your phone." | "See live deals at BBS Mall before you reach the shop." | **REJECT.** "live deals at BBS Mall" is a present-tense trading claim at a named mall — the exact claim `live-claims.ts` exists to hold while `DEMO_MODE` is on, and the one D87 removed from twenty-one places |
| "Claim a deal on your phone…" | "Claim in seconds. Show your code. Pay normally at the till." | **SAFE** — a rhythm change, no new claim. Frozen-copy only |
| "KES 30 per verified redemption" | "Only pay KES 30 when a shopper actually redeems at your counter." | **SAFE and accurate** — matches `verify_redemption`. Note the fee is debited at merchant verification, or recorded as arrears if the wallet cannot cover it, so "only pay when" is true of the charge trigger, not of collectability |
| "Publish a deal in two minutes." | "Create a deal, preview what shoppers see, and go live in minutes." | **SAFE**, and slightly truer: the new-deal wizard is a multi-step flow with a review screen (`merchant/(app)/deals/new/new-deal-wizard.tsx`), so "preview what shoppers see" describes something that exists |
| "Ranked by who actually walked in." | "Deals rise when shoppers redeem them in-store—not because they bought ads." | **REJECT — this makes D224 worse.** A boost *is* bought placement. Adopting this sentence would turn an over-broad claim into a directly false denial |

The two remaining variants in the source review are covered by rows 2 and 4
above.

---

## 6. App-side recommendations against the frozen UI rules

The review's shopper and merchant mockups are mostly a description of what
already ships. Two of its specifics would break frozen rules if implemented
literally:

- **YOU PAY inside the code card.** The mock places `YOU PAY: KES …` directly
  above the six digits. Frozen UI rule 6 is that the 6-digit code is the only
  bare numeral and **no price appears inside the code card**
  (`src/components/ui/overlays.tsx:190-227`, `CodeDisplay`). Rule 7 already
  requires YOU PAY to be identical on tile, detail and claimed code — it belongs
  on the screen, outside the card. Current behaviour is correct; the mock is not.
- **"Valid until 16:40 today."** The ticket renders a live `CountdownChip`
  sharing one clock with the row's state, deliberately, after D213: a static
  timestamp beside a ticking state is how a row came to read ACTIVE next to
  Expired (`src/components/shopper/ticket-row.tsx`). Do not replace the
  countdown with a fixed time.

One observation from the review does survive: the `/my-deals` **row** shows
merchant, deal title, code, countdown and state, but no YOU PAY
(`ticket-row.tsx:86-99`). That is a list row rather than the claimed-code screen,
so rule 7 is not violated, and adding money to a list row is a design change
under freeze. Recorded here, not opened as drift.

The merchant dashboard already answers five of the review's six questions —
claims, verified visits, claim-to-verified, success fees, deal slots as
`occupied/limit`, wallet balance, and a lifecycle chip
(`merchant/(app)/dashboard/page.tsx:92-170`). The sixth, "the one next action",
is the only real gap: Quick actions offers three co-equal buttons. Design change,
frozen, not opened.

---

## 7. What this session did, and what needs a ruling

**Changed:** this document, four drift rows (D223–D226), one documentation
register entry. **No `maanta-app/` source was touched.**

**Founder decisions, in priority order:**

1. **D223 — do shoppers get told a boosted deal was paid for?** Options: (a)
   correct the descriptions beside the rail, as drafted in section 3; (b) that,
   plus an in-app per-card marker on boosted deals; (c) a new ruling superseding
   R2 that renames the rail; (d) accept as-is and record it as a deferred row
   with a trigger. This is the one item worth deciding before Merchant 01's deal
   is boosted by anyone.
2. **D224 — qualify the ranking claim** on `/` and `/shoppers`, or defend it.
3. **D225 — "often under an hour"** is factually unreachable; the correction is
   mechanical once approved.
4. **D226 — the Discover step**; lowest stakes, cheapest to fix alongside D224.

Nothing here is a launch blocker and nothing here is field evidence. It is a
claims-accuracy backlog, and the reason to clear it before the ladder runs is
that the ranking paragraph is what a merchant is told when they ask why anyone
would see their deal.
