# Terms of Service (DRAFT)

**Status: draft for internal review only — not published, not legal advice.**
Last updated: [date]. Governing law assumed: Republic of Kenya, pending the
November 2026 incorporation decision.

## 1. Who we are

MAANTA ("Maanta", "we", "us") is operated by [Maanta legal entity name], a
company [to be incorporated] under the laws of Kenya, registered address
[registered address], reachable at [support email/phone].

Maanta operates a platform (the "App") that lets customers discover deals
offered by participating merchants ("Merchants") at physical retail
locations, and lets Merchants manage those deals, redemptions, and a prepaid
wallet balance used to pay Maanta's fees.

## 2. What Maanta is — and isn't

- Maanta is a **discovery and redemption-verification platform**, not a
  payment processor for customer purchases. When a customer redeems a deal,
  the transaction for goods/services happens directly between the customer
  and the Merchant, in person, at the Merchant's premises. Maanta does not
  collect, hold, or transmit funds on behalf of customers for those
  purchases.
- Maanta does process payments **from Merchants to Maanta** — specifically,
  Merchant wallet top-ups (via card through Stripe, or M-Pesa through
  IntaSend) and any platform fees drawn from that wallet balance (e.g.
  success fees, boost fees, subscription fees). These are governed by the
  Refund and Wallet Policy.
- Location information for Merchant premises is provided via what3words
  addressing and is for physical navigation only.

## 3. Eligibility and accounts

- Customers and Merchant staff authenticate by phone number (SMS/OTP via
  Twilio Verify). You're responsible for keeping access to that phone number
  secure.
- Merchants must complete onboarding, including the verification steps
  described in the KYC/AML Policy, before being approved to list deals or
  receive top-ups.
- Maanta may suspend or shadow-ban a Merchant account for policy violations,
  suspected fraud, or on regulator request, as described in Section 6.

## 4. Merchant wallet, fees, and top-ups

- Merchants maintain a prepaid balance ("Account Balance") funded through
  top-ups. See the Refund and Wallet Policy for the mechanics, supported
  currencies, and refund handling.
- Fees (success fees, boost fees, subscription fees, arrears) are described
  in [pricing page / merchant agreement — TBD] and are deducted from the
  Account Balance.
- Non-payment resulting in a negative balance or arrears may result in
  reduced visibility, grace periods, or suspension, as implemented in the
  product (see `outstanding_arrears`, `grace_period_ends_at` handling).

## 5. Deals and redemption

- Deals are offered at the Merchant's discretion, subject to Maanta's
  content and eligibility rules [TBD — link merchant content policy once
  written].
- Maanta verifies redemptions at the point of sale but is not a party to,
  and assumes no liability for, the underlying sale of goods or services
  between customer and Merchant.
- Disputes about the goods or service itself (quality, refunds for a
  purchase) are between the customer and the Merchant, not Maanta, unless
  required otherwise by Kenyan consumer protection law.

## 6. Suspension and termination

- Maanta may suspend or terminate access for violation of these Terms,
  suspected fraud or abuse, non-payment, or legal/regulatory requirement.
- Merchants may close their account subject to settling any outstanding fees
  and the wallet payout/refund process in the Refund and Wallet Policy.

## 7. Liability and disclaimers

[Placeholder — standard limitation-of-liability, "as-is" service, indemnity,
and force majeure clauses to be drafted by counsel, calibrated to Kenyan
consumer protection law (Consumer Protection Act, 2012) and Maanta's actual
risk exposure as a non-custodial marketplace.]

## 8. Data protection

Use of the App is also governed by the Privacy Policy, which describes how
Maanta handles personal data under the Data Protection Act, 2019 (Kenya).

## 9. Governing law and disputes

These Terms are governed by the laws of Kenya. [Dispute resolution
mechanism — courts vs. arbitration — TBD by counsel.]

## 10. Changes to these Terms

[Placeholder — notice period and method for material changes.]

---
*Open items for lawyer review: Section 7 liability language, Section 9
dispute mechanism, whether a separate Merchant Agreement is needed
alongside these Terms given the wallet/fee relationship is materially
different from the customer relationship.*
