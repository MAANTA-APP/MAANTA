# MAANTA — legal and compliance gap checklist

# DRAFT — REQUIRES QUALIFIED LEGAL REVIEW BEFORE RELIANCE OR PUBLICATION

**Status:** DRAFT. Compiled 2026-09-01 by a non-lawyer from the repository, the
live product and production configuration. **Nothing here is legal advice, and
no statutory conclusion in it should be relied on.** It is a list of things a
qualified Kenyan (and, where noted, Norwegian/EU) adviser should look at, with
the factual position stated as precisely as possible so counsel spends their
time on judgement rather than discovery.

**Audience:** founder, and counsel when engaged.
**Companion:** `docs/legal/COUNSEL-REVIEW-NOTE.md` (2026-07-31) — the original
note to counsel. This checklist extends it with what has shipped since.

**Do not publish this document externally.** It is an internal work list.

---

## 1. What exists today

| Document | Where | Status |
|---|---|---|
| Terms of Service (shoppers) | `docs/legal/terms-of-service.md` → `/terms` | DRAFT, drafted 2026-07-31, never lawyer-reviewed |
| Privacy Policy | `docs/legal/privacy-policy.md` → `/privacy` | DRAFT, 2026-07-31, never lawyer-reviewed |
| Merchant Terms | `docs/legal/merchant-terms.md` → `/merchant-terms` | DRAFT, 2026-07-31, never lawyer-reviewed |
| Cookie & Tracking Notice | `docs/legal/cookie-notice.md` → `/cookies` | DRAFT, 2026-07-31, never lawyer-reviewed |
| Note for counsel | `docs/legal/COUNSEL-REVIEW-NOTE.md` | 2026-07-31 |

All four render publicly behind a visible **"DRAFT — NO LEGAL STANDING"** banner
on `noindex` pages. `maanta-app/legal/` holds older policy drafts, superseded by
the set above.

Readiness gate **O5** (lawyer review) is `🔴 blocked` on incorporation
decisions. Counsel's own recommended reading order is **Merchant Terms first** —
it governs money movement and is the document where a mistake costs the most.

---

## 2. The material gap: four capabilities shipped after the drafts were written

The legal set was drafted **2026-07-31**. The following shipped after that date
and **appears nowhere in any of the four documents**. Verified 2026-09-01 by
keyword scan across all four: `geolocation` 0 hits, `coordinates` 0, `points` 0,
`reward` 0, `QR` 0, `check-in` 0.

### 2.1 Arrival check-in — a new category of personal data

`redemptions.arrived_at` and `redemptions.fast_visit_qualified_at` were added
2026-08-26. When a shopper scans a shop's QR, MAANTA records **that this person
was at this named shop at this time**.

- **Factually narrow, and worth stating precisely:** the schema stores
  **timestamps only**. No GPS coordinates, no device location, no movement
  trail. The merchant is identified by the token on the sticker, not by
  positioning the shopper.
- It is nonetheless **presence data about an identified individual**, which the
  privacy policy does not mention, does not give a lawful basis for, and does not
  place in a retention schedule.

**For counsel:** lawful basis, notice, retention period, and whether presence
data merits any distinct treatment under the Data Protection Act, 2019 (Kenya)
and the 2021 General Regulations.

### 2.2 Disclosure of shopper identity to merchant staff

The counter queue (`merchant_presentations`, 2026-08-26) shows shop staff a
checked-in shopper's **first name and last initial**, the deal, the arrival time
and the claim code.

- **Minimisation is implemented in code** (`staffFacingName`): full name, phone,
  email, GPS and history never leave the server.
- The disclosure itself — MAANTA telling a third-party merchant that a named
  individual is in their shop — is **not described in the privacy policy**.

**For counsel:** the disclosure notice, and whether the merchant is a separate
controller, a joint controller or a processor for this data. That
characterisation drives what the Merchant Terms must contain.

### 2.3 MAANTA Points — a promotional balance with no terms

`reward_events` and a points balance shipped 2026-08-26. **The feature is
currently switched off** (`fast_visit_enabled = false`, verified on production
2026-09-01) and **zero reward events exist**. So there is no live exposure today
— but there are also no terms, and none can be written after the fact.

The product's own frozen position, which counsel should be asked to ratify in
drafting rather than invent: Points are **promotional loyalty rewards** — no cash
value, no KES conversion, not withdrawable, not transferable, not purchasable,
never rendered as currency.

**For counsel:** promotional-loyalty terms — expiry, forfeiture, amendment and
withdrawal rights, what happens on account closure — and, importantly, **whether
a points balance could be construed as stored value, e-money or a payment
instrument under Kenyan law**. That question should be answered **before** the
gate is switched on, not after.

> **Recommendation:** do not flip `fast_visit_enabled` to `true` until Points
> terms exist. This is a documentation recommendation, not a ruling — the switch
> is the founder's.

### 2.4 Merchant location capture

`onboard_merchant` now takes `p_lat`/`p_lng` from browser geolocation, captured
by the shop owner at their own entrance (D162, live 2026-08-24). what3words is
derived server-side afterwards, best-effort.

This is business-premises data supplied deliberately by the merchant, not
covert tracking — but the **Merchant Terms do not mention it**: not what is
collected, not that it is published to shoppers, not that a third-party service
(what3words) is called.

**For counsel:** merchant notice and consent, publication rights, and the
third-party processor disclosure.

---

## 3. Promises the documents make that the product does not keep

These are **live public statements**, not drafts. Each is an open drift row.

| Statement | Where | Reality | Row |
|---|---|---|---|
| "Erasure — within 14 days", plus a retention table | `/privacy` | No deletion or anonymisation machinery exists; no retention job implements the table | **D144** |
| "Data protection registration with the ODPC is in progress" | **every page** (`REGULATORY_STATUS`) | Nobody owns the truth of that sentence; no evidence recorded either way | **D146** |
| "Supabase managed backups on" (+ a restore-drill cadence) | `docs/maanta-staged-readiness-now-launch-10k-100k.md` | Never verified; no restore has ever been performed | **D145** |
| "One claim per phone per day" as a frozen product rule | operating docs | **Implemented at no layer** | **D136** |

**D146 is the sharpest of these**, because it is a statement about a regulator
published on every page of a public website. Establishing the true position and
recording it with evidence is gate **O9** — founder-owned, and cheap to close
relative to its exposure.

Readiness gates already carry the rest: **O7** (the privacy operational package
the documents promise), **O8** (backup and restore), **O6** (Kenya DPA
cross-border basis for Supabase `eu-west-1`).

---

## 4. Consent and role-change

**D170**, open: a merchant can enroll any shopper as staff knowing only their
email address, and the shopper's role changes without their consent. The person
becomes an authorised verifier of that merchant's redemptions.

**For counsel:** whether an authorised-user role change requires the individual's
acceptance, and what terms (if any) that person is bound by. There is currently
no staff-facing terms document at all — the counter card is operational guidance,
explicitly not a contract.

---

## 5. Cross-border and corporate

Unchanged since 2026-07-31 and still open:

- **Kenya DPA cross-border basis.** Supabase is hosted in `eu-west-1`. Adequacy,
  contractual safeguards, or region migration — gate **O6**.
- **Norway/Kenya corporate structure**: which entity contracts with merchants,
  which is the data controller, and where the success fee is invoiced from. This
  is blocked on incorporation decisions (the November Nairobi trip) and drives
  the party names in all four documents.
- **Processor inventory.** At minimum: Supabase, Vercel, Clerk, Stripe,
  IntaSend, Resend, Sentry, PostHog (EU cloud), what3words. Each needs a
  recorded basis and a DPA. Part of gate **O7**.

---

## 6. Commercial language to have counsel confirm

The product's frozen commercial rules, stated as the drafting brief:

- **KES 30 success fee** per verified redemption, all plans, debited at merchant
  verification, or recorded as **arrears** if the wallet cannot cover it. Must
  **not** be described as a commission, a transaction cut, a listing fee or a
  share of the sale. The shopper pays the merchant directly and in full; MAANTA
  never holds shopper money.
- **Prepaid wallet and opening credit.** KES 300 Node 0 promotional credit,
  granted at activation. Merchant Terms §7.8 already covers the credit — confirm
  it also covers arrears, and what happens to unspent credit on termination.
- **Fee reversal on an upheld dispute**, resolved within **72 hours**: the
  redemption is reversed and KES 30 credited back. Rejected: the fee stands.
- **Elite subscription has no published price** and none is authorized (founder
  ruling 2026-08-24). Surfaces read *"Pricing coming soon."* Any draft carrying
  KES 3,500 is superseded.
- **Zero-balance gate:** an empty wallet blocks **new deals**, never a
  verification.
- **Verify-anyway:** the shopper's redemption completes even when the fee outcome
  is uncertain; the dispute is resolved afterwards, auditably.

---

## 7. Documents that do not exist and probably should

| Document | Why | Priority |
|---|---|---|
| **MAANTA Points terms** | §2.3 — required before the gate is switched on | Before `fast_visit_enabled = true` |
| **Merchant staff / authorised-user terms** | §4 — nothing binds the person who verifies redemptions | Before scaled staff enrolment |
| **Photography / content release (Merchant 01)** | Any photo, quote or case study from the pilot needs written permission **taken at the time**. Retroactive consent is often unobtainable | **Before the Merchant 01 visit** |
| **Marketing consent record** | Separate from the product's `segment_type`; direct-marketing consent needs its own basis and audit trail | Before any campaign |
| **Data-processing inventory / RoPA** | §5; the backbone of gate O7 | Public launch |
| **Breach and incident notification procedure** | Promised in substance by the privacy policy; does not exist | Public launch |
| **DSR (access / export / erasure) procedure** | D144 — the machinery `/privacy` already promises | Public launch |

**The photography/content release is the only one on this list with a Merchant
01 deadline.** It is cheap, it is a one-page form, and it cannot be obtained
later. If nothing else on this checklist is actioned before the pilot, action
that one.

---

## 8. What this checklist deliberately does not do

- It does not state what Kenyan law requires. Every "for counsel" line above is a
  question, not an answer.
- It does not amend any live document. Changing published legal text is a
  founder-and-counsel action.
- It does not treat the pilot as blocked. Gates **O6–O9** are all marked as
  **not** gating the controlled pilot; they gate **public/commercial launch**.
  The controlled Node 0 run proceeds on the founder's 2026-08-23 GO ruling.
