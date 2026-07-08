# Privacy Policy (DRAFT)

**Status: draft for internal review only — not published, not legal advice.**
Last updated: [date]. Drafted against Kenya's Data Protection Act, 2019
("DPA") and the Office of the Data Protection Commissioner ("ODPC")
framework, pending final incorporation.

## 1. Who controls your data

[Maanta legal entity name] is the data controller for personal data
processed through the App. Data protection contact: [DPO/contact email —
required once processing volumes may trigger DPA registration/notification
obligations]. ODPC registration number: [TBD — confirm whether Maanta's
scale requires ODPC registration as a data controller/processor].

## 2. What we collect

| Category | Examples | Source |
|---|---|---|
| Identity & contact | Phone number, name, email | You, at signup |
| Authentication | OTP verification records | Twilio Verify |
| Merchant business data | Business name, mall/unit location (what3words), phone, email, WhatsApp | Merchant onboarding |
| Location | what3words address of Merchant premises | Merchant onboarding (not continuous customer location tracking) |
| Transaction records | Top-up amounts, currency, fees, redemption events | App usage |
| Payment metadata | Provider transaction/session references (not full card numbers — those are handled entirely by Stripe/IntaSend, never touch Maanta's servers) | Stripe, IntaSend |
| Device/push | Push notification subscription endpoint | Browser, with consent |

We do not collect or store full payment card numbers. Card payments go
through Stripe's hosted Checkout page; Maanta only receives a session
reference and the amount/currency charged.

## 3. Why we process it (lawful basis under the DPA)

- **Contract**: to run the deal/redemption/wallet features you sign up for.
- **Consent**: push notifications, and any marketing communications.
- **Legal obligation**: responding to lawful requests from Kenyan
  authorities, tax/financial record-keeping.
- **Legitimate interest**: fraud prevention, platform security, service
  improvement — balanced against your rights per DPA requirements.

## 4. Where your data is processed — cross-border transfer note

**Open item for legal review:** the App's database (Supabase) currently runs
in AWS `eu-west-1` (Ireland), and payment processing runs through Stripe
(global) and IntaSend (Kenya-focused). If personal data of Kenyan data
subjects is processed outside Kenya, this is a cross-border transfer under
DPA s.48–51 and needs one of: an adequacy finding, appropriate safeguards
(e.g. standard contractual clauses), or the data subject's explicit consent.
This section needs counsel input on which basis applies and what disclosure
is required, and may drive a decision to migrate to a Kenya or Africa-region
host before go-live.

## 5. Who we share it with

- **Payment processors** (Stripe, IntaSend, and possibly Paystack/Flutterwave
  post-incorporation) — to process top-ups and refunds.
- **Twilio** — for SMS/OTP verification.
- **Service providers** — hosting (Supabase), and any analytics/monitoring
  tools added later.
- **Authorities** — where required by Kenyan law.
- We do not sell personal data.

## 6. Your rights under the DPA

You have the right to: access your data, request correction, request
deletion (subject to legal retention requirements), object to processing,
data portability, and to lodge a complaint with the ODPC. Requests can be
made via [contact method — TBD].

## 7. Retention

[Placeholder — define retention periods per data category, e.g. transaction
records retained per Kenyan tax/record-keeping requirements even after
account closure; push subscriptions deleted on unsubscribe/expiry.]

## 8. Security

[Placeholder — describe technical/organizational measures: RLS on the
database, service-role key restricted to server-side use, webhook signature
verification on payment callbacks, etc. — align with what's actually
implemented rather than aspirational language.]

## 9. Children

The App is not directed at children. [Age threshold and handling — TBD.]

## 10. Changes to this policy

[Placeholder — notice method for material changes.]

---
*Open items for lawyer review: Section 1 ODPC registration requirement,
Section 4 cross-border transfer basis (may require an infrastructure
decision, not just a legal one), Section 7 retention periods.*
