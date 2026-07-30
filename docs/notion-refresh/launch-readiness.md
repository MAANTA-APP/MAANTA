# Launch Readiness

**Status:** Canonical · **Last verified:** 2026-07-30  
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
| Merchant onboard → admin approve | ✅ in repo | Manual ops for real merchants. **2026-07-30:** the opening-credit cap inside `activate_merchant` was counted **globally**, so once Node 0 filled its 100 slots the next node's promo would have been dead on arrival — activations granting nothing, silently, while `/for-merchants` advertised the credit. Now per node (`20260730120000`, **applied to prod**); frozen amount/cap unchanged |
| Stripe top-up | 🟡 | Sandbox works; live pending. **2026-07-30 defect fixed:** the `?stripe=success` return rendered the green success takeover with `added: 0` and the pre-payment balance — a credit the webhook had not made — and never polled. Now a polling `confirming` screen; `credited` shows the **observed delta**; a charged-but-uncredited card gets `unsettled` — "Payment received", never the failure screen |
| IntaSend M-Pesa | 🔴 | Blocked on credentials. Rail order is **capability-driven, not declared** — M-Pesa leads wherever credentials exist, so going live is an **ops event, not a code change**. **2026-07-30:** "configured" now means *usable* — a key pair disagreeing with `INTASEND_ENV` is refused on the money path, so the rail is hidden rather than offered-then-broken (warn-once server log names the reason; check it if the rail doesn't appear after provisioning) |
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
| E11 | Trial-expiry schedule in prod | 🟡 **applied to prod 2026-07-29** — job `maanta_handle_trial_expiry` registered + active (`0 2 * * *`); confirm the first real nightly run in `cron.job_run_details` | GATE |
| E12–E15 | Money tests, frozen rules, security | ✅ | — |
| E14 | Playwright E2E | 🟡 self-skipping; needs secrets. Now **35 tests / 3 specs** (golden-path, role-access, contract-generated design-truth smoke). The same seeded non-prod env unblocks **E14 and E17's Layer 2** — one provisioning task, two gates | — |
| E16 | PostHog | ✅ ingestion confirmed live 2026-07-29 (2,757 events / 217 persons over 6 days); redemption + `guardian_outcome` events still unverified at volume | — |
| E17 | Design-truth contract + CI enforcement (design ↔ code parity) | 🟡 repo-complete — 22 frames, 19 runtime rules, **11 drift rows all closed**; Layer 1 = **141 assertions** every PR; Layer 2 (18 frames) needs the E14 env; canvas redraw owed by Claude Design | — |
| E18 | Role-scoped merchant console + founder-role split | 🟡 nav done — one permission→surface mapping, owner console unchanged by construction, no server guard weakened; **split deferred** behind a CHECK-constraint migration + RLS review (fee reversal is the first power to extract) | — |
| E19 | Public copy governance (plan names, launch offers) | ✅ `R-PLAN-NAMES` **was being violated in production** — both public plan cards priced Standard as "Free", which also misstates the model since Standard carries the KES 30 fee. Now "No monthly fee" with the fee visible beside it; the ungoverned "first month of Elite free" offer is **withdrawn**. CI-enforced | — |
| E20 | Node 0 opening-credit promise matches its config | ✅ **prod-applied** — page no longer hardcodes the amount/cap, fails closed, cap counted per node | — |

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

Updated 2026-07-28 — see `docs/ops/backend-prod-setup-status-2026-07.md` and
`docs/ops/founder-backend-prod-checklist-2026-07.md`.

- [x] Apply pending migrations to `axrrslqssmbngbataejg` — **verified aligned** (67/67; dry-run up to date)
- [x] Node 0 100-deal seed refreshed (100 live) + Nairobi 150 + @maanta.app test accounts applied
- [ ] Confirm Vercel Production **required-now** env set (founder checklist) + redeploy
- [ ] Confirm `W3W_API_KEY` on Vercel
- [ ] Confirm Production auth strategy (`clerk` vs `supabase`) and Clerk dashboard URL/SMS settings
- [ ] Smoke `/feed`, `/browse`, map, claim, verify, `/founder`
- [x] Sentry + PostHog on Vercel (confirmed 2026-07-27); PostHog **ingestion confirmed live 2026-07-29**
- [x] Migration `20260730120000` (per-node opening-credit cap) **applied to prod 2026-07-30** and verified read-only — node-scoped count + per-node lock present, admin gate / pending guard / `SECURITY DEFINER` / pinned `search_path` / idempotency anchor all intact, grants and frozen config unchanged. Safe window: 0 opening credits had been granted, so the change was behaviour-identical on the day
- [ ] 2-phone golden path at BBS
- [ ] Dedupe duplicate `admin@maanta.app` Clerk user rows

## Tonight / this week vs launch

| Horizon | Must be true |
|---|---|
| Tonight / this week | Auth works on chosen strategy; healthz OK; feed not falsely empty due to missing migration/seed; operator can log in as roles |
| BBS rehearsal | Seeded or real merchants; 2-phone claim→verify; agents know rota |
| Launch | Live top-up path (card and/or M-Pesa); legal publish path clear; dispute coverage staffed; waitlist→app conversion path |

## Risks

- Checklist rot if only updated in repo or only in Notion.
- Closing E6 late forces Stripe-only launch — decide explicitly, don’t drift.
- **PR #131 cannot be approved by automation** (2026-07-30). CI is green, but Cursor's Approval Agent declines: its Security Agent completes as *skipped*, so the required security signal never succeeds, and **no reviewer can be assigned because only the PR author has collaborator access**. Founder action — grant a human reviewer collaborator access, or adjust the automation's required signals. No code change clears this.
- **Production is ahead of `main` on one function** while #131 is unmerged: `activate_merchant` carries the per-node cap (`20260730120000`). Behaviour-identical today and the migration is committed on the branch — but abandoning #131 rather than merging would leave it needing re-homing.
- **Ungoverned public promises.** Any launch offer needs an `app_config` key **plus** a decisions-log entry before it is advertised. Two live pages had drifted from their config before 2026-07-30 — one advertising an offer nothing backed, one advertising a credit whose gates could stop granting it.

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
