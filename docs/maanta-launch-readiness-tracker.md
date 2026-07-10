# MAANTA launch readiness tracker

Last updated: 2026-07-10 · Review weekly (Product track, Step 5). Update this
doc (and its Notion counterpart) whenever an item changes state; anything
marked **GATE** must be done before launch day. Behavior-changing decisions go
to `maanta-decisions-log.md`, not this file.

Status legend: ✅ done · 🟡 in progress / needs verification · 🔴 blocker · ⬜ not started

## Launch-critical product flows

| Flow | Status | Notes |
|---|---|---|
| Shopper browse → claim → ticket | ✅ | `claim_deal` RPC; ticket expiry = deal expiry + 15 min |
| Shopper redeem at counter (merchant verify) | ✅ | `verify_redemption` RPC: atomic verify + fee debit/arrears |
| Merchant onboarding → admin approval | ✅ | `onboard_merchant` / `activate_merchant` RPCs, agent attribution |
| Merchant wallet top-up (Stripe card) | 🟡 | Works in **sandbox**; live keys + live-mode test pending (Nov cutover decision) |
| Merchant wallet top-up (M-Pesa STK / IntaSend) | 🟡 | Code + webhook ready (sandbox URL switch in `src/lib/intasend.ts`); do not assume IntaSend availability — needs account + live STK test |
| Refund / dispute money movements | ✅ | Stripe webhook handles refund + dispute open/close, payment_intent-keyed idempotency |
| Fraud review on unknown fee status | ✅ | Verify-anyway + admin task (migration `20260703235152`) |
| Elite trial expiry → grace → downgrade | ✅ | `handle_trial_expiry`; confirm the scheduled invocation runs in production |
| Frozen wireframe UI (all surfaces) | ✅ | Merged 2026-07-09 (PR #11); device-level QA pass still owed (E2–E4 below) |
| Admin panel | ✅ | Merchant approval, fraud audit, plans/trials, reporting; role self-escalation blocked |
| Web push notifications | ✅ | Top-up received, trial tasks |
| Public waitlist capture | ⬜ | Spec: `maanta-waitlist-data-schema.md` (decided 2026-07-10: lives in the email platform, platform TBC). Gates the campaign start, not app launch |

## Product & engineering gates

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| E1 | Frozen UI reviewed, approved, merged | Engineer + founder | ✅ done | GATE | Merged 2026-07-09 (PR #11) |
| E2 | Shopper journey smoke-tested on real devices (browse → claim → redeem) | Engineer | 🟡 in progress | GATE | Rehearsal data seeded 2026-07-10 (`supabase/seed/node0_rehearsal_seed.sql`); follow `maanta-node0-rehearsal-checklist.md`. Needs end-to-end device pass |
| E3 | Merchant journey smoke-tested (onboard → approval → post deal → verify → fee debit) | Engineer | 🟡 in progress | GATE | Includes arrears path when wallet is empty; claim→verify-anyway→arrears loop verified against live DB 2026-07-10 (rolled-back RPC test) |
| E4 | Admin journey smoke-tested (approve, fraud/dispute review) | Engineer | 🟡 in progress | GATE | `unknown` fee status must open a fraud-review task; seeded pending merchant + open merchant_override dispute ready for the admin pass |
| E5 | Stripe sandbox top-ups stable | Engineer | ✅ done | — | Multi-currency + webhook idempotency + failure log in place |
| E6 | M-Pesa STK end-to-end | Engineer | 🔴 blocked | GATE | Blocked on IntaSend API access; code path exists. Escalate credential request weekly |
| E7 | Waitlist forms live in the email platform (decided 2026-07-10: external, not in-repo; platform TBC) | Founder + agency + AI lead | ⬜ not started | GATE (marketing) | Spec: `maanta-waitlist-data-schema.md`. Gates the campaign start, not app launch |
| E8 | Campaign-source capture (UTM → `source_campaign` field on every signup, in the email platform) | Agency + AI lead | ⬜ not started | GATE (marketing) | Per the segmentation plan's platform requirements |
| E9 | FX provider replaced with SLA-backed source | Engineer | ⬜ not started | GATE if non-KES live charges | Fine to defer if launch is KES-only |
| E10 | Production env vars set on Vercel + Supabase secrets audit | Engineer | ⬜ not started | GATE | Verify `STRIPE_ENV` guard behavior on deploy |
| E11 | Trial-expiry job scheduling confirmed in production Supabase | Engineer | ⬜ not started | GATE | `handle_trial_expiry` must actually run on schedule |

## Marketing & growth gates

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| M1 | Shopper + merchant landing pages live | Agency + engineer | ⬜ not started | GATE (campaign) | Separate CTAs; segment set at the form, see waitlist spec |
| M2 | Email platform configured with segments + automations | Agency + AI lead | ⬜ not started | GATE (campaign) | `shopper` / `merchant` / `mall_operator` from signup |
| M3 | Welcome sequences written and activated | Agency | ⬜ not started | GATE (campaign) | Drafts in the three sequence docs |
| M4 | 4-week social content calendar | Agency | ⬜ not started | GATE (campaign) | One-month pre-launch push |
| M5 | Creative approval workflow agreed | Agency + founder | ⬜ not started | — | |
| M6 | Weekly KPI review format established | Agency + AI lead | ⬜ not started | — | KPI set in agency brief |
| M7 | Agency brief handed off | Founder | ⬜ not started | GATE (campaign) | `maanta-marketing-agency-brief.md` + KPI sheet |

## Operations & legal gates

| # | Item | Owner | Status | Gate | Notes |
|---|---|---|---|---|---|
| O1 | Founder/admin testing plan documented | Founder | ✅ done | — | In `maanta-launch-ops-runbook.md`, incl. family-assisted testing |
| O2 | Merchant onboarding support process defined | Founder + AI lead | ⬜ not started | GATE | Who answers merchant questions during onboarding week |
| O3 | Dispute + on-ground agent escalation path documented | AI lead | ✅ done | GATE | Verify-anyway routing logged in `maanta-decisions-log.md`; paths in the runbook |
| O4 | BBS Mall reporting expectations + operator comms | Founder | ⬜ not started | — | |
| O5 | Legal docs lawyer-reviewed and published | Founder + lawyer | 🔴 blocked | GATE | Drafts in `maanta-app/legal/`; blocked on incorporation decisions (Nov Nairobi trip) |
| O6 | Kenya DPA cross-border data decision (Supabase `eu-west-1`) | Founder + lawyer | ⬜ not started | GATE | Adequacy/contractual basis or region migration |

## Blockers

- E6 (IntaSend API access) — escalate weekly.
- O5 (legal review) — blocked on incorporation; schedule lawyer ahead of the
  November trip so the trip signs decisions rather than starting them.

## Post-launch deferrals

- Additional malls / nodes beyond BBS Mall
- Mall-operator reporting dashboard
- Deal drafts, self-serve Elite payment rail (deferred from PR #11)
