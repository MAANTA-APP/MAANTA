# MAANTA launch readiness tracker

Last updated: 2026-07-09 · Review weekly (Product track, Step 5).

Status legend: ✅ done · 🟡 in progress / needs verification · 🔴 blocker · ⬜ not started

## Launch-critical product flows

| Flow | Status | Notes |
|---|---|---|
| Shopper browse → claim → ticket | ✅ | `claim_deal` RPC; ticket expiry = deal expiry + 15 min |
| Shopper redeem at counter (merchant verify) | ✅ | `verify_redemption` RPC: atomic verify + fee debit/arrears |
| Merchant onboarding → admin approval | ✅ | `onboard_merchant` / `activate_merchant` RPCs, agent attribution |
| Merchant wallet top-up (Stripe card) | 🟡 | Works in **sandbox**; live keys + live-mode test pending |
| Merchant wallet top-up (M-Pesa STK / IntaSend) | 🟡 | Code + webhook ready (sandbox URL switch in `src/lib/intasend.ts`); do not assume IntaSend availability — needs account + live STK test |
| Refund / dispute money movements | ✅ | Stripe webhook handles refund + dispute open/close, payment_intent-keyed idempotency |
| Fraud review on unknown fee status | ✅ | Verify-anyway + admin task (migration `20260703235152`) |
| Elite trial expiry → grace → downgrade | ✅ | `handle_trial_expiry`; confirm the scheduled invocation runs in production |
| Admin panel | ✅ | Merchant approval; role self-escalation blocked |
| Web push notifications | ✅ | Top-up received, trial tasks |
| Public waitlist capture | ⬜ | Not in this repo — external site; segmented forms per `maanta-waitlist-data-schema.md` |

## Pre-launch important (not blockers)

- [ ] Live Stripe keys + end-to-end live-mode top-up test
- [ ] IntaSend production account or fallback M-Pesa plan decided
- [ ] Replace keyless FX provider before any live non-KES charge
- [ ] Lawyer review of `maanta-app/legal/*` after incorporation; then publish
- [ ] Confirm trial-expiry job scheduling in production Supabase
- [ ] Waitlist site live with three segmented landing paths + email automations
- [ ] Agency brief handed off (`maanta-marketing-agency-brief.md`) with KPI sheet

## Blockers

_None currently logged. When one appears, list it here with owner and date._

## Post-launch deferrals

- Additional malls / nodes beyond BBS Mall
- Boost-fee purchase UI (ledger type exists)
- Mall-operator reporting dashboard
