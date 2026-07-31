# MAANTA — Merchant Terms (DRAFT)

**Status:** Draft for legal review. **Not legal advice — I am not a lawyer.**
**Date drafted:** 2026-07-31
**Route:** `/merchant-terms` (does not exist yet)
**Referenced from:** `/merchants/join`, wallet top-up, Elite upgrade

---

> ## ⚠️ DRAFT — NO LEGAL STANDING
>
> This document is an **unreviewed draft**, published as part of a **pre-launch demonstration** of MAANTA. It has **not** been reviewed by a lawyer. It does **not** create any rights or obligations, it is **not** a contract, and it **must not be relied on by anyone**.
>
> MAANTA APP is not yet trading. Any registration, licence or authorisation identifiers shown are **placeholders** (`*-DEMO-*`) and do not refer to any real registration with the Central Bank of Kenya, the Office of the Data Protection Commissioner, or any other authority. See `docs/ops/demo-mode-spec.md`.
>
> Questions: admin@maanta.app


## ⚠️ Read this before anything else: the wallet may be a licensing question

MAANTA holds a **prepaid merchant balance, topped up by M-Pesa**, from which KES 30 is deducted per verified redemption. Depending on how that balance is structured, it may fall within the Central Bank of Kenya's payment services regime.

CBK PSP authorisation categories and minimum capital, for scale:

| Category | Minimum capital |
|---|---|
| Small E-Money Issuer (per-transaction cap KES 10,000) | KES 1 million |
| Electronic Retail PSP | KES 5 million |
| E-Money Issuer | KES 20 million |
| Designated Payment Instrument Issuer | KES 50 million |

**The distinction that probably decides it:** a balance that can only ever be spent on MAANTA's own fees — not transferred to anyone else, not cashed out, not used to pay third parties — looks like prepayment for services. A balance that can be withdrawn, transferred or redeemed for cash starts to look like stored value.

This is why clause 7.5 below is drafted as **non-transferable, closed-loop credit**, and why the refundability question is flagged rather than answered. Note that the Merchants page copy currently contains the line *"anything left in your balance stays yours"* — **that sentence and this clause must be resolved together**, and the marketing copy must follow the legal structure, not the other way round.

**Get CBK advice before launch.** This is the single highest-consequence open question across the whole website project, and it is not a copywriting decision.

---

## Decisions needed before this can be finalised

| # | Decision | Why it matters |
|---|---|---|
| 1 | Is the wallet refundable, and on what terms? | Licensing (above), plus consumer-protection exposure |
| 2 | Who holds the funds — MAANTA, or IntaSend as a licensed PSP? | May move the licensing question entirely |
| 3 | Does unused credit expire? | Common, but needs to be lawful and clearly disclosed |
| 4 | Who bears the loss on a disputed redemption? | Clause 8 |
| 5 | Are staff accounts on all plans or Elite only? | Clause 5 |
| 6 | Is Elite auto-renewing? The site says nothing is charged automatically after the trial — confirm that holds for paid Elite too. | Clause 9 |

---

# MAANTA Merchant Terms

**MAANTA APP** ("MAANTA", "we", "us")
Last updated: 31 July 2026 (DRAFT)

These terms govern your use of MAANTA as a merchant. By listing a shop, publishing a deal, or verifying a code, you agree to them. If you are agreeing on behalf of a business, you confirm you are authorised to do so.

Separate [Terms of Service](/terms) apply to shoppers, and our [Privacy Policy](/privacy) explains how we handle personal data.

---

## 1. What MAANTA does, and what it does not do

**1.1** MAANTA is a platform that displays offers you publish, issues a single-use code to a shopper who claims one, and gives you the means to verify that code at your counter.

**1.2 MAANTA is not the seller.** Any sale is between you and the shopper, on your premises, on your terms. We are not a party to it, we do not take title to any goods, and we do not process payment for it.

**1.3** There is no checkout in MAANTA. The shopper pays you directly, at your counter, by whatever means you accept.

**1.4** You are responsible for the goods and services you sell, for their description, quality, safety and legality, and for any warranty, refund or consumer-law obligation arising from the sale.

> *Counsel note: 1.2 to 1.4 are the core liability architecture of this agreement. They should be reviewed first and should also be reflected in the shopper Terms of Service so both sides describe the relationship identically.*

## 2. Eligibility

**2.1** You must operate a genuine business at a mall where MAANTA is live, and be entitled to sell the goods or services you offer.

**2.2** We may ask for evidence of identity, business registration, or authority to act for the shop, and may suspend an account until we receive it.

## 3. Your account

**3.1** You are responsible for everything done under your account, including by your staff.

**3.2** Keep your access details secure. Tell us immediately at admin@maanta.app if you think someone else has access.

**3.3** The phone number on your account is how we reach you about deals, redemptions and your balance. Keep it current.

## 4. Publishing deals

**4.1** You decide the offer: what it is, the deal price, how many you will honour, and when it ends.

**4.2** Everything you publish must be accurate and must be an offer you intend to honour. Do not publish a deal you cannot supply.

**4.3 You must honour a validly verified code** on the terms you published. If you cannot, see clause 6.4.

**4.4** You may not publish deals for anything you are not lawfully entitled to sell, anything requiring a licence you do not hold, counterfeit goods, or anything prohibited under {{PROHIBITED_CATEGORIES}}.

**4.5** You may end a deal early. Codes already claimed remain valid for their window plus the grace period in clause 6.2.

> *Counsel note: 4.5 creates a real obligation — a shopper holding a claimed code when a deal is withdrawn. Confirm the platform enforces this, and confirm the drafting matches what the code actually does.*

## 5. Staff

**5.1** You may add staff to verify codes at your counter. {{STAFF_PLAN_AVAILABILITY}}

**5.2** Each staff member gets their own access so that activity is attributable to a person.

**5.3** You are responsible for your staff's use of MAANTA, for removing access when someone leaves, and for what they do with any personal data they see.

## 6. Redemption

**6.1** A shopper claims a deal and receives a 6-digit code. Your staff verify the code at the counter and either accept or reject it.

**6.2** A claimed code is valid until the deal expires, plus a **15-minute grace period**.

**6.3** A code is single-use, tied to one deal at your shop, and cannot be used elsewhere or twice.

**6.4 You may reject a code.** You are not charged for a rejected code. You should reject where the code has expired, where it is being presented for something other than the published deal, or where you reasonably suspect misuse.

**6.5** Rejecting codes repeatedly for valid claims may lead to suspension under clause 12. Publishing offers you do not intend to honour damages every shop on the platform.

## 7. Fees and your balance

**7.1 Success fee.** You pay **KES 30** for each verified redemption. The amount is the same regardless of the value of the sale. We take no percentage of any sale.

**7.2 What is not charged.** There is no listing fee, no monthly minimum on Standard, and no charge for a code that expires or that you reject. Publishing a deal is free.

**7.3** The success fee is deducted from your balance at the moment a code is verified.

**7.4 Topping up.** You top up by M-Pesa or card through our payment providers. Their terms apply to the payment itself.

**7.5 Your balance is prepaid credit for MAANTA fees only.** It is not money held on deposit, it cannot be transferred to any other person or account, it cannot be used to pay anyone other than MAANTA, and it carries no interest.

**7.6 Refunds.** {{REFUND_POLICY}}

**7.7 Expiry of unused credit.** {{CREDIT_EXPIRY}}

**7.8 Opening credit and promotions.** Promotional credit — including the KES 300 opening credit for the first 100 shops activated at BBS Mall — is granted at our discretion, has no cash value, is not refundable, and may have an expiry date stated when it is granted.

**7.9 Taxes.** Fees are stated {{TAX_INCLUSIVE_OR_EXCLUSIVE}} of VAT. We will issue receipts or invoices as required.

> *Counsel note: 7.5 to 7.7 are the clauses that carry the CBK question flagged at the top. Draft them only after the licensing position is settled. `{{REFUND_POLICY}}` and `{{CREDIT_EXPIRY}}` are deliberately unanswered.*

## 8. Disputes about a redemption

**8.1** If you believe a redemption was charged in error, tell us within **{{DISPUTE_WINDOW}}** of it happening.

**8.2** We will look at the record — the deal, the code, the time, and which staff account verified it — and tell you the outcome.

**8.3** Where we find a fee was charged in error, we will credit it back to your balance.

**8.4** {{DISPUTE_LOSS_ALLOCATION}}

> *Counsel note: 8.4 is unwritten because it is a commercial decision. Who bears the loss when a shopper claims they redeemed nothing and the shop says otherwise? Whatever is chosen must be stated plainly here and must match how support actually behaves.*

## 9. Plans

**9.1 Standard** is free: one active deal, and the success fee per verified redemption.

**9.2 Elite** is **KES 3,500 per month**: two active deals, flash deals and boosts. The success fee still applies.

**9.3 Boosts** place a deal at the top of the feed for 24 hours at **KES 500**. {{BOOST_PLAN_AVAILABILITY}}

**9.4 Trial.** The first 100 shops activated at BBS Mall receive 30 days of Elite at no monthly cost. The success fee applies during the trial. At the end you have **7 days** to decide; if you do nothing, your account returns to Standard. **Nothing is charged automatically at the end of a trial.**

**9.5 Renewal and cancellation.** {{ELITE_RENEWAL_TERMS}}

**9.6 Changes to fees.** We will give you at least **{{FEE_CHANGE_NOTICE}}** notice before changing published fees. Changes do not affect a deal already published or a code already claimed.

## 10. Rankings

**10.1** Deals are ordered by verified redemptions, distance and time remaining. MAANTA does not host reviews or star ratings.

**10.2** Position in the feed is not guaranteed, including for boosted deals, and may change as other shops publish.

**10.3** Attempting to inflate your ranking — including self-redeeming codes, or arranging redemptions that are not genuine sales — is a material breach of these terms.

## 11. Your content

**11.1** You keep ownership of your shop name, logo, images and deal descriptions.

**11.2** You grant us a non-exclusive, royalty-free licence to display them on MAANTA and in materials promoting the mall node you are part of, for as long as your account is open and for a reasonable period afterwards in archived records.

**11.3** You confirm you have the right to grant that licence.

## 12. Suspension and termination

**12.1 You may stop at any time.** End your deals and close your account. There is no notice period, no minimum term and no exit fee. Clause 7.6 governs any remaining balance.

**12.2** We may suspend or close an account that breaches these terms, that repeatedly fails to honour valid codes, that we reasonably believe is being used fraudulently, or where we are required to by law.

**12.3** Where practical we will tell you first and give you a chance to put it right. Where we suspend immediately, we will tell you why.

**12.4** Fees already incurred remain payable. Clauses 1.4, 8, 13, 14 and 16 survive termination.

## 13. Liability

**13.1** MAANTA is provided as it is. We do not guarantee that any deal will be claimed, that any shopper will arrive, or that the service will be uninterrupted.

**13.2** We are not liable for the sale itself, for goods or services you supply, or for any dispute between you and a shopper about them.

**13.3** {{LIABILITY_CAP}}

**13.4** Nothing in these terms excludes liability that cannot lawfully be excluded, including for fraud or for death or personal injury caused by negligence.

> *Counsel note: 13.3 needs a cap that is enforceable in Kenya and proportionate to the fees involved. A cap tied to fees paid in the preceding period is the usual approach.*

## 14. Data protection

**14.1** Each of us must comply with the Data Protection Act, 2019.

**14.2** Our [Privacy Policy](/privacy) explains what MAANTA does with personal data.

**14.3** Where you or your staff see personal data through MAANTA, you must use it only to verify and honour a redemption, and not for marketing or any other purpose.

**14.4** {{CONTROLLER_RELATIONSHIP}}

> *Counsel note: settle whether MAANTA and the merchant are independent controllers, joint controllers, or controller and processor for redemption records. This determines whether a data-sharing agreement is needed here.*

## 15. Changes to these terms

**15.1** We may update these terms. We will give at least **{{TERMS_CHANGE_NOTICE}}** notice of material changes by the contact details on your account.

**15.2** Continuing to use MAANTA after a change takes effect means you accept it. If you do not, you may close your account under clause 12.1.

## 16. Governing law and disputes

**16.1** These terms are governed by the laws of Kenya.

**16.2** We will try to resolve any dispute with you directly first. Contact admin@maanta.app.

**16.3** {{DISPUTE_RESOLUTION_MECHANISM}}

## 17. General

**17.1** If any clause is found unenforceable, the rest continues to apply.

**17.2** You may not transfer your rights under these terms without our written consent.

**17.3** These terms, with the Privacy Policy and any plan details shown when you subscribe, are the whole agreement between us.

## 18. Contact

MAANTA APP
BBS Mall, Eastleigh, Nairobi, Kenya
admin@maanta.app

---

## Questions for counsel — ordered by consequence

1. **Does the prepaid wallet require CBK authorisation?** See the note at the top. Consider whether structuring the funds to be held by IntaSend, as an already-licensed PSP, removes the question. **Resolve before launch.**
2. **Refundability and expiry of balances** (7.6, 7.7) — the answer follows from question 1, and also has consumer-protection implications.
3. **Is the liability cap in 13.3 enforceable** in Kenya at the level proposed?
4. **Controller relationship with merchants** (14.4), which also affects the Privacy Policy.
5. **Loss allocation on disputed redemptions** (8.4) — commercial decision, must match how support behaves in practice.
6. **VAT treatment** of the success fee, the Elite subscription and boosts (7.9).
7. **Is 4.3, the obligation to honour a verified code, enforceable** as drafted, and is the 15-minute grace period workable where a deal is withdrawn early under 4.5?
8. **Consumer protection**: does the Consumer Protection Act 2012 impose obligations on MAANTA as an intermediary, notwithstanding clause 1.2?
9. **Prohibited categories** (4.4) — a real list is needed, informed by what shops at BBS actually sell and by any licensing regimes that apply.

---

## Copy alignment required

These terms and the marketing copy must not contradict each other. Two known conflicts:

| Marketing claim | Where | Conflict |
|---|---|---|
| "Anything left in your balance stays yours" | `copy/merchants.md`, `#faq` | Depends entirely on 7.6, which is unresolved. **Remove the line until the clause is settled.** |
| "There is no notice period, no contract length and no exit fee" | `copy/merchants.md`, `#faq` | Consistent with 12.1 as drafted. Keep them in sync if 12.1 changes. |
