# Legal document drafts

Status: **DRAFT — internal working copies only.** Not published, not legal advice,
not reviewed by a lawyer. Written assuming Kenya incorporation per the
November 2026 Nairobi trip decision; if incorporation lands elsewhere, the
governing-law and regulator references throughout need to be redone, not
just find-replaced.

Do not link these from the live app or send to a merchant/user until Mohamed,
the cofounder, and a lawyer have reviewed them together.

Bracketed placeholders like `[Maanta legal entity name]` mark facts that
don't exist yet (entity name, registration number, registered address, DPA
officer contact) — fill in once incorporation is final.

| File | Purpose |
|---|---|
| `terms-of-service.md` | Governs use of the app by customers and merchants |
| `privacy-policy.md` | What data Maanta collects and why, under Kenya's Data Protection Act 2019 |
| `refund-and-wallet-policy.md` | How the merchant wallet balance, top-ups, and refunds work |
| `kyc-aml-policy.md` | Merchant onboarding verification and anti-money-laundering baseline |
| `payment-processor-comparison.md` | Research comparing Stripe/IntaSend vs. Paystack/Flutterwave/Pesapal/DPO/Cellulant/Adyen/Checkout.com for the Nov 2026 decision |

## Known open questions for the lawyer

- **Cross-border data transfer**: the current Supabase project runs in AWS
  `eu-west-1` (Ireland), not Kenya. If Kenyan users' personal data is
  processed there, that's a transfer out of Kenya under the DPA 2019 and
  needs a lawful basis (adequacy, contractual safeguards, or consent) —
  flagged inline in `privacy-policy.md`.
- **Stripe payout gap**: Stripe has no native Kenya payout support (confirmed
  via research — Kenya is only reachable through Paystack, a separate
  CBK-licensed Stripe subsidiary). A Kenya-incorporated Maanta can't get KES
  payouts from a standalone Stripe account. This affects both the ToS
  (which entity is actually charging/receiving money) and whether Stripe
  survives past the Nov 2026 decision. Candidates raised in the payment
  processor research: **Paystack** or **Flutterwave**, either of which could
  plausibly replace both Stripe and IntaSend with one CBK-licensed provider.
- **Who is the merchant of record**: right now Maanta is a middleman between
  merchant and customer (deal redemption happens in-store, no money changes
  hands through the app itself) — merchants only pay Maanta for wallet
  top-ups/fees. Confirm this framing is what the ToS should describe, since
  it changes Maanta's regulatory exposure (not a payment institution itself).
- **AML/FRC obligations**: Maanta likely isn't a "reporting institution"
  under Kenya's POCAMLA as long as it never custodies customer funds — but
  this should be confirmed once the entity and its exact money flows are
  finalized, since it determines whether `kyc-aml-policy.md`'s checks are a
  business choice or a legal requirement.
