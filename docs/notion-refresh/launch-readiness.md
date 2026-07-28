# Launch Readiness

**Status:** Canonical · **Last verified:** 2026-07-28  
**Repo mirror:** `docs/maanta-launch-readiness-tracker.md` (update both when status changes)  
**Audience:** founder, engineer, ops

## Purpose

Gate list for (a) BBS rehearsal on production and (b) open shopper launch.  
**Repo green ≠ launch ready.**

## Current reality

| Track | Verdict |
|---|---|
| Repo / CI | Strong — money-path SQL suites, vitest, typecheck/lint historically clean on `main` |
| BBS rehearsal on prod | Gated on migrations/seed, auth, device smoke |
| Open shopper launch | Not ready — money rails, legal/DPA, ops SLAs |

Status legend (same as tracker): ✅ done · 🟡 in progress / needs verification · 🔴 blocker · ⬜ not started

## Launch-critical product flows

| Flow | Status | Label |
|---|---|---|
| Browse → claim → ticket | 🟡 | Implemented; prod/device verification owed; claim phone gate when Clerk |
| Merchant verify + fee/arrears | 🟡 | Implemented; device pass owed |
| Merchant onboard → admin approve | ✅ in repo | Manual ops for real merchants |
| Stripe top-up | 🟡 | Sandbox works; live pending |
| IntaSend M-Pesa | 🔴 | Blocked on credentials |
| Guardian + admin review | ✅ in repo | Prod threshold tuning manual |
| Fee reversal | ✅ in repo | Ops SOP exists |
| Waitlist | 🟡 | Built; keep verifying prod |
| Frozen UI surfaces | ✅ in repo | Device QA still owed |

## Engineering gates (abbreviated)

| # | Item | Status | Gate? |
|---|---|---|---|
| E2–E4 | Real-device shopper/merchant/admin smoke | 🟡 | GATE |
| E6 | M-Pesa STK e2e | 🔴 | GATE |
| E7–E8 | Waitlist + UTM | 🟡 | GATE (marketing) |
| E9 | SLA FX provider | 🟡 repo abstraction; prod ops pending | GATE if non-KES live |
| E10 | Prod env audit | 🟡 partial | GATE |
| E11 | Trial-expiry schedule in prod | ⬜ | GATE |
| E12–E15 | Money tests, frozen rules, security | ✅ | — |
| E14 | Playwright E2E | 🟡 self-skipping; needs secrets | — |
| E16 | PostHog | 🟡 env wired; confirm events | — |

Full table: keep synced with `docs/maanta-launch-readiness-tracker.md`.

## Marketing gates

M1–M7 largely ⬜ / not campaign-live — agency brief exists; handoff incomplete. Segment rule remains: shopper / merchant / mall_operator separated at signup.

## Operations & legal gates

| # | Item | Status |
|---|---|---|
| O1 | Founder testing plan | ✅ |
| O2 | Merchant onboarding support process | ⬜ GATE |
| O3 | Dispute path + 72h SLA | ✅ documented |
| O4 | BBS reporting expectations | ⬜ |
| O5 | Legal published | 🔴 blocked on incorporation |
| O6 | DPA / eu-west-1 basis | ⬜ GATE |

## Prod apply checklist (human-owned)

Carry forward and refresh the 2026-07-27 checklist:

- [ ] Apply pending migrations to `axrrslqssmbngbataejg` (`docs/ops/supabase-migrations.md` / `make db-prod-fixup`)
- [ ] Confirm `W3W_API_KEY` on Vercel
- [ ] Run Node 0 seed / Nairobi seeds intentionally; record counts
- [ ] Confirm Production auth strategy (`clerk` vs `supabase`) and dashboard URL/SMTP/SMS settings
- [ ] Smoke `/feed`, `/browse`, map, claim, verify, `/founder`
- [x] Sentry + PostHog on Vercel (confirmed 2026-07-27) — still verify live events
- [ ] 2-phone golden path at BBS

## Tonight / this week vs launch

| Horizon | Must be true |
|---|---|
| Tonight / this week | Auth works on chosen strategy; healthz OK; feed not falsely empty due to missing migration/seed; operator can log in as roles |
| BBS rehearsal | Seeded or real merchants; 2-phone claim→verify; agents know rota |
| Launch | Live top-up path (card and/or M-Pesa); legal publish path clear; dispute coverage staffed; waitlist→app conversion path |

## Risks

- Checklist rot if only updated in repo or only in Notion.
- Closing E6 late forces Stripe-only launch — decide explicitly, don’t drift.

## Dependencies

- IntaSend account access.
- Lawyer + incorporation decisions.
- Founder calendar for device rehearsal.

## Next actions

1. Sync this page from the repo tracker weekly (Product track Step 5).
2. After every prod apply, paste migration versions + deal/merchant counts here.
3. Escalate E6 and O5 weekly until closed or consciously deferred with a written launch constraint.

## Related pages

- Current State of MAANTA
- Observability and Production Verification
- BBS Mall / Nairobi Rollout
- Node 0 Rehearsal Checklist
- Risks and Hard Truths
- Prod apply checklist (dated child page)
