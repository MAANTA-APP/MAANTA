# Payment processor comparison (research, July 2026)

**Purpose**: input for the payment-infrastructure decision at the November
2026 Nairobi trip. Not a legal or financial commitment — figures are from
public docs/pricing pages and should be re-verified directly with each
provider before a final choice, since fee schedules change.

## Why this matters

The current split — IntaSend for M-Pesa, Stripe for cards — exists because
**Stripe has no native Kenya merchant-of-record support**. Kenya is only
reachable through Paystack, which Stripe acquired in 2020 but which
operates as a separate, CBK-authorized entity with its own onboarding and
payouts. A Kenya-incorporated Maanta cannot open a standalone Stripe account
with KES payouts — it would need a foreign (e.g. US/UK) entity, which cuts
against a Kenya-first incorporation. This is worth deciding deliberately at
incorporation, not left as an accidental consequence of which SDK got
integrated first.

## Comparison

| Processor | Kenya merchant-of-record / payouts | Native M-Pesa | Worldwide cards / multi-currency | Approx. fees | KES bank payout | Dev experience | Regulatory status |
|---|---|---|---|---|---|---|---|
| **Paystack** (Stripe-owned) | Yes — CBK-authorized PSP | Yes (STK + Till) | Yes — Visa/MC/Amex globally, KES+USD settlement | ~1.5% mobile money; 2.9% local card; 3.8% intl card | Yes, KES or USD to bank/M-Pesa wallet | Official Node SDK, strong docs, fast onboarding | CBK PSP-authorized |
| **Flutterwave** | Yes — full KE incorporation KYC flow | Yes (collections + payouts) | Yes — 150+ currencies, broad card networks | ~2.9% local (tiered/capped in some markets); KES 100 flat payout fee | Yes, next-day settlement | Official Node SDK, solid docs, heavier KYC paperwork | Licensed PSP in Kenya |
| **Pesapal** | Yes — Kenya-native | Yes, first-class (+ Airtel Money) | Visa/MC yes; weaker multi-currency reach than Paystack/Flutterwave | 3–3.5% M-Pesa; 3.5–4.5% card | Yes, 1–3 days (M-Pesa), 3–5 days (card) | REST/JSON API; only community Node SDKs | CBK-licensed PSP |
| **DPO Pay** | Yes, pan-African incl. Kenya | Yes (+ Airtel) | Yes — Visa/MC/Amex/Diners, multi-currency | Quote-based, no public standard rate | Yes, to KES bank or M-Pesa wallet | Older XML-based API, PHP-first; weak modern Node/Next.js support | Regulated per market |
| **Cellulant (Tingg)** | Yes — Nairobi-HQ, licensed | Yes, native, cheapest quoted rate | Limited alone; reaches global cards mainly via partners (e.g. Adyen) | ~1% mobile money KE; 2.8% cards | Yes | API/dev portal exists but enterprise-oriented | CBK-licensed, HQ Nairobi |
| **Africa's Talking Payments** | Yes, Kenya-native | Yes (C2B/B2C/B2B, M-Pesa G2) | No real global card acquiring — mobile-money/USSD focused | Infra-fee model, ~$100 deposit, no published % | Yes | Simple API, good for SMS/USSD-heavy apps, not a full card gateway | Kenya-registered, direct Safaricom relationship |
| **Adyen** | Only via Cellulant partnership for local rails; no standalone KE legal entity/payouts | Indirect (via Cellulant) | Best-in-class globally, tier-1 | Enterprise-negotiated | Uncertain without partner | Excellent global API, but sales-gated, weeks-long enterprise onboarding | Tier-1 global; Africa via partner only |
| **Checkout.com** | No confirmed Kenya/Africa local acquiring | No | Excellent globally (50+ countries, mainly EU/NA/MEA/APAC) | Enterprise-negotiated | No confirmed KES path | Strong global docs, enterprise sales-driven onboarding | No Kenya-specific license found |
| **Stripe** (current, cards only) | No — foreign incorporation workaround required | No | Excellent globally (baseline) | ~2.9%+30c card (region-dependent) | No — needs foreign bank account | Best-in-class DX (baseline) | Not licensed for Kenya directly |

## Recommendation

**Paystack and Flutterwave are the strongest fits** for a Kenya-incorporated,
worldwide-card-accepting Maanta. Both are CBK-licensed, support M-Pesa
natively, accept cards from customers worldwide with multi-currency
settlement, ship official Node SDKs that fit the existing Next.js/Supabase
stack, and pay out directly to a Kenyan bank account in KES — closing the
exact gap the current Stripe/IntaSend split exists to paper over.

- **Paystack** edges out on developer experience and lower blended fees,
  plus the reassurance of Stripe's backing without Stripe's Kenya gap.
- **Flutterwave**'s broader currency/country reach may matter more if
  Maanta recruits merchants beyond Kenya later.
- Either could plausibly **replace both Stripe and IntaSend with a single
  provider** — worth raising explicitly as a consolidation option at the
  November incorporation decision, rather than defaulting to keeping three
  integrations (Stripe, IntaSend, plus whatever's chosen) long-term.
- Cellulant, DPO Pay, and Pesapal remain reasonable fallbacks but lag on
  global card reach, modern API/SDK quality, or fee transparency.

## Sources

- [Flutterwave Kenya docs](https://developer.flutterwave.com/v3.0/docs/kenya)
- [Flutterwave pricing](https://flutterwave.com/ke/pricing)
- [Flutterwave Kenya onboarding requirements](https://flutterwave.com/ng/support/onboarding/onboarding-requirements-for-using-flutterwave-in-kenya)
- [Paystack live in Kenya](https://paystack.com/blog/company-news/kenya)
- [Paystack CBK PSP authorization](https://paystack.com/blog/company-news/kenya-private-beta)
- [Paystack international payments](https://support.paystack.com/en/articles/2130690)
- [Paystack vs Stripe in Kenya](https://paystack.com/stripe/kenya)
- [Pesapal](https://www.pesapal.com/) · [Pesapal developer docs](https://developer.pesapal.com/)
- [DPO Pay Kenya](https://dpogroup.com/online-payments/kenya/) · [DPO Pay FAQ](https://dpogroup.com/faq/)
- [Cellulant](https://www.cellulant.io/) · [Tingg pricing](https://tingg.africa/pricing/)
- [Africa's Talking Payments help](https://help.africastalking.com/en/collections/150790-payments)
- [Adyen Africa expansion via Cellulant](https://www.adyen.com/press-and-media/adyen-expands-its-global-payment-offering-to-africa)
- [Checkout.com international coverage](https://www.checkout.com/solutions/international-coverage)
- [Is Stripe supported in Kenya? (Mazino Oyolo)](https://mazinooyolo.com/blog/stripe-account-in-kenya/)
