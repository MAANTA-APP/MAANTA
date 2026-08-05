# E2E readiness report — inventory verification run (2026-07-30)

> **Correction (2026-08-05):** where this dated report says prod must apply
> `20260730180000` (and the browse filter `20260730190000`), that has happened —
> the pause gate landed on production 2026-08-04 and the ledger now records it
> under the repo filenames `20260730180000` + `20260730190000` (initially under
> MCP-minted numbers; repaired 2026-08-05 — see D24/D25 in
> `docs/maanta-drift-register.md`). Do not re-apply.

**Mode:** Builder  
**Branch:** `cursor/e2e-testing-readiness-2020`  
**Baseline:** `main` @ `a1cd5b2` (prior trial-honesty E2E work already merged)  
**Method:** inventory is a working map only — every route and product truth was
re-checked against repo routes, components, APIs, and SQL before changes.

Companion artifacts:

- Route matrix: `docs/ops/e2e-route-readiness-2026-07-30.md`
- Founder checklist: `docs/ops/founder-e2e-checklist-2026-07-30.md` (updated)
- Skills handoff: `docs/skills/e2e-testing-readiness-2026-07-30.md`
- Prior surface verify: `docs/skills/e2e-surface-matrix-2026-07-30.md`

---

## 1. What was verified

| Area | Verdict |
|---|---|
| Public `/`, `/pricing`, `/how-it-works`, `/faq` | Live |
| `/contact` | Design-ahead (client-only submit; no API) |
| Shopper auth `/login` | Live (Clerk or Supabase strategy) |
| `/otp` as a route | **Missing** — OTP UI lives on `/verify-phone` |
| `/verify-phone` + claim phone gate | Held |
| Feed Flash → Priority → third | Held in data; UI title for #3 is **Deals near me** (locked name: All Active Deals) |
| `/browse` / `/map` vs ranked feed | Separate surfaces — held |
| `/deals/[id]` YOU PAY | One summed number — held |
| `/tickets/[id]` countdown + 15m grace + expired | Held |
| Tickets nav label **Deals** | Held → `/my-deals` (alias `/tickets` added this run) |
| Merchant redeem resolve→disclose→charge | Held |
| Staff without `can_verify` gate | Held |
| Wallet arrears + redeem-while-owing | Held |
| Top-up Stripe Phase 1 vs STK-first UI | **Was misleading** — fixed this run |
| Elite 2 active deals | Held (`enforce_deal_limit`) |
| Shops hidden until approved | Held |
| Elite trial optional + approve notice/cap | Held (merged in #144) |
| Fee reversal note + audit | Held |
| Verify-anyway on location mismatch | **Redeem-and-dispute** (code truth) — not hard reject |
| `claim_deal` pause gate | **Regression** — dropped in 20260720120000; restored this run |
| `design/current-reality/` mirror | Absent — routes/components remain implementation truth |

---

## 2. Classification

### A. Blocks E2E now (addressed this run where code-owned)

| Item | Action |
|---|---|
| Top-up UI led with M-Pesa STK while Phase 1 truth is Stripe | Stripe primary + STK only when IntaSend configured + honesty notice |
| Inventory path drift (`/merchant/onboarding`, `/tickets` list) | Alias redirects to canonical routes |
| Paused-deal claim footgun (UI said no claims; RPC allowed) | Migration `20260730180000` + API 409 mapping |
| Location-mismatch FAQ implied Reject-only | Support FAQ clarifies Confirm = verify-anyway + fee + dispute |

### B. Before pilot, not before first E2E

| Item | Notes |
|---|---|
| Confirm 07-30 migrations on prod (incl. new pause-gate) | Human-owned |
| `demo_mode_enabled` / `MAANTA_DEMO_MODE` posture | Rehearsal may stay ON |
| `pg_cron` `maanta_handle_trial_expiry` | Trials never grace without it |
| Dedicated non-prod Playwright env (E14) | Suite self-skips without secrets |
| `/merchants` phone unused until onboard | Non-blocking |
| Contact form backend | Not on critical path |

### C. Post-E2E / future

See-all Flash/Priority dedicated screens, archive/repost/delete frame parity,
founder reports route, finer staff permission frames, feed marketing title
lock-name alignment, command palette / dashboards, analytics expansions.

### D. Needs product decision

| Item | Code truth (do not guess) |
|---|---|
| Third feed section name | Locked sort name = **All Active Deals**; UI = **Deals near me** (subtitle discloses mall scope). Behavior is correct; rename is a product call. |
| Verify-anyway vs hard reject on wrong shop | **Resolved by code:** Confirm = redeem + fee + dispute; Reject = no fee. Frames that show hard reject are superseded for geofence mismatch. Guardian `hard_block` remains a separate hard decline. |
| M-Pesa listed first in design | Design ideal; shipped Phase 1 = Stripe-first (now reflected in UI). |

---

## 3. What changed in this branch

| Change | Why |
|---|---|
| `TopupFlow` Stripe-primary + `isIntasendConfigured()` | Stops false STK-live interpretation during E2E |
| `/merchant/onboarding` → `/merchant/onboard` | Inventory/doc links work |
| `/tickets` → `/my-deals` | Inventory list path works |
| `20260730180000_restore_claim_deal_pause_gate.sql` | Matches merchant pause UI contract |
| Claim API `deal_paused` → 409 | Honest shopper error |
| Merchant support FAQ verify-anyway line | Operator not misled |
| Unit tests (topup, intasend, claim mapping) + SQL pause gate test | Confidence ratchet |

**Not changed:** fee amount, trial length, money RPCs (except pause gate), feed sort, admin approve logic, Playwright secrets, Vercel/Supabase config.

---

## 4. Still blocks a *browser* E2E in this cloud VM

These are environment/ops, not product defects:

1. Interactive Clerk needs real publishable **and** secret keys (placeholder → Invalid host).
2. Playwright golden path needs `E2E_*` secrets against a **non-prod** deploy.
3. Prod must apply migration `20260730180000` (and any earlier 07-30 files still pending).

The **product critical path is E2E-ready** once those env prerequisites are met.

---

## 5. Verification of this branch

```text
cd maanta-app && npm test
# 50 files / 389 tests passed (+6: topup×3, intasend×2, claim pause mapping×1)
# ^ historical: measured on the E2E branch before it merged. The count is higher
#   on main now (main's own work plus #137's). Treat this as the record of that
#   run, not as the current total — re-run rather than quoting it.

cd maanta-app && npm run typecheck
# clean
```

SQL: `supabase/tests/claim_deal_pause_gate_test.sql` — **PASS** on local
`supabase start` after applying `20260730180000`.
