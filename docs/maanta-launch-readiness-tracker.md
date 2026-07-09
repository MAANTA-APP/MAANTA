# MAANTA — Launch Readiness Tracker

Single view of launch blockers, owners, and gating. Status values:
`done` · `in progress` · `blocked` · `not started`. Update this doc (and
its Notion counterpart) whenever an item changes state; anything marked
**GATE** must be `done` before launch day.

## Product & engineering

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| E1 | Frozen UI reviewed, approved, merged | Engineer + founder | not started | GATE | Preview review first; merge only after approval |
| E2 | Shopper journey smoke-tested (browse → claim → redeem) | Engineer | in progress | GATE | Core loop RPCs (`claim_deal`, `verify_redemption`) are live and tested at the unit level; needs end-to-end device pass |
| E3 | Merchant journey smoke-tested (onboard → approval → post deal → verify → fee debit) | Engineer | in progress | GATE | Includes arrears path when wallet is empty |
| E4 | Admin journey smoke-tested (approve, fraud/dispute review) | Engineer | not started | GATE | `unknown` fee status must open a fraud-review task |
| E5 | Stripe sandbox top-ups stable | Engineer | done | — | Multi-currency + webhook idempotency + failure log in place |
| E6 | M-Pesa STK end-to-end | Engineer | **blocked** | GATE | Blocked on IntaSend API access; code path exists. Escalate credential request weekly |
| E7 | Waitlist backend + forms live | Engineer | done | GATE (marketing) | `waitlist_signups` table, `POST /api/waitlist`, `/waitlist` + `/merchants` + `/mall-operators` pages, admin CSV export. Needs deploy + migration apply to production |
| E8 | Analytics events + campaign-source capture | Engineer + AI lead | in progress | GATE (marketing) | UTM → `source_campaign` stored per signup (done); analytics-platform events not yet emitted |
| E9 | FX provider replaced with SLA-backed source | Engineer | not started | GATE if non-KES live charges | Fine to defer if launch is KES-only |
| E10 | Production env vars set on Vercel + Supabase secrets audit | Engineer | not started | GATE | Verify `STRIPE_ENV` guard behavior on deploy |

## Marketing & growth

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| M1 | Shopper + merchant landing pages live | Agency + engineer | in progress | GATE (campaign) | Minimal pages built at `/waitlist`, `/merchants`, `/mall-operators` (segment set at the form); agency creative/copy pass still to come |
| M2 | Email platform configured with segments + automations | Agency + AI lead | not started | GATE (campaign) | `shopper` / `merchant` / `mall_operator` from signup |
| M3 | Welcome sequences written and activated | Agency | not started | GATE (campaign) | Drafts in the three sequence docs |
| M4 | 4-week social content calendar | Agency | not started | GATE (campaign) | One-month pre-launch push |
| M5 | Creative approval workflow agreed | Agency + founder | not started | — | |
| M6 | Weekly KPI review format established | Agency + AI lead | not started | — | KPI set in agency brief |

## Operations & legal

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| O1 | Founder/admin testing plan documented | Founder | done | — | In `maanta-launch-ops-runbook.md`, incl. family-assisted testing |
| O2 | Merchant onboarding support process defined | Founder + AI lead | not started | GATE | Who answers merchant questions during onboarding week |
| O3 | Dispute + on-ground agent escalation path documented | AI lead | in progress | GATE | Verify-anyway dispute routing decision to be logged |
| O4 | BBS Mall reporting expectations + operator comms | Founder | not started | — | |
| O5 | Legal docs lawyer-reviewed and published | Founder + lawyer | **blocked** | GATE | Drafts exist in `maanta-app/legal/`; blocked on incorporation decisions (Nov Nairobi trip) |
| O6 | Kenya DPA cross-border data decision (Supabase `eu-west-1`) | Founder + lawyer | not started | GATE | Adequacy/contractual basis or region migration |

## Decisions log (running)

| Date | Decision | Rationale |
|---|---|---|
| — | 30-day Elite trial with grace period | Encoded in migrations `elite_trial_grace_period`, `handle_trial_expiry_phase2` |
| — | Verify-anyway dispute routing: redemption verification proceeds even when the fee outcome is `unknown`; the unknown outcome opens a fraud-review task instead of blocking the shopper | Shopper experience is protected; risk is handled async by admin review |
| — | Success fee recorded as arrears (not rejected) when wallet can't cover it; deals gated at zero balance | Merchant keeps trading, MAANTA keeps the receivable |
| — | Stripe sandbox for testing; M-Pesa STK by launch; IntaSend unconfigured until API access granted | Provider comparison ongoing (`legal/payment-processor-comparison.md`) |
