# E2E route-by-route readiness — inventory verify (2026-07-30)

**Branch:** `cursor/e2e-testing-readiness-2020`  
**Rule:** inventory expected status vs code-verified actual. Code wins.

Legend: ● Live · ◐ Gated · ■ Blocked · ◷ Rehearsal · ◇ Design-ahead · ✗ Missing

| Route | Expected | Actual | E2E | Action taken | Remaining gap |
|---|---|---|---|---|---|
| `/` | ● | ● | Supporting | Verified | — |
| `/pricing` | ● | ● | Supporting | Verified | — |
| `/how-it-works` | ● | ● | Deferrable | Verified | — |
| `/faq` | ● | ● | Deferrable | Verified | — |
| `/contact` | ● | ◇ | Deferrable | Classified | No submit API |
| `/login` | ● | ● | Critical | Verified | Needs real Clerk for browser |
| `/otp` | ● | ✗ | Deferrable | Classified | Use `/verify-phone` |
| `/verify-phone` | ◐ | ◐ | Critical | Verified phone gate | Strategy-dependent SMS |
| `/feed` | ● | ● | Critical | Verified order | UI titles ≠ locked names (C) |
| `/browse` | ● | ● | Critical | Verified separate | — |
| `/map` | ● | ● | Supporting | Verified separate | — |
| `/deals/[id]` | ● | ● | Critical | Verified YOU PAY | — |
| `/tickets` | ● | ● (alias) | Supporting | Redirect → `/my-deals` | Canonical list is `/my-deals` |
| `/tickets/[id]` | ● | ◐ auth | Critical | Verified timer/grace | — |
| `/merchant/onboarding` | ● | ● (alias) | Critical | Redirect → `/merchant/onboard` | Canonical is onboard |
| `/merchant/onboard` | ● | ●/◐ | Critical | Prefill `?shop=` already on main | — |
| `/merchant/redeem` | ● | ◐ | Critical | Verified resolve→fee | — |
| `/merchant/deals` | ● | ◐ | Critical | Verified ranking signal | — |
| `/merchant/deals/new` | ◇ | ◐ usable | Critical | Exists; not design-parity | Design-ahead polish (C) |
| `/merchant/wallet` | ● | ◐ | Critical | Verified arrears copy | — |
| `/merchant/topup` | ■ STK | ◐ Stripe ● / STK ■ | Critical | Stripe-first honesty | STK only if IntaSend set |
| `/merchant/alerts` | ● | ◐ | Supporting | Verified | Derived alerts only |
| `/merchant/staff` | ◐ | ◐ | Supporting | Verified owner gate | Finer perms = future (C) |
| `/agent` | ● | ◐ | Supporting | Verified | Not first-E2E required |
| `/agent/leads` | ● | ◐ | Supporting | Verified | — |
| `/agent/leads/[id]` | ● | ◐ | Supporting | Verified | — |
| `/founder` | ◷ | ◷ (admin) | Supporting | Verified | No separate founder role |
| `/founder/reports` | ◷ | ✗ | Deferrable | Classified | Use `/admin/reports` / billing |
| `/admin` | ● | ◐ | Critical | Verified queue | — |
| `/admin/redemptions/[id]` | ● | ◐ | Critical | Verified dispute/reverse | — |
| `/admin/support` | ● | ◐ | Supporting | Verified clickable | — |
| `/admin/billing` | ● | ◐ | Critical | Cap line wired (#144) | — |
| `/admin/deals` | ● | ◐ thin | Supporting | Verified | Fraud-flagged only |

### Capture readiness (inventory)

| Surface class | Capture note |
|---|---|
| Public marketing | Safe now (after prior truth-audit copy) |
| Shopper feed/deal/ticket | Safe now |
| Merchant redeem/wallet | After demo-data refresh if seed stale; arrears screens = **internal only** |
| Admin billing / support / disputes | **Internal only** — money owed + ops tooling |
| Agent leads | **Internal only** — lead contact details |
| Founder dashboard | Rehearsal / internal |
