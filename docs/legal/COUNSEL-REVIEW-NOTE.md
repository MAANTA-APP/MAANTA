# MAANTA — note for counsel

**Date:** 2026-07-31
**From:** the marketing-site build
**Status of everything referenced here:** unreviewed draft, published only behind
a visible "DRAFT — NO LEGAL STANDING" banner on `noindex` pages of a pre-launch
site. Nothing has been relied on by anyone.

> **These are proposals, not advice.** Every clause named below was drafted by an
> engineer to give counsel something to edit rather than a blank page. They are
> commercially plausible and internally consistent; they are not a legal opinion,
> and none has been checked against Kenyan law.

---

## Review Merchant Terms first

**`docs/legal/merchant-terms.md` governs money movement** — a success fee, a
prepaid balance, fee reversals, and a subscription. It is the document where a
mistake costs the most, and it is the one most nearly complete. Review it before
the other three.

The other three, in descending order of exposure: Privacy Policy, Terms of
Service, Cookie & Tracking Notice.

---

## The one question that changes the answer to several others

**Does the merchant balance require CBK payment-services or e-money
authorisation?**

MAANTA's position is that it does not: the balance is closed-loop prepaid credit,
spendable only on MAANTA's own fees, non-transferable, and carrying no interest
(Merchant Terms 7.5). If that is right, no licence is needed and the site says so
plainly. If it is wrong, clauses 7.5–7.7 and the public claim that unspent credit
is refundable all have to change together.

**A founder ruling on 2026-07-31 made unspent top-up credit refundable on
request** (7.6), and the marketing site now says so. That decision was taken with
the CBK question still open, and refundability is one of the features that can
push a closed-loop balance toward being treated as e-money. It is the first thing
to check.

No CBK licence identifier appears anywhere on the site, real or placeholder — a
deliberate decision, since advertising an authorisation MAANTA may never need
creates exposure for no benefit.

---

## Clauses drafted as proposals — please replace or confirm

### Merchant Terms

| Clause | Proposed | Note |
|---|---|---|
| 4.4 Prohibited categories | An explicit list — medicines, tobacco/vaping, unlicensed alcohol, weapons, live animals, counterfeit goods, adult services, gambling, financial services | Informed by what BBS tenants plausibly sell. Needs checking against Kenyan licensing regimes. |
| 7.6 Refunds | Unspent **top-up** credit refundable on request, less fees incurred and arrears. Promotional credit excluded | Founder ruling. See the CBK question above. |
| 7.7 Credit expiry | Top-up credit does not expire while the account is open | Follows from 7.6. |
| 7.9 Taxes | Fees stated **exclusive** of VAT | Confirm against Kenyan VAT treatment of platform fees. |
| 8.1 Dispute window | **14 days** | Commercially conventional; not derived from statute. |
| 8.4 Loss allocation | MAANTA reverses the fee where the merchant is clearly right, including where the shopper already redeemed; inconclusive cases resolve in the merchant's favour | **This one describes implemented behaviour**, not an aspiration — see migration `20260722120000_admin_fee_reversal_wallet_credit.sql` and the 2026-07-22 decisions-log entry. Please keep the drafting aligned to it. |
| 9.5 Elite renewal | Monthly, auto-renews, cancel any time effective at period end, no pro-rata refund | Confirm auto-renewal disclosure is adequate under the Consumer Protection Act 2012 if any merchant is a natural person. |
| 9.6 / 15.1 Notice periods | **30 days** for fee changes and material terms changes | Conventional. |
| 13.3 Liability cap | Fees paid in the **preceding 3 months**, with the usual carve-outs | The usual approach for a fee-based platform; confirm enforceability in Kenya. |
| 14.4 Controller relationship | **Independent controllers** for redemption records | The alternative readings are joint controllers or controller/processor, and the choice determines whether a data-sharing agreement is needed. |
| 16.3 Dispute resolution | Good-faith negotiation, then exclusive jurisdiction of the Kenyan courts | Arbitration was not proposed; say if it should be. |

### Terms of Service (shoppers)

| Clause | Proposed | Note |
|---|---|---|
| 6.3 Enforcement | Warn → suspend publishing → remove, with claimed codes staying valid through a suspension | Founder ruling 2026-07-31. The marketing site now publishes the matching claim, so the clause and the claim must move together. |
| 11.3 Liability cap | **KES 10,000** in any 12 months, with carve-outs, and expressly without affecting the shopper's rights against the shop | Shoppers pay MAANTA nothing, so a fees-based cap does not work. The number is arbitrary — please set it. |

### Privacy Policy

| Item | Proposed | Note |
|---|---|---|
| Shopper data retention | Life of account; deleted or anonymised within 6 months of closure or 24 months of inactivity | Not derived from statute. |
| Redemption retention | **7 years** | Treated as a financial record, since it evidences a fee charged. Confirm against Kenyan tax and accounting requirements. |
| Analytics retention | 24 months, then deleted or aggregated | |
| Contact-enquiry retention | 24 months after last reply | |
| Cross-border transfer basis | Appropriate safeguards under **section 48**, via contractual data-protection terms with each processor | **Please note a correction:** an earlier planning document stated production was US-hosted. It is not. Production Postgres is **Supabase `eu-west-1` (Ireland)** and analytics is EU. The real cross-border exposure is the **US email provider (Resend)**, and possibly Clerk. |
| ODPC registration | Stated as "in progress" in the regulatory-status block | If registration will not be pursued before launch, that wording needs to change. |

### Cookie & Tracking Notice

The **consent architecture is now built**, so this document describes something
real rather than an intention:

- Anonymous visitors — analytics runs **cookieless**, in memory only, discarded
  when the tab closes. Nothing is stored on the device, so there is no analytics
  cookie to consent to or withdraw.
- Signed-in users — analytics is tied to the account, disclosed, with an opt-out
  by writing to `admin@maanta.app`.
- Clerk session cookies — strictly necessary, contract performance.
- Sentry — legitimate interest, configured for error reporting rather than
  profiling.

Please confirm this split is defensible under the Act and the ODPC consent
guidelines. It was chosen over a consent banner because storing nothing on an
anonymous visitor's device removes the hardest part of the question rather than
answering it with a click-through.

---

## Still genuinely blank

Two values, both engineering rather than legal, both rendering as a visible
"to be confirmed" marker on the page rather than as a fabricated value:

| Token | Document | Why it is still open |
|---|---|---|
| `{{AUTH_COOKIE_LIFETIME}}` | Cookie Notice | Clerk's session lifetime is configured in the Clerk dashboard, not in this repo. |
| `{{CLERK_REGION}}` / `{{SENTRY_REGION}}` | Privacy Policy | Neither region is determinable from the repository, and both were left blank rather than assumed. |

---

## Where the documents live

Editable markdown, one file per document, no code:

- `maanta-app/src/content/legal/merchant-terms.md`
- `maanta-app/src/content/legal/privacy-policy.md`
- `maanta-app/src/content/legal/terms-of-service.md`
- `maanta-app/src/content/legal/cookie-notice.md`

Edits to those files are the published pages. The originals in `docs/legal/` are
the untouched drafting versions, including the counsel notes and open-question
sections that were deliberately not published.
