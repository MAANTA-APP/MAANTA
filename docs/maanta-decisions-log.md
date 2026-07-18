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
| 2026-07-15 | **Boost is Elite-only — enforced server-side.** Closes a live breach where `purchase_boost` / `move_boost` checked owner/admin, deal state, no-duplication and balance but **not** `merchants.tier`, letting a Standard merchant with balance buy/move boosts by calling the RPCs directly. Both RPCs now raise a stable `BOOST_ELITE_ONLY` error for non-Elite merchants. The gate checks the merchant's tier and is **not** bypassed by admin/service_role (it sits outside the caller-auth block). No change to boost price, duration, trial length, or Node-0 credits. | migration `20260715120000_boost_elite_only_gate.sql` (`CREATE OR REPLACE` of both RPCs); `/api/boosts` + `/api/boosts/move` map `BOOST_ELITE_ONLY` → HTTP 403; tests in `src/app/api/boosts/**/__tests__/route.test.ts` |
| 2026-07-16 | **Node 0 opening credit = KES 300**, granted by admin at activation to the first **100** launch merchants activated during the Node 0 launch window. A launch-period **promotional credit** (same class as the free Elite trial), **not** a collection — does not breach the manual-billing ban. Amount/cap/launch-node are **frozen** but read from `app_config` (`node0_opening_credit_kes=300`, `node0_opening_credit_merchant_cap=100`, `node0_launch_node=BBS Mall`); window reuses `node0_launch_period_ends_at`. | Written **inline** in `activate_merchant` (migration `20260716120000_node0_opening_credit_on_activation.sql`) as `topup`/`manual`/`KES`, tagged `node0_opening_credit`, in the same transaction as the status flip. **Not** routed via `record_merchant_ledger_entry` (service_role-only), mirroring `purchase_boost`. Idempotent per merchant via `provider_reference = 'node0_opening_credit:<merchant_id>'`. Tests: `maanta-app/supabase/tests/node0_opening_credit_test.sql` |
| 2026-07-18 | **Shopper `YOU PAY` price model** (design brief §4/§10). A deal now carries `price_kes` (base the shopper pays) + `charges` (disclosed mandatory extras: `{label, type:"fixed"\|"percent", value}`) + optional `compare_at_kes` (struck "Was"). **YOU PAY = price + Σ extras**, computed in exactly one place (`src/lib/pricing.ts`) so the tile, deal detail and claimed code always show the same number. Extras are **itemised only in deal detail**; everywhere else they collapse to one line ("Includes KES N in taxes and charges"). Disclosure is a **mandatory create-deal step (M9)** — neither option preselected, Publish carries the number; a charge not declared here **cannot** be added at the counter (the merchant app has no field for it). This is the amount the **shopper** pays the **merchant** — it does **not** touch the frozen KES 30 MAANTA success fee. Columns are NULLable, so legacy deals simply show no price until re-published. | migration `20260718120000_shopper_you_pay_price_model.sql` (`deals.price_kes/compare_at_kes/charges`, `redemptions.amount_kes` snapshot at claim); `src/lib/pricing.ts` (+ tests `src/lib/__tests__/pricing.test.ts`); `/api/deals` validates+persists; `new-deal-wizard.tsx` M9 step; shopper feed/tiles, `deals/[id]`, `tickets/[id]` display; `/api/redemptions` snapshots `amount_kes` |

## Pending decisions

| Decision | Needed by | Notes |
|---|---|---|
| Kenya incorporation + entity details | Nov 2026 Nairobi trip | Blocks publishing legal docs; governing-law refs assume Kenya |
| Which email platform hosts the waitlist | Before campaign build (Sept/Oct 2026) | Waitlist location itself is decided (see frozen entry above); platform must meet `maanta-email-segmentation-plan.md` requirements |
| Payment processor final choice for launch | Nov 2026 | See `maanta-app/legal/payment-processor-comparison.md` |
| Elite subscription price (KES 3,500/mo) review | Oct 2026 | Success fee (KES 30) is explicitly NOT under review |
| Paid FX provider (replace keyless open.er-api.com) | Before live non-KES charges | Flagged in `src/lib/currency.ts` |
| Cross-border data transfer basis (Supabase in eu-west-1) | Lawyer review | Flagged in `maanta-app/legal/privacy-policy.md` |

## How to add an entry

1. Record the date, decision, and the exact code/doc it affects.
2. If it changes a frozen rule, say what it supersedes.
3. Mirror to Notion and mark the repo copy's "Last updated".

Last updated: 2026-07-18
