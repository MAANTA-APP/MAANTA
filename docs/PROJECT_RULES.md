# PROJECT_RULES.md (repo-native export)

> **Provenance**: The original `PROJECT_RULES.md` lives in Notion and its full
> wording is **not** in this repository. This export reconstructs the rules from
> what the code and migrations actually enforce and cite — every rule below has a
> code anchor. Where the original's wording is referenced but unavailable, the gap
> is marked **⚠️ GAP**. Do not add rules here without either a code anchor or a
> verbatim Notion export. Migrations that cite `PROJECT_RULES.md` resolve here.

Last updated: 2026-07-09 · Rule changes require a new entry in
`docs/maanta-decisions-log.md` first.

## Money rules

1. **KES 30 success fee** per verified redemption, charged on ALL plans
   (Standard and Elite) at the point of merchant verification. No price-review
   caveat — unlike the Elite subscription (under Oct 2026 review), this changes
   only on an explicit new decisions-log entry. Stored as a config row; the
   functions carry a `30.00` hard fallback if the config row is ever missing.
   _Anchor: migration `20260702094145_harden_success_fee_amount.sql`._
2. **Redemption always succeeds** (frozen 2026-06-30): redemption success is
   never rolled back by a fee-step failure, and a failed flag/task write must
   never block the shopper.
   _Anchor: `verify_redemption` in `20260702092952`, reasserted in `20260703235152`._
3. **`feeChargeStatus` is a strict 3-state model** (frozen, DECISIONS_LOG
   2026-06-30): `charged` | `owed` | `unknown`. `unknown` means the fee step
   itself errored and **must never collapse into `owed`** — it is a
   fee-mechanism failure, not an ordinary insufficient-balance arrears case.
4. **D-003**: `feeChargeStatus = unknown` must create an admin-visible
   `agent_tasks` row (`task_type = 'fraud_review'`, `priority = 'high'`),
   per DECISIONS_LOG 2026-07-03 (confirmed by Mohamed Elmi).
   _Anchor: `20260703235152_unknown_fee_status_fraud_review_task.sql`._
5. **All merchant money movements** go through the
   `record_merchant_ledger_entry` RPC (atomic ledger INSERT + balance UPDATE +
   idempotency via UNIQUE provider reference). Refund/dispute idempotency is
   keyed on the Stripe `payment_intent`, not charge/dispute IDs.
   _Anchor: `src/lib/merchant-ledger.ts`, migrations `20260709000151`, `20260709000211`._
6. **Zero-balance gate**: new deal INSERTs are blocked when the merchant's
   `account_balance` is zero or negative. Does NOT touch redemptions, arrears,
   or the three-state feeChargeStatus model.
   _Anchor: `20260703190627_zero_balance_gate_deals.sql` (DECISIONS_LOG 2026-07-03)._
7. **Elite lifecycle**: 30-day trial → 7-day grace period → auto-downgrade to
   Standard if no paid conversion. Paid Elite KES 3,500/month (under Oct 2026
   review). _Anchor: `handle_trial_expiry`, migrations `20260701110443`, `20260701111223`._
8. **Payments stance**: Stripe stays in sandbox during testing; M-Pesa STK via
   IntaSend is prepared but IntaSend availability is not assumed. Top-up bounds
   1–1,000,000 per currency unit; currencies KES/USD/EUR/GBP.
   _Anchor: `src/lib/currency.ts`, `src/lib/intasend.ts`, migration `20260705191128`._

## Core-loop rules

9. **Redemption ticket expiry = `deal.expires_at` + 15 minutes** (frozen,
   DECISIONS_LOG 2026-06-30 supersession).
   _Anchor: `claim_deal` in `20260702092952` / `20260702093134`._
10. **Claim guards** (`claim_deal`): deal must exist, be active, be unexpired;
    merchant must be active; `max_claims` cap respected; one active pending
    claim per shopper per deal; pending OTP codes are DB-unique per merchant.
11. **`verify_redemption` does not call `guardian_check`** — guardian_check
    wiring is separately scoped, per a frozen decision.
    ⚠️ GAP: the decision's date and full wording are Notion-only; see
    `docs/maanta-decisions-log.md` (undated entry).

## Onboarding rules

12. **Three explicit, auditable onboarding paths only**: `self_serve`,
    `agent_assisted`, `admin_assisted`. The merchant is always the
    authenticated submitter on both self-serve and agent-assisted paths; the
    agent is **attribution only** (`assisted_by_agent_id`), validated for
    existence + active status, with no relationship check to the caller.
    (DECISIONS_LOG 2026-07-02, third revision.)
    _Anchor: `20260702083812`, `20260702085628`._
13. **Activation is a separate lifecycle moment** from onboarding:
    `merchants.onboarded_by` / `onboarded_at` record who ACTIVATED the merchant
    (set inside `activate_merchant`), distinct from onboarding attribution.

## Security rules

14. SECURITY DEFINER functions have pinned `search_path`; `anon`/`authenticated`
    EXECUTE is revoked on privileged functions; callers must match
    `p_user_id` unless `service_role`; verify requires merchant owner or admin;
    role self-escalation is blocked at the DB level.
    _Anchors: `20260630231949`, `20260701132109`, `20260702003248`, `20260705200856`, `20260709000258`._

## Content rules

15. **Deal images**: public storage bucket (CDN-served to shoppers), upload
    restricted to `merchant_admin` + `admin` roles, path convention
    `deal-images/{merchant_id}/{filename}`, max size 5MB enforced in app code.
    ⚠️ GAP: the 5MB rule is cited "per ARCHITECTURE.md", which is Notion-only
    and not exported to this repo yet.
    _Anchor: `20260701125545_deal_images_storage.sql`._

## Known gaps in this export

- The Notion original may contain rules with no code enforcement (naming, tone,
  process rules). None are reproduced here — export them verbatim from Notion
  in a documentation session rather than reconstructing.
- `ARCHITECTURE.md` and `SESSION_FRAMEWORK.md` are still Notion-only (cited by
  migrations `20260701125545` and `20260702092952` respectively).
