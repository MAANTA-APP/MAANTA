# MAANTA decisions log (repo mirror)

Notion holds the authoritative DECISIONS_LOG; this file mirrors the decisions
that are load-bearing for the codebase so sessions without Notion access don't
fly blind. When adding an entry here, add it to Notion too (or vice versa).

Format: date · decision · consequence in product/code.

## Frozen decisions

| Date | Decision | Where it bites in code |
|---|---|---|
| pre-2026-06-30 | **KES 30 success fee** per verified redemption, all plans (Standard and Elite), charged at merchant verification. No price-review caveat. | `deduct_success_fee_or_record_arrears`; hardened in migration `20260702094145_harden_success_fee_amount.sql` with `30.00` fallback |
| pre-2026-06-30 | **Elite trial = 30 days**, then **7-day grace period**, then auto-downgrade to Standard if no paid conversion. Paid Elite **KES 3,500/month** (price under review Oct 2026). | `handle_trial_expiry` (migrations `20260701110443`, `20260701111223`) |
| 2026-06-30 | **Redemption ticket expiry** = deal `expires_at` + 15 minutes (supersedes earlier rule). | `claim_deal` RPC comment, migration `20260702093134` |
| 2026-07-03 | **Zero-balance gate**: merchants with zero/negative balance cannot create new deals. Existing deals keep running; fees on their redemptions go to arrears. | migration `20260703190627_zero_balance_gate_deals.sql` |
| 2026-07-03 | **Verify-anyway**: if the fee charge status comes back `unknown`, the shopper's redemption still succeeds; a fraud-review task is created for admin/on-ground follow-up. Disputes are handled after the fact, auditably. | migration `20260703235152_unknown_fee_status_fraud_review_task.sql`; `/api/redemptions/verify` |
| 2026-07-05+ | **Stripe allowed as payment provider** alongside IntaSend; Stripe stays in **sandbox** during testing. M-Pesa STK via IntaSend is prepared for launch readiness but IntaSend availability is **not assumed**. | migration `20260705191128_allow_stripe_payment_provider.sql`; `src/lib/stripe.ts`, `src/lib/intasend.ts` |
| 2026-07-08 | **Multi-currency top-ups** (KES/USD/EUR/GBP) with live FX conversion to KES; failed webhooks logged to a failure table instead of dropped. | migration `20260708231241`; `src/lib/currency.ts` |
| 2026-07-09 | **All merchant money movements** go through one atomic, idempotent RPC (`record_merchant_ledger_entry`), keyed on unique provider reference. Refund/dispute idempotency keyed on Stripe `payment_intent`, not charge/dispute IDs. | migrations `20260709000151`, `20260709000211`; `src/lib/merchant-ledger.ts` |
| 2026-07-09 (this doc) | **BBS Mall is Node 0** and the sole proving ground until PMF. Shoppers, merchants, and mall operators are **separate audiences** from first signup (`segment_type` required). Notion = ops source of truth; repo = code source of truth; Drive/Obsidian = mirrors. | `docs/maanta-claude-operating-system.md` |

## Recent decisions

| Date | Decision | Where it bites |
|---|---|---|
| 2026-07-10 | **Waitlist signups live in the email platform**, not in this repo's Supabase (no `waitlist_signups` table, no `/api/waitlist` route). Platform choice confirmed later. | `docs/maanta-waitlist-data-schema.md` (Option A archived); tracker items E7/E8 become form/platform configuration, not repo backend work |
| 2026-07-10 | **Resend is the email platform** for the waitlist. Contacts (with `segment_type` and consent properties) live in a Resend audience — still no Supabase table. Amends the same-day entry above in one respect: a **stateless** `/api/waitlist` proxy route exists in-repo, because the segmentation plan requires server-side keyed API access (the Resend key can't be exposed to browser forms). The route stores nothing. | `/waitlist` page, `POST /api/waitlist`, `src/lib/resend.ts`, `src/lib/waitlist.ts`, `src/lib/waitlist-emails.ts`; env `RESEND_API_KEY` / `RESEND_AUDIENCE_ID` / `RESEND_FROM_EMAIL` |

## Pending decisions

| Decision | Needed by | Notes |
|---|---|---|
| Kenya incorporation + entity details | Nov 2026 Nairobi trip | Blocks publishing legal docs; governing-law refs assume Kenya |
| ~~Which email platform hosts the waitlist~~ | ~~Before campaign build~~ | **Resolved 2026-07-10: Resend** (see Recent decisions) |
| Payment processor final choice for launch | Nov 2026 | See `maanta-app/legal/payment-processor-comparison.md` |
| Elite subscription price (KES 3,500/mo) review | Oct 2026 | Success fee (KES 30) is explicitly NOT under review |
| Paid FX provider (replace keyless open.er-api.com) | Before live non-KES charges | Flagged in `src/lib/currency.ts` |
| Cross-border data transfer basis (Supabase in eu-west-1) | Lawyer review | Flagged in `maanta-app/legal/privacy-policy.md` |

## How to add an entry

1. Record the date, decision, and the exact code/doc it affects.
2. If it changes a frozen rule, say what it supersedes.
3. Mirror to Notion and mark the repo copy's "Last updated".

Last updated: 2026-07-10
