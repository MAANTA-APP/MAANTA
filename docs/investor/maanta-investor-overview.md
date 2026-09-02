# MAANTA — investor overview and data-room checklist

**Status:** DRAFT — written 2026-09-01, awaiting founder review. Sections marked
**RESEARCH REQUIRED** are deliberately empty: they need work MAANTA has not done,
and filling them with plausible-sounding numbers would be the single most
damaging thing this document could do.
**Classification:** CONFIDENTIAL.
**Companion:** `docs/stakeholder/maanta-stakeholder-report.md` is the fuller
narrative. This document is the investor-facing structure and the diligence
checklist. `docs/notion-refresh/investor-readiness.md` (2026-07-28) is the
earlier diligence-posture note and remains valid on posture; this supersedes its
status figures.

**Standing rule: prefer under-claiming.** Every packet must carry the current
external-validation position (§4) without softening it.

---

## 1. One paragraph

MAANTA connects digital discovery to attributable physical retail visits. A
merchant publishes a deal; a shopper claims it on their phone and receives a
6-digit code; the shopper physically travels to the shop; staff verify the code
at the counter. That verification is the attribution event. The merchant pays
**KES 30** per verified redemption from a prepaid wallet. The shopper pays the
merchant directly, in person — MAANTA is never in the money flow.

---

## 2. Problem

- **Merchants** cannot tie promotional spend to a person who actually walked in.
  In-mall promotion is unattributable, so it is under-invested and
  under-measured.
- **Shoppers** cannot find reliable, live, honoured offers in a mall.

Both are stated as **hypotheses**. Neither has been validated with independent
participants.

---

## 3. Product and the attribution loop

Built and live in production:

merchant self-onboards (real coordinates, captured at their entrance) → admin
approves → merchant publishes → shopper discovers and claims → 6-digit code →
shopper physically arrives → *(optional)* QR check-in records arrival → shopper
presents the code → authorised staff verify → redemption recorded → success fee
accounted.

Two design decisions worth an investor's attention:

- **Money invariants are enforced in the database**, not the application layer:
  atomic verify-and-debit, one-winner protection against double verification,
  idempotent ledger entries, arrears when a wallet cannot cover a fee, and
  admin-gated fee reversal on an upheld dispute.
- **The shopper's experience is protected unconditionally.** If the fee outcome
  is uncertain, the redemption still completes and the billing question is
  resolved afterwards, auditably. A shopper is never made to wait at a counter
  over a merchant's balance.

**The QR never redeems, and the queue is not redemption state.** The 6-digit
code presented to staff is the canonical mechanism and staff verification is
authoritative. This is a deliberate integrity boundary, not an implementation
detail: nothing that a shopper can trigger alone can complete a redemption.

---

## 4. Traction and evidence status — read this before any other number

**External field validation: ZERO.**

- **0** genuine external merchants.
- **0** genuine external redemptions.

Production also contains, and these are **not** traction:

- **2** non-demo merchant records, both **internal** — a founder registration
  exercise and an end-to-end test shop.
- **1** non-demo successful redemption, **internal** — produced by MAANTA's own
  end-to-end sweep on 2026-08-23. It proves the money path works.
- **213** synthetic merchant rows and a synthetic marketplace, present
  deliberately so a prospective merchant is not shown an empty product.

MAANTA maintains **two counters and never one**, and the internal figures are
kept rather than deleted precisely so they cannot be quietly conflated with
market evidence.

**What may be claimed:** the mechanism is built and has been exercised end to
end in production. **What may not:** any merchant count, redemption volume, GMV,
conversion rate, footfall uplift, savings figure, testimonial or partnership.

---

## 5. Business model and unit economics — framework only

**Framework, not results.** No figure below has been validated in the field.

- Revenue per attributed visit: **KES 30**, all plans.
- Acquisition today: field operators onboarding merchants in person at one mall.
- Node 0 promotional cost: **KES 300** opening credit per merchant — ten free
  redemptions, and the instrument that tests willingness to pay.
- Elite subscription exists with **no published price**, deliberately, so the
  market is not anchored during validation.

**RESEARCH REQUIRED**, and honestly absent today:

- Merchant acquisition cost, and how it changes without a field operator present.
- Merchant retention and repost rate.
- Redemptions per merchant per month at steady state.
- Shopper acquisition cost and repeat-claim rate.
- Contribution margin per merchant, and payback.
- Whether KES 30 is the right price at all.

**Do not model these.** A model built on an untested price and an unmeasured
volume is a spreadsheet, not evidence, and any investor competent enough to fund
this will identify it as such.

---

## 6. Market

**RESEARCH REQUIRED.** MAANTA has **not** done TAM/SAM/SOM work, and none should
be constructed to fill this section. What can be said honestly:

- BBS Mall, Eastleigh, Nairobi is Node 0 — chosen for density and for being
  operable by a small field team.
- The unit of expansion is a **node** (a mall), not a city.
- Whether the model generalises beyond one mall is **unknown**, and the current
  phase is not designed to answer it.

---

## 7. Strategy — why one mall, and why so slowly

The premise being tested is not "can this be built" — it is built and it works.
It is **"does anyone want it."**

Node 0 runs one genuine independent merchant first, then two more. Deliberately
narrow, because a wide rollout on an untested premise multiplies a defect
instead of testing it.

The design is **pre-registered**: pass and stop lines were written before the
run, and cannot be adjusted during it.

- **Claim → walk-in** is read at every rung. Below roughly one in three, the
  ladder stops for diagnosis before another merchant is added.
- **The credit wall** at ~10 redemptions tests willingness to pay, and only works
  if nobody on the team mentions it first.
- **The kill criterion**, whichever comes first: Merchant 01 plus two further
  merchants, or eight weeks — with no unprompted repost, payment question or
  claim in that time — makes the pull hypothesis unsupported at this density.
  The next decision is then **density or premise, not another merchant and not
  more time.**

**A written failure criterion, set in advance and not adjustable, is the part of
this that is unusual.** It is what prevents an ambiguous result from being read
as "needs more time".

---

## 8. Risks

| Risk | Severity | Status |
|---|---|---|
| Shoppers do not open MAANTA before deciding where to shop | Existential | Untestable until the pull phase, by construction |
| Claim → walk-in conversion is low | High | Free to measure; unmeasured |
| Merchants do not value attribution at KES 30 | High | The Node 0 test |
| Density insufficient at one mall | High | Routes to a density-or-premise decision |
| Legal and data-protection work unfinished | Medium | Four unreviewed drafts; gates public launch, not the pilot |
| Payment rails not live | Medium | Card sandbox; M-Pesa unconfirmed. Pilot runs on credit |
| No automated browser E2E has ever run in CI | Medium | Database money-path coverage is automated and does run |
| Single-founder concentration | Medium | Product, engineering, ops and decisions in one person |
| Kenya/Norway corporate and cross-border structure undecided | Medium | Blocked on incorporation |

---

## 9. Roadmap

**Now:** Merchant 01 at BBS Mall — a genuine merchant, a genuine deal, a genuine
shopper, a verified redemption, correctly classified.

**Next:** merchants 02 and 03 on the same protocol; the credit wall observed in
silence; the separate shopper-pull phase.

**Then, gated on those results:** a density-or-premise decision, the legal and
compliance package, and live payment rails.

**Explicitly not on the roadmap now:** more malls, a mall-operator dashboard,
scaled acquisition, incrementality measurement, or further product engineering.

---

## 10. Data-room checklist

| Artifact | State 2026-09-01 |
|---|---|
| Company incorporation and cap table | **Pending** — incorporation decisions outstanding |
| Founder agreements / IP assignment | **RESEARCH REQUIRED** |
| Product overview and demo | Available — production app, plus this document set |
| Architecture and security overview | Available in-repo; needs an investor-appropriate summary |
| Money-path design and controls | Available — migrations, SQL test suites, CI evidence |
| Evidence methodology and Node 0 protocol | Available — pre-registered and ratified |
| Traction data | **Zero external, and stated as such.** Internal figures separately labelled |
| Unit economics | **RESEARCH REQUIRED** — framework only |
| Market sizing | **RESEARCH REQUIRED** — none exists |
| Legal: shopper terms, privacy, merchant terms, cookies | **Unreviewed drafts**; gap checklist available |
| Data-protection registration (ODPC) status | **UNKNOWN** — must be established and evidenced |
| Cross-border data basis (EU-region hosting) | **Open** |
| Processor inventory and DPAs | **Not compiled** |
| Backup and verified restore | **Never performed** |
| Insurance | **RESEARCH REQUIRED** |
| Customer/merchant contracts | None — no external merchant exists yet |
| Financial statements and runway | **RESEARCH REQUIRED** |

---

## 11. Rules for anyone using this document

- **Never** present internal test activity as customer traction.
- **Never** present synthetic marketplace data as supply.
- **Never** state a merchant count, redemption volume, GMV, conversion rate,
  footfall uplift, savings figure or testimonial. None exists.
- **Never** publish an Elite subscription price. None is authorized.
- **Never** claim a mall partnership. None is signed.
- **Never** report a failed read as a zero.
- **Always** state that external field validation is zero, in the packet, without
  softening.

Full list: `docs/marketing/marketing-claims-register.md` §2.
