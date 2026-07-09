# MAANTA decisions log (repo mirror)

Notion holds the authoritative DECISIONS_LOG; this file mirrors the decisions
that are load-bearing for the codebase so sessions without Notion access don't
fly blind. When adding an entry here, add it to Notion too (or vice versa).

Migration comments that cite `DECISIONS_LOG.md` resolve here. Citations of
`PROJECT_RULES.md` and `WALKTHROUGH.md` resolve to the repo-native exports at
`docs/PROJECT_RULES.md` and `docs/WALKTHROUGH.md`. `ARCHITECTURE.md` and
`SESSION_FRAMEWORK.md` remain Notion-only (see Pending decisions).

Format: date · decision · consequence in product/code.

## Frozen decisions

| Date | Decision | Where it bites in code |
|---|---|---|
| pre-2026-06-30 | **KES 30 success fee** per verified redemption, all plans (Standard and Elite), charged at merchant verification. No price-review caveat. | `deduct_success_fee_or_record_arrears`; hardened in migration `20260702094145_harden_success_fee_amount.sql` with `30.00` fallback |
| pre-2026-06-30 | **Elite trial = 30 days**, then **7-day grace period**, then auto-downgrade to Standard if no paid conversion. Paid Elite **KES 3,500/month** (price under review Oct 2026). | `handle_trial_expiry` (migrations `20260701110443`, `20260701111223`) |
| 2026-06-30 | **Redemption ticket expiry** = deal `expires_at` + 15 minutes (supersedes earlier rule). | `claim_deal` RPC comment, migration `20260702093134` |
| 2026-06-30 | **Arrears model + strict 3-state `feeChargeStatus`** (`charged` / `owed` / `unknown`): `unknown` means the fee step itself errored and must never collapse into `owed`. **Redemption always succeeds** — never rolled back by a fee-step failure. | `verify_redemption`, migration `20260702092952` |
| 2026-07-02 | **Merchant-authored onboarding, third revision**: three explicit paths (`self_serve`, `agent_assisted`, `admin_assisted`); merchant is always the authenticated submitter; agent is attribution only (`assisted_by_agent_id`), validated for existence + active status, no caller-relationship check. Activation (`onboarded_by`/`onboarded_at`) stays a separate lifecycle moment. | migrations `20260702083812`, `20260702085628` |
| 2026-07-03 | **Zero-balance gate**: merchants with zero/negative balance cannot create new deals. Existing deals keep running; fees on their redemptions go to arrears. | migration `20260703190627_zero_balance_gate_deals.sql` |
| 2026-07-03 | **D-003 (verify-anyway follow-up)**: `feeChargeStatus = unknown` must create an admin-visible `agent_tasks` row (`fraud_review`, priority `high`) — it is a fee-mechanism failure needing eyes, not ordinary arrears. Even a failed task write never blocks the shopper. Confirmed by Mohamed Elmi. | migration `20260703235152_unknown_fee_status_fraud_review_task.sql`; `/api/redemptions/verify` |
| date unknown ⚠️ | **`guardian_check` wiring is separately scoped** (frozen): `verify_redemption` does not call `guardian_check`. Full wording and date are Notion-only — export on next documentation session. | function comments in `20260702092952`, `20260702093258` |
| 2026-07-05+ | **Stripe allowed as payment provider** alongside IntaSend; Stripe stays in **sandbox** during testing. M-Pesa STK via IntaSend is prepared for launch readiness but IntaSend availability is **not assumed**. | migration `20260705191128_allow_stripe_payment_provider.sql`; `src/lib/stripe.ts`, `src/lib/intasend.ts` |
| 2026-07-08 | **Multi-currency top-ups** (KES/USD/EUR/GBP) with live FX conversion to KES; failed webhooks logged to a failure table instead of dropped. | migration `20260708231241`; `src/lib/currency.ts` |
| 2026-07-09 | **All merchant money movements** go through one atomic, idempotent RPC (`record_merchant_ledger_entry`), keyed on unique provider reference. Refund/dispute idempotency keyed on Stripe `payment_intent`, not charge/dispute IDs. | migrations `20260709000151`, `20260709000211`; `src/lib/merchant-ledger.ts` |
| 2026-07-09 (this doc) | **BBS Mall is Node 0** and the sole proving ground until PMF. Shoppers, merchants, and mall operators are **separate audiences** from first signup (`segment_type` required). Notion = ops source of truth; repo = code source of truth; Drive/Obsidian = mirrors. | `docs/maanta-claude-operating-system.md` |

## Pending decisions

| Decision | Needed by | Notes |
|---|---|---|
| Kenya incorporation + entity details | Nov 2026 Nairobi trip | Blocks publishing legal docs; governing-law refs assume Kenya |
| Payment processor final choice for launch | Nov 2026 | See `maanta-app/legal/payment-processor-comparison.md` |
| Elite subscription price (KES 3,500/mo) review | Oct 2026 | Success fee (KES 30) is explicitly NOT under review |
| Paid FX provider (replace keyless open.er-api.com) | Before live non-KES charges | Flagged in `src/lib/currency.ts` |
| Cross-border data transfer basis (Supabase in eu-west-1) | Lawyer review | Flagged in `maanta-app/legal/privacy-policy.md` |
| Export `ARCHITECTURE.md` and `SESSION_FRAMEWORK.md` from Notion | Next documentation session | Still cited by migrations `20260701125545` (5MB image rule) and `20260702092952` (Build session type) with no repo copy |
| Confirm WALKTHROUGH step numbering for Steps 1–4 and 7 | Next documentation session | Only Steps 5–6 are pinned by migrations; `docs/WALKTHROUGH.md` marks the rest as reconstructed |
| Date + full wording of the guardian_check frozen decision | Next documentation session | Referenced but undated in migration comments |

## How to add an entry

1. Record the date, decision, and the exact code/doc it affects.
2. If it changes a frozen rule, say what it supersedes.
3. Mirror to Notion and mark the repo copy's "Last updated".

Last updated: 2026-07-09
