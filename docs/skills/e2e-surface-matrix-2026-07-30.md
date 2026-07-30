# E2E surface matrix — code verification (2026-07-30)

**Mode:** Reviewer (read-only verify) · **Method:** code wins over docs.  
**Sources checked:** `maanta-app/src/app/**`, `src/lib/**`, `src/components/**`,
`supabase/migrations/**`, `e2e/**`, plus
`docs/skills/truth-audit-2026-07-30.md`, `docs/ops/e2e-golden-path.md`,
`docs/skills/e2e-readiness-2026-07-30.md`, `docs/ops/e2e-readiness-report-2026-07-30.md`.

**Inventory note:** There is no repo file that assigns each route a
`Live | Gated | Blocked | Missing | Design-ahead | Rehearsal` expected label.
“Expected (inventory)” below is inferred from the 2026-07-30 e2e readiness /
truth-audit / what-is-real docs. Gaps call out where that inference differs from code.

---

## Route matrix

| Route | File exists? | Expected (inventory) | Actual | Primary action | E2E | Gap |
|---|---|---|---|---|---|---|
| `/` | `src/app/(public)/page.tsx` | Live | **Live** | Browse deals → `/feed` | Supporting | — |
| `/pricing` | `src/app/(public)/pricing/page.tsx` | Live | **Live** | Plan copy (fee + trial cap) | Supporting | — |
| `/how-it-works` | `src/app/(public)/how-it-works/page.tsx` | Live | **Live** | Learn more → shopper/merchant | Deferrable | — |
| `/faq` | `src/app/(public)/faq/page.tsx` | Live | **Live** | Read FAQs | Deferrable | — |
| `/contact` | `src/app/(public)/contact/page.tsx` | Live | **Design-ahead** | “Send message” (client-only; no API) | Deferrable | Fake success — no backend |
| `/login` | `src/app/login/[[...sign-in]]/page.tsx` | Live / Gated | **Live** (strategy-aware) | Sign in (Clerk or Supabase email) | Critical | Interactive browser needs real Clerk keys |
| `/otp` | — | Missing / Design-ahead | **Missing** | — | Deferrable | OTP lives in `/verify-phone` (`OtpInput`), not a route |
| `/verify-phone` | `src/app/verify-phone/page.tsx` | Live (claim gate) | **Gated** / **Rehearsal** | Phone SMS OTP | Critical | Clerk-only when `phoneOtpEnabled`; claim API still enforces phone |
| `/feed` | `src/app/(shopper)/feed/page.tsx` | Live | **Live** | Open deal / claim path | Critical | UI rail titles ≠ locked names (see truths) |
| `/browse` | `src/app/(shopper)/browse/page.tsx` | Live | **Live** | Filter/list deals | Critical | Separate from ranked feed ✅ |
| `/map` | `src/app/(shopper)/map/page.tsx` | Live | **Live** | Map pins | Supporting | Separate from feed ✅ |
| `/deals/[id]` | `src/app/(shopper)/deals/[id]/page.tsx` | Live | **Live** | Claim deal | Critical | — |
| `/tickets` | — (list is `/my-deals`) | Live list | **Missing** as path | — | Supporting | Nav “Deals” → `/my-deals`; matches `/tickets/*` for active state only |
| `/tickets/[id]` | `src/app/(shopper)/tickets/[id]/page.tsx` | Live | **Gated** (auth) | Show code at counter | Critical | — |
| `/merchant/onboarding` | — | Alias? | **Missing** | — | — | Canonical is `/merchant/onboard` |
| `/merchant/onboard` | `src/app/merchant/onboard/page.tsx` | Live | **Live** / **Gated** | Submit shop | Critical | `?shop=` prefill ✅ |
| `/merchant/redeem` | `src/app/merchant/(app)/redeem/page.tsx` | Live | **Gated** (merchant) | Confirm redemption | Critical | Staff without `can_verify` gated |
| `/merchant/deals` | `src/app/merchant/(app)/deals/page.tsx` | Live | **Gated** | Manage deals | Critical | — |
| `/merchant/deals/new` | `src/app/merchant/(app)/deals/new/page.tsx` | Live | **Gated** | Create deal | Critical | Zero-balance + deal-limit SQL |
| `/merchant/wallet` | `src/app/merchant/(app)/wallet/page.tsx` | Live | **Gated** | View balance/arrears | Critical | — |
| `/merchant/topup` | `src/app/merchant/(app)/topup/page.tsx` | Live (Stripe P1) | **Gated** + **Blocked** STK | Send STK / Pay with card | Critical | UI primary = STK; Stripe is secondary ghost |
| `/merchant/alerts` | `src/app/merchant/(app)/alerts/page.tsx` | Live | **Gated** | Derived wallet/deal alerts | Supporting | Not a push inbox |
| `/merchant/staff` | `src/app/merchant/(app)/staff/page.tsx` | Live | **Gated** (owner) | Manage staff perms | Supporting | Non-owners see owner-only gate |
| `/agent` | `src/app/agent/page.tsx` | Live | **Gated** (agent\|admin) | Agent KPIs / leads | Supporting | Layout `requireAgentPage` |
| `/agent/leads` | `src/app/agent/leads/page.tsx` | Live | **Gated** | Lead list | Supporting | — |
| `/agent/leads/[id]` | `src/app/agent/leads/[id]/page.tsx` | Live | **Gated** | Lead detail / link | Supporting | — |
| `/founder` | `src/app/founder/page.tsx` | Live | **Gated** (admin role) | KPI dashboard | Supporting | No separate founder role |
| `/founder/reports` | — | Planned / Missing | **Missing** | — | Deferrable | No page under `founder/` except root |
| `/admin` | `src/app/admin/page.tsx` | Live | **Gated** | Pending merchant queue | Critical | — |
| `/admin/redemptions/[id]` | `src/app/admin/redemptions/[id]/page.tsx` | Live | **Gated** | Dispute / fee reverse | Critical | — |
| `/admin/support` | `src/app/admin/support/page.tsx` | Live | **Gated** | `agent_tasks` queue | Supporting | — |
| `/admin/billing` | `src/app/admin/billing/page.tsx` | Live | **Gated** | Plans + trial cap line | Critical (trial E2E) | Cap RPC wired ✅ |
| `/admin/deals` | `src/app/admin/deals/page.tsx` | Live | **Gated** / thin | Moderation via fraud signals | Supporting | No shopper report-deal source |

### Auth guards (middleware vs layout)

| Surface | Guard |
|---|---|
| Global | `src/middleware.ts` — Clerk **or** Supabase session refresh only; **no role ACL** |
| Merchant app | `merchant/(app)/layout.tsx` → `getMerchantContext()` → redirect login / `/merchant` |
| Admin | `admin/layout.tsx` → `requireAdminPage()` (`role === "admin"`) |
| Agent | `agent/layout.tsx` → `requireAgentPage()` (`agent` \| `admin`) |
| Founder | `founder/layout.tsx` → `requireFounderPage()` (**same as admin**) |

---

## Product truths (code evidence)

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | verify-phone blocks email-only at claim | **Held** | API 403 `phone_required` before RPC: `api/redemptions/route.ts:25-40`; client redirect: `claim-flow.tsx:72-77` |
| 2 | Feed order Flash → Priority → third | **Held in data; UI copy differs** | Locked: `deal-list-controls.ts:10-12`. UI titles: Flash rail “Top picks near you”, boosted “Neighbourhood favourites”, **third = “Deals near me”** (`feed/page.tsx:139-185`). Locked name for #3 = **All Active Deals** |
| 3 | browse/map separate from ranked feed | **Held** | `browse/page.tsx` flat list + `DEFAULT_BROWSE_SORT`; `map/page.tsx` dedicated; feed uses `DEFAULT_FEED_SORT = "featured"` |
| 4 | deals/[id] one summed YOU PAY | **Held** | `pricing.ts` YOU PAY = price + extras; detail shows single `KES {pay}` (`deals/[id]/page.tsx:133-140`) |
| 5 | tickets/[id] countdown + 15-min grace + expired | **Held** | Claim sets `expires_at = deal.expires_at + 15min` (SQL); live timer `claimed-code.tsx:30-56`; expired copy `tickets/[id]/page.tsx:142-160` |
| 6 | tickets nav = “Deals” not “Saved” | **Held** | `bottom-bars.tsx:67-70` label `"Deals"` → `/my-deals` |
| 7 | redeem resolve-then-charge; KES 30 before take | **Held** | `redeem-keypad.tsx:16-21,103-111,268-334`; `FeeDisclosure` before Confirm |
| 8 | staff without permission → gate + who can fix | **Held** | `redeem-keypad.tsx:209-216` “Ask the shop owner to enable it in Staff.” |
| 9 | wallet arrears; redeem while owing; settle on top-up | **Held** | Wallet UI `wallet/page.tsx:102-109`; fee path `deduct_success_fee_or_record_arrears`; settle migration `20260721120000_topup_settles_arrears_first.sql` |
| 10 | topup Stripe P1; M-Pesa not live by default | **Partial / UI drift** | Stripe Checkout: `api/topup/stripe/route.ts`. STK: `api/topup` + IntaSend. **UI primary CTA is “Send STK push”**, card is ghost (`topup-flow.tsx:194-218`) — contradicts “Stripe phase 1” framing |
| 11 | ranking = verified redemptions not stars | **Held** | `lockedStandardOrder` + `verified_counts_by_merchant` in `data.ts` / `deal-list-controls.ts:179-185` |
| 12 | shops hidden until approved | **Held** (via `status`) | Public predicate `status='active' AND is_visible AND NOT shadow_banned` (`data.ts:185-224`). Approve sets `status='active'` (`activate_merchant`). Pending never passes browse |
| 13 | Elite trial optional at approval; fee reversal note+audit | **Held** | Approve checkbox `grantEliteTrial`; cap enforced SQL. Reversal: note required `reverse-fee/route.ts:34-40` + `fee_reversals` audit (`fee_reversal_test.sql`) |
| 14 | verify-anyway on location mismatch | **Redeem-and-dispute (not hard reject)** | UI: Confirm with override **or** Reject (`redeem-keypad.tsx:304-337`). SQL success path still charges fee + sets `disputed` + `dispute_review` (`guardian_v1.sql` clear\|flag). Guardian **hard_block** is the hard decline (no fee) — separate from geofence mismatch |
| 15 | Elite 2 active deals | **Held** | `enforce_deal_limit()`: standard 1 / elite 2 (`20260630231915…sql:318-343`) |
| 16 | `/merchants?shop=` prefill; admin approve notice/cap | **Held** | Prefill `onboard/page.tsx:13-22`; `/merchants` pushes `?shop=`; approve notice + cap line `merchant-admin-actions.tsx` + `/admin/billing` via `elite_trial_cap_status` |
| 17 | `elite_trial.ts` present and used | **Held** | `src/lib/elite-trial.ts`; imported by admin merchants actions + billing |
| 18 | Playwright scaffolding / golden path | **Authored, inert** | `e2e/golden-path.spec.ts`, `playwright.config.ts`, `.github/workflows/e2e.yml` opt-in; self-skips without secrets (`docs/ops/e2e-golden-path.md`) |

---

## Money path / verify-anyway (deep)

1. **Claim** → phone gate → `claim_deal` → OTP + `amount_kes` snapshot + expiry = deal end + 15m.  
2. **Preflight** (resolve only) → `/api/redemptions/preflight` — no fee.  
3. **Disclose** → KES 30 + Collect from shopper + optional location warning.  
4. **Confirm** → `verify_redemption`: clear/flag (+ merchant override on geofence) → **success** + fee charged\|owed\|unknown; soft_block → held; hard_block → failed.  
5. **Wallet zero** never blocks verify (verify-anyway for balance); only blocks **new deal create**.

---

## Playwright / CI status

| Artifact | Status |
|---|---|
| `maanta-app/e2e/golden-path.spec.ts` | Present; skips unless `E2E_*` set |
| `maanta-app/playwright.config.ts` | Present |
| `.github/workflows/e2e.yml` | Opt-in; requires `E2E_BASE_URL` + env secrets; refuses prod host |
| SQL golden path | `supabase/tests/golden_path_test.sql` + money-path suites — CI via `db-verify` |

---

## Top gaps for a founder browser E2E

1. No dedicated non-prod Playwright env (tracker E14) — suite inert.  
2. `/contact` is UI-only.  
3. `/tickets` list path missing (use `/my-deals`).  
4. `/founder/reports` missing.  
5. Top-up UI leads with M-Pesa STK while launch rail is Stripe sandbox.  
6. Feed marketing titles ≠ locked section names (behavior OK).  
7. Prod apply of 07-30 migrations still human-owned (truth-audit FU-2).
