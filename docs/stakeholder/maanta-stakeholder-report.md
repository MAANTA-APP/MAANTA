# MAANTA — stakeholder report

**Status:** DRAFT — written 2026-09-01, awaiting founder review before any
external use.
**Classification:** INTERNAL / CONFIDENTIAL. Share deliberately, not by default.
**Audience:** founder, advisors, prospective investors, prospective mall
partners, and senior collaborators who need to understand MAANTA without being
handed the codebase.
**Evidence rule:** every claim below is labelled. **CURRENT REALITY** means
demonstrably true in the product, repository or production database.
**LOCKED** means an explicitly approved decision. **ASSUMPTION** means not yet
validated. **FUTURE** means not built and not to be represented as current.
**UNKNOWN** means the evidence is insufficient to state a fact.

**What this document deliberately excludes** (and why a public version would
differ): production identifiers, security posture, internal drift IDs, admin
procedures, and the operational detail of how evidence is gathered. Those live in
`docs/ops/` and are not stakeholder material.

---

## 1. What MAANTA is

**CURRENT REALITY.** MAANTA is an in-mall deals platform that connects digital
discovery to **attributable physical retail visits**.

A merchant publishes a deal. A shopper discovers it and claims it on their phone,
receiving a 6-digit code. The shopper physically travels to the shop. Staff at
the counter verify the code. That verification is the attribution event, and it
is what MAANTA charges for.

**The shopper pays the merchant directly, in person, in full.** MAANTA never
holds, routes or touches the transaction.

---

## 2. Who it serves, and the problem for each

| Actor | Problem | LABEL |
|---|---|---|
| **Shopper** | Deals in a mall are undiscoverable, unreliable and often not honoured at the counter | ASSUMPTION — coherent, not yet validated with real shoppers |
| **Merchant** | Digital promotion cannot be tied to a person who actually walked in and bought. Spend is unattributable | ASSUMPTION — the central commercial hypothesis of Node 0 |
| **Mall operator** | No view of what promotion moves footfall inside the mall | ASSUMPTION — and deliberately not being pursued yet |

**These are stated as assumptions on purpose.** MAANTA has strong evidence that
the system works and almost none that the market wants it. Distinguishing those
two is the whole point of the current phase.

---

## 3. The product loop

**CURRENT REALITY — every step below is built and live in production.**

1. Merchant self-onboards, capturing their real shop location by browser
   geolocation at their own entrance.
2. Admin approves the merchant.
3. Merchant publishes a deal from their phone.
4. Shopper discovers and claims it; a 6-digit code is issued.
5. Shopper physically travels to the shop.
6. *(Optional)* Shopper scans the shop's QR to check in; they appear in the
   counter queue. **The QR records arrival and never redeems.**
7. Shopper presents the 6-digit code. **This is the canonical verification
   mechanism.**
8. Authorised staff verify. **Staff verification is authoritative.**
9. The redemption is recorded and the success fee is accounted for.

Steps 1–5 and 7–9 have been exercised end to end in production. Step 6 is live
and **has never been used by a real shopper** — arrivals, queue entries and
reward events all stand at zero.

---

## 4. Business model

**LOCKED.**

- **KES 30 per verified redemption.** All plans. Debited from the merchant's
  prepaid wallet at the moment of verification, or recorded as arrears if the
  wallet cannot cover it.
- It is a **success fee**, not a commission, a listing fee or a share of the
  sale. MAANTA is paid for an attributed visit, not for the transaction.
- No listing fee, no monthly minimum, nothing charged for a code that expires or
  is rejected.
- **Zero-balance gate:** an empty wallet blocks publishing **new deals**. It
  never blocks a verification — the shopper's experience is protected
  unconditionally ("verify-anyway"), and any billing question is resolved
  afterwards, auditably, within a 72-hour dispute SLA.
- **Node 0 opening credit:** KES 300 at activation — exactly ten redemptions
  before a merchant spends their own money.
- **Elite tier exists with no published price** (founder ruling 2026-08-24).
  MAANTA will not anchor the market to a subscription figure during field
  validation. Surfaces read *"Pricing coming soon."*

**Whether KES 30 is the right number is an open commercial hypothesis**, and it
is precisely what Node 0 is designed to test.

---

## 5. Node 0 — the BBS Mall strategy

**LOCKED.** BBS Mall, Nairobi is Node 0 and the sole proving ground until product
market fit. One mall, high density, operable by a small field team.

The sequence is deliberately narrow: **one genuine independent merchant first.**
Merchant 01 → Staff 01 → a genuine deal → Shopper 01 → claim → physical visit →
counter verification → first genuine success → 5 → 10.

**This is not authorization for scaled merchant acquisition**, and the four-agent
acquisition phase has not begun.

At roughly ten redemptions the opening credit is spent and the merchant cannot
publish a new deal. **That wall is the instrument, not a bug** — whether the
merchant asks, unprompted, how to keep going is the clearest available signal of
willingness to pay. Nobody on the team raises it first; doing so would destroy
the measurement permanently.

---

## 6. Current state

### Technical — CURRENT REALITY

- Production is live and serving on Vercel and Supabase. The migration ledger
  reconciles with the repository at **107/107**, verified by direct read-back on
  2026-09-01.
- Money invariants are enforced in the **database**, not the application: atomic
  verify-and-debit, one-winner double-verify protection, idempotent ledger
  entries keyed on provider reference, arrears handling, and admin-gated fee
  reversal.
- CI blocks on lint, typecheck, unit tests, a production build with three
  post-build gates, and a SQL suite run against a real Postgres.
- Fraud checks (velocity, geofence, collusion) raise holds and flags at
  verification time. **They are not a guarantee.**
- **Known limitation:** an automated *browser* end-to-end test exists and has
  **never executed in CI**. Database-level money-path coverage is automated and
  does run; a successful manual browser run has been performed. This becomes a
  hard gate before routine or scaled releases.

### Operational — CURRENT REALITY

- Field documentation exists for every role in the loop: a merchant welcome pack,
  a staff counter card, a shopper card, a field-operator day sheet, a
  Merchant 01 runsheet, and an evidence-classification guide.
- The evidence protocol is pre-registered and ratified, including a written
  failure criterion (§8).
- **Merchant support ownership is not assigned.** Accepted as-is for the
  controlled pilot; it remains an open gate before launch.

### Commercial — CURRENT REALITY

- **External field validation: zero.** No genuine external merchant, and no
  genuine external redemption.
- Production holds two non-demo merchant records and one non-demo successful
  redemption. **All three are internal** — MAANTA's own registration exercise and
  its own end-to-end test. They are kept as honest technical evidence and are
  never counted as market evidence.
- The marketplace visible in the app is **synthetic demonstration data**, on
  deliberately: with no genuine supply, an empty marketplace shows a prospective
  merchant nothing.

---

## 7. Evidence methodology

**LOCKED.** MAANTA maintains **two counters and never one**:

- **Technical / internal evidence** — proof the system works. Currently: one
  successful redemption with a correct fee entry.
- **External field validation** — proof the market responds. Currently: **zero**,
  and it stays at zero until a real merchant serves a real shopper.

Three rules make that separation hold:

1. **Genuine-tagged is not external.** A row can be entirely real and still be
   something MAANTA created while testing itself.
2. **Counts join through the parent records**, never a single flag — a naive
   query over the redemptions table has already produced a wrong number once.
3. **Whether an action was prompted by the team is recorded on paper**, at the
   time. Nothing in the system captures it, and it cannot be reconstructed
   later. A prompted claim measures the operator, not the shopper.

**Failure is never reported as zero.** An unreadable number is reported as
unavailable, because a zero on a failure surface reads as reassurance.

---

## 8. Success and failure criteria

**LOCKED, pre-registered 2026-08-24, and not to be adjusted during the run.**

**Rung 1 — the mechanism.** One genuine redemption with a correct fee entry.
Tests the system, not the market.

**Rung 2 — the physical step.** Claim → walk-in conversion, read at every rung.
A **tripwire, not a target**: below roughly one in three, the ladder stops for
diagnosis before another merchant is added. There is deliberately no pass
percentage — at n≈10 a precise line would be false precision.

**Rung 3 — the wall.** At ~10 redemptions the credit is spent. Strong pass: the
merchant asks, unprompted, how to keep going. Weak pass: they notice and ask.
**Fail: they do not raise it within a week.**

**Kill criterion, whichever comes first.** If Merchant 01 plus two further
genuine merchants have run, **or** eight weeks have passed since Merchant 01
went live — and there has been no unprompted repost, no unprompted payment
question and no unprompted claim — the pull hypothesis is unsupported at this
density. **The next decision is density or premise: not another merchant, and
not more time.**

**A structural limit, stated plainly:** the first cohort **cannot** test shopper
demand. Shopper 01 is recruited, so every participant is pushed by design. No
result from cohort one is evidence of pull. That question gets a separate, named
phase afterwards, run under one rule — a deal goes live, nobody is messaged, and
the question is whether anything happens at all.

---

## 9. Key risks

| Risk | Assessment | LABEL |
|---|---|---|
| **Shoppers do not open MAANTA before deciding where to shop** | The existential one. Untested by construction until the pull phase | ASSUMPTION |
| **Merchants shrug at the KES 30 wall** | Tests pricing and packaging rather than the premise. Recoverable | ASSUMPTION |
| **Claim → walk-in conversion is low** | Would make the pricing question moot. Free to measure from day one | UNKNOWN |
| **Density is insufficient at one mall** | The kill criterion routes explicitly to a density-or-premise decision | UNKNOWN |
| **Legal and data-protection work is unfinished** | Four policy documents are unreviewed drafts, and four capabilities shipped after they were written. Does not gate the controlled pilot; does gate public launch | CURRENT REALITY |
| **Payment rails are not live** | Card top-ups are sandbox; M-Pesa availability must not be assumed. The pilot runs on opening credit | CURRENT REALITY |
| **Single-founder concentration** | Product, engineering, ops and decisions in one person, with AI leverage | CURRENT REALITY |
| **Demo data contaminating evidence** | Has happened once. Controls exist and are documented; the risk is live while demo mode is on | CURRENT REALITY |

---

## 10. Legal and compliance — what remains

**CURRENT REALITY.** All four public legal documents — shopper terms, privacy
policy, merchant terms, cookie notice — are **unreviewed drafts** published
behind a visible draft banner. None is lawyer-reviewed. Review is blocked on
incorporation decisions.

Four capabilities shipped after those drafts were written and appear in none of
them: arrival check-in data, disclosure of shopper identity to merchant staff,
the promotional points balance, and merchant location capture. Detail:
`docs/legal/legal-gap-checklist-2026-09-01.md`.

Also outstanding: the Kenya cross-border data basis for EU-region hosting, the
data-protection registration position, the operational privacy machinery the
published policy already promises, and a verified backup-and-restore posture.

**None of these gates the controlled pilot. All of them gate public launch.**

---

## 11. What is deliberately not being built

Stating these prevents them being read as omissions:

- Additional malls or nodes beyond BBS Mall.
- A mall-operator reporting dashboard.
- Scaled merchant acquisition and the agent acquisition programme.
- Incrementality measurement — held back until a merchant asks for it.
- Consumer payments. MAANTA is deliberately **not** in the money flow between
  shopper and merchant, and there is no plan to be.
- Further UI, design or architecture work. Product design and general engineering
  are **frozen** unless field evidence shows a genuine blocker or defect.

---

## 12. What happens after Merchant 01

1. Classify the result honestly — external, internal, or a documented failure.
2. Read claim → walk-in conversion. If it trips, stop and diagnose before adding
   a merchant.
3. Merchants 02 and 03, on the same protocol.
4. Watch the credit wall in silence.
5. Run the shopper-pull phase as a separate, named exercise.
6. Then, and only then, decide: density, price, packaging, or premise.

**Not** more engineering, and not more time.

---

## 13. The honest summary

MAANTA has built a working, database-enforced attribution loop and has run it end
to end in production. What it has not done is put it in front of a single
independent merchant or shopper.

The company knows exactly what it does not know, has written down in advance what
would count as failure, and has committed to not moving that line after seeing
the numbers.

**Anyone evaluating MAANTA today is evaluating a mechanism that works and a
market hypothesis that is untested.** Any document, deck or conversation that
implies otherwise is wrong, and this report is the reference for correcting it.
