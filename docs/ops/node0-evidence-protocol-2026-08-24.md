# Node 0 evidence protocol — what would count as proof

**Status: draft for founder ruling.** Nothing here is adopted. The pass/fail
lines and the operator rules in §4 and §5 are product/ops decisions, and this
document proposes them rather than setting them.

**Why it exists.** MAANTA has strong evidence that the system works and almost
none that the market does. The Node 0 run is the only thing that changes that,
and a run that is not pre-registered produces anecdotes rather than evidence:
whatever happens gets read as encouraging, and the ambiguous result reads as
"needs more time".

This does not propose building anything. Engineering stays frozen.

---

## 1. What is already covered (do not redo)

Three parts of the strategic case are already operationalised, precisely:

- **The credit wall is already the KES 30 test.** KES 300 opening credit at
  KES 30 per verified redemption is exactly ten. `CLAUDE.md` already states the
  ladder as 1 → 5 → 10 and says: *"Around 10 the KES 300 opening credit is
  spent and the merchant cannot post a new deal — expected, and what they say
  about it is the measurement."* The instrument exists and the arithmetic lines
  up. What is missing is only what counts as a pass (§4).
- **Anti-coaching discipline exists for the D158 test.** Its checklist already
  says to *"record what actually happens rather than coaching the merchant into
  matching the documentation"*, and that a browser/doc discrepancy is the
  finding. That principle needs to extend from the onboarding test to the whole
  run.
- **Feature discipline exists.** *"Observations are never converted into
  features without founder approval"* is already the operating rule.

## 2. The two questions are separate, and MAANTA currently measures them together

They fail differently and the remedies share nothing:

| | Question | Fails when | Remedy if it fails |
|---|---|---|---|
| **Q1** | Do merchants find MAANTA-attributed customers worth KES 30? | Merchant shrugs at the wall | Pricing, packaging, or the value story |
| **Q2** | Do shoppers open MAANTA before deciding where to shop? | Nobody claims unprompted | Density, distribution, or the whole premise |

One ladder measuring both at once yields an ambiguous result. Q1 can pass with
pushed shoppers; Q2 cannot be tested at all while every shopper is recruited.

## 3. The number that decides most of this, and it is already free

The chain has six links, but only one requires a human being to physically move:
**claim → walk-in.** It is also the one that no merchant economics can rescue.

It is already computable, per merchant, per deal, per day, with zero new
engineering. `public.redemptions` carries a row per claim with
`status ∈ (pending, success, expired, failed, rejected)`:

```
claim → walk-in conversion  =  count(status = 'success') / count(all claims)
```

`expired` is literally "claimed and never came".

This is a **leading indicator of the wall test**. It resolves after Merchant
01's first handful of claims, well before the KES 30 question arrives. If it is
high, pricing is a detail. If it is very low, the wall test is moot — the
merchant will not reach ten redemptions to be tested by.

Nothing needs to be built to read it. It should be read at every rung.

## 4. Pre-registered lines — proposed, for founder ruling

The point of writing these **before** Merchant 01 is that afterwards every
number has a story attached to it.

### Rung 1 — the mechanism (1 genuine redemption)
- **Pass:** one genuine `success` and a correct KES 30 ledger entry.
- This rung tests the system, not the market. It is already near-proven.

### Rung 2 — the physical step (first ~10 claims)
- **Read:** claim → walk-in conversion.
- **Proposed pass:** a majority of claims become `success` within the ticket
  window.
- **Proposed concern line:** under a third. That is a product problem, not a
  pricing one, and it changes what the rest of the ladder is even asking.

### Rung 3 — the wall (at ~10 redemptions)
The instrument only works if nobody prompts it. Specifically:

- **The operator must not mention the balance, the wall, or topping up.** If the
  merchant is told they have run out, the response measures the operator's
  framing, not the merchant's demand.
- **Pass (strong):** the merchant asks, unprompted, how to keep going or how to
  pay.
- **Pass (weak):** the merchant notices and asks what happened.
- **Fail:** the merchant does not raise it within a week of hitting the wall.
  That is the single most informative negative in the whole run, and it is only
  legible if nobody spoke first.

### A kill criterion — currently undefined, and the important gap
Success is described in the operating docs. Failure is not. Without a written
negative, every ambiguous outcome reads as "needs more time", which is how a
year disappears inside Node 0.

**Proposed, for founder ruling:** if after Merchant 01 plus two further genuine
merchants there is no unprompted repost, no unprompted payment question, and no
shopper who claims without being messaged, the conclusion is not "run it
longer". It is that the pull hypothesis is unsupported at this density, and the
next decision is about density or premise — not another merchant.

Whatever the founder sets, it should be written down before the run and not
adjusted during it.

## 5. Proposed additions to the operator's "Things you never do"

`docs/ops/field-operator-day-sheet.md` has a "Things you never do" list. Every
entry protects **money or integrity** — never approve a shop, never edit a
balance, never promise an unconfirmed rail. **Nothing on it protects the
evidence.**

An operator can, entirely within the current sheet, message shoppers to go
claim, remind a merchant to repost, or offer a top-up at the wall. Each is
helpful, each is the natural instinct of someone who wants the pilot to
succeed, and each destroys precisely the signal that matters most.

Proposed additions, for founder ruling:

- **Never ask a shopper to claim a deal.** Hand them the app; let them decide.
  A claim you asked for measures you.
- **Never remind a merchant to post again.** A repost you prompted is not a
  repost.
- **Never raise the balance, the wall, or topping up.** Wait to be asked.
- **Never talk a merchant out of a complaint.** Write it down in their words.
- **Always record whether an action was prompted** (§6).

Push is the correct mode for *onboarding* — someone must show Merchant 01 what
the product is. It is the wrong mode for everything measured afterwards.

## 6. The one measurement that cannot be recovered later

This is the single exception to "build nothing", and it is not code.

App-side analytics currently captures `deal_claim_started` and
`deal_boost_purchased`. **No field anywhere records whether an action was
operator-prompted.** So push and pull are indistinguishable in the data, today
and permanently: in three months nobody will be able to reconstruct whether an
August claim was organic.

Every other decision here is reversible. This one is not — an unrecorded
provenance is gone.

**The cheap fix is paper, not schema.** A two-column line in the day sheet's
close-of-day notes:

| Event (claim / redemption / repost / payment question) | Prompted by us? Y/N |
|---|---|

That is sufficient to separate Q1 from Q2 afterwards, costs one line per event,
and needs no migration, no deploy and no engineering time. If the run produces
anything worth analysing, this is what makes it analysable.

## 7. The first cohort cannot answer Q2, by construction

The founder-set sequence is Merchant 01 → Staff 01 → Deal 01 → **Shopper 01**,
where Shopper 01 is recruited. Every participant in the first cohort is pushed
**by design** — correctly, because the first cohort is testing the mechanism.

The consequence is worth stating plainly: **no amount of success in cohort one
is evidence for Q2.** Ten claims and ten redemptions from recruited shoppers
proves the loop works and says nothing about demand.

Q2 needs a distinct, later phase, with its own rule: a deal goes live, nobody is
messaged, and the question is whether anything happens at all. That phase is not
currently named in the plan. Naming it is what prevents the false positive.

## 8. What this document is not

It is not a request to build. It is not a metrics dashboard. It does not propose
incrementality measurement — that stays out until a merchant asks for it, which
is the right call and is already the operating position.

It proposes only that the lines be drawn before the run, on the grounds that a
line drawn afterwards is not a line.

---

**Open for founder ruling:** the pass/fail lines in §4, the kill criterion in
§4, the operator rules in §5, the prompted/organic record in §6, and whether the
Q2 phase in §7 is scheduled now or deferred.
