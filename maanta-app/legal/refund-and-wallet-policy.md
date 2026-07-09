# Refund and Wallet Policy (DRAFT)

**Status: draft for internal review only — not published, not legal advice.**
Describes the Merchant Account Balance ("wallet") as actually implemented,
so legal review can match language to real product behavior rather than
aspirational copy.

## 1. What the wallet is

Each approved Merchant has a prepaid Account Balance, denominated in Kenyan
Shillings (KES). It's funded by top-ups and drawn down by platform fees
(success fees, boost fees, subscription fees, arrears). It is **not** a bank
account, is **not** interest-bearing, and is **not** transferable between
Merchants.

## 2. Topping up

- **M-Pesa (primary)**: via STK push through IntaSend, KES only.
- **Card (secondary)**: via Stripe Checkout, in KES, USD, EUR, or GBP.
  Non-KES top-ups are converted to a KES credit at the time of payment. [The
  conversion rate used for testing is a static placeholder — before
  accepting real non-KES payments, this must be replaced with a live,
  disclosed FX rate/margin, and that rate/margin needs to be stated here.]
- Funds are credited to the Account Balance once the payment provider
  confirms completion (M-Pesa: STK push completion callback; Stripe:
  checkout session completion webhook). Maanta is not responsible for
  delays caused by the underlying payment network.

## 3. Refunds

- **Card top-ups**: if a card payment is refunded through Stripe (by Maanta
  or reversed by the cardholder's bank), the equivalent KES amount is
  deducted from the Account Balance. If the balance has already been spent
  on fees, this can result in a negative balance / arrears, handled per
  Section 5.
- **M-Pesa top-ups**: [refund mechanics via IntaSend — TBD; IntaSend refund
  API behavior needs to be confirmed and documented once implemented].
- **Platform fees already incurred** (e.g. a success fee for a completed
  redemption) are non-refundable, since the underlying service (the
  redemption) was already delivered.
- Maanta does not process refunds for the underlying sale of goods/services
  between a customer and a Merchant — that's between the customer and the
  Merchant directly (see Terms of Service Section 5).

## 4. Card disputes / chargebacks

- If a cardholder disputes a top-up charge with their bank (a Stripe
  "dispute"), Stripe holds the disputed funds, and Maanta mirrors that by
  deducting the equivalent amount from the Merchant's Account Balance while
  the dispute is open.
- If Maanta/the Merchant wins the dispute, the held amount is credited back.
- If the dispute is lost, the deduction stands, and may result in arrears if
  the balance was already spent.
- Merchants may be asked to provide evidence (proof of goods/services
  delivered) to help contest a dispute, though the dispute itself is decided
  by the card network/issuing bank, not Maanta.

## 5. Negative balances and arrears

[Placeholder — describe grace period mechanics already present in the data
model (`outstanding_arrears`, `grace_period_ends_at`): how long a Merchant
has to top up before listings are hidden/suspended, and what happens to
arrears on account closure.]

## 6. Currency and pricing

- The Account Balance is always denominated in KES, regardless of what
  currency was used to top up.
- [Placeholder — once a live FX provider is chosen, disclose the source and
  any margin applied, since undisclosed FX margins can raise consumer
  protection concerns under Kenyan law.]

## 7. Account closure and remaining balance

[Placeholder — whether/how a Merchant can withdraw an unused Account
Balance on closing their account, timelines, and any deduction for
outstanding fees. This is currently unimplemented in the product — needs a
product decision before this section can be written accurately.]

---
*Open items: Section 2's FX rate is a hardcoded placeholder in code today
(`src/lib/currency.ts`) — must not go live without a real rate source.
Section 3's IntaSend refund mechanics aren't built yet. Section 7 (wallet
withdrawal on closure) has no product implementation yet — flag to product
before legal finalizes this doc.*
