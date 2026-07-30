# Surface parity matrix — 2026-07-30

One row per critical surface. **Status** uses the current-reality vocabulary
(`Synced` / `Backend leads` / `Frontend leads` / `Design ahead` / `Needs product decision` / `Blocked by env/ops`).

Design frame IDs reference `design/claim-and-till/` / PDF where known; else
`current-reality/frames.json`.

| Role | Route | Design frame | Frontend | Backend / API | SQL / DB | Primary action | Proven runtime rule | Verified states | Drift type | E2E | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Shopper | `/login` | — | `login/[[...sign-in]]` | Clerk / Supabase email | `users` | Sign in | Strategy toggle | signed-out SSR; Clerk handshake | Env for interactive | Critical | Synced / Blocked by env |
| Shopper | `/otp` | S2 | `otp/page` alias | → `/verify-phone` | — | Alias | Redirect | — | Route naming (fixed) | Deferrable | Synced |
| Shopper | `/verify-phone` | S2 | `verify-phone` | Clerk SMS; claim 403 | — | Verify phone | `phoneOtpEnabled` / `phone_required` | success dwell; rehearsal skip | Auth-mode | Critical | Synced / Rehearsal |
| Shopper | `/feed` | S1 | `feed/page` | `getLiveDeals` | deals, boost, RPC | Open deal | Featured locked order; no paused | empty / error / rails | Copy vs locked names | Critical | Synced (behavior) / Needs product decision (titles) |
| Shopper | `/browse` | Browse list | `browse/page` | `getLiveDeals` | deals | Filter list | `DEFAULT_BROWSE_SORT=nearest` | chips / favourites gate | — | Critical | Synced |
| Shopper | `/map` | — | `map/page` | `getLiveDeals` | lat/lng | Map pins | Separate from feed | list link → browse | Product: map vs Notion do-not-build | Supporting | Synced / Needs product decision |
| Shopper | `/deals/[id]` | 8g/8ae/8h | deals/[id], claim-flow | `POST /api/redemptions` | `claim_deal`, `you_pay_kes` | Claim | Live + not paused + phone | paused / ended / fully claimed / YOU PAY | Pause+grace fixed | Critical | Synced |
| Shopper | `/tickets` | — | tickets → my-deals | redirect | — | List | Alias | — | Naming | Supporting | Synced |
| Shopper | `/my-deals` | — | my-deals | redemptions read | redemptions | Open ticket | Auth | active / expired | List timer vs grace nuance | Supporting | Synced (minor list-timer lag OK after pilot) |
| Shopper | `/tickets/[id]` | 8i/8j | tickets/[id] | redemptions | +15m grace | Show code | Timer on `expires_at` | live / expired / redeemed | — | Critical | Synced |
| Merchant | `/merchant/onboarding` | — | alias | → onboard | — | Alias | Query preserved | — | Naming | — | Synced |
| Merchant | `/merchant/onboard` | Onboard | onboard | onboarding | merchants | Submit shop | Pending until admin | `?shop=` | — | Critical | Synced |
| Merchant | `/merchant/redeem` | 9k/9t/9l/9m | redeem-keypad | preflight+verify | `verify_redemption` | Confirm | Fee after confirm; verify-anyway | staff gate / mismatch / arrears | — | Critical | Synced |
| Merchant | `/merchant/deals` | 10b/10ab | deals | deals | limits, pause | Manage | Grace kept for till | paused chip | — | Critical | Synced |
| Merchant | `/merchant/deals/new` | Wizard | new-deal-wizard | `POST /api/deals` | zero-balance, limits | Create | 402 at zero | top-up CTA | Publish still clickable (API enforces) | Critical | Synced / Frontend leads slightly |
| Merchant | `/merchant/wallet` | Wallet | wallet | ledger | arrears | View | Arrears settle on top-up | low / owing | — | Critical | Synced |
| Merchant | `/merchant/topup` | Top-up | topup-flow | Stripe + STK | credit | Pay card | Stripe primary | STK if configured | — | Critical | Synced / Blocked STK env |
| Merchant | `/merchant/alerts` | 10x | alerts | derived | — | Read | Verify-anyway honest copy | low / expiring / boost ended | Copy fixed | Supporting | Synced |
| Merchant | `/merchant/staff` | Staff | staff | `/api/staff` | permissions | Manage | Owner-only | can_verify etc | — | Supporting | Synced |
| Admin | `/admin` | 11 | admin | approve | activate + trial | Approve | Optional trial + cap | notice / skip | — | Critical | Synced |
| Admin | `/admin/redemptions/[id]` | Dispute | redemptions/[id] | hold/release/reverse | fee_reversals | Dispute ops | Note required | hold / reverse | — | Critical | Synced |
| Admin | `/admin/support` | — | support | agent_tasks | agent_tasks | Override queue | — | — | — | Supporting | Synced |
| Admin | `/admin/billing` | 11j | billing | plans + cap RPC | elite_trial_cap | Trial/plan | Cap line | grace labels | — | Critical | Synced |
| Admin | `/admin/deals` | 11c | deals | fraud_events | fraud_events | Moderate | Flagged only | no reason taxonomy | Design-ahead reasons | Supporting | Backend leads / Design ahead |
| Agent | `/agent` | — | agent | KPIs | leads | Home | agent\|admin | lock chips | — | Supporting | Synced |
| Agent | `/agent/leads` | — | leads | `/api/leads` | 48h lock | List | Advisory lock | shop_locked | Attribution window PDP | Supporting | Synced / Needs product decision |
| Agent | `/agent/leads/[id]` | — | leads/[id] | link merchant | leads | Detail | Attribution label | — | No money effect | Supporting | Synced |
| Founder | `/founder` | — | founder | KPIs | aggregates | Dashboard | ≡ admin | links to admin | — | Supporting | Synced |
| Founder | `/founder/reports` | — | alias | → `/admin/reports` | — | Reports | Redirect | — | Naming fixed | Deferrable | Synced |
| Public | `/contact` | — | contact | **none** | — | Send | Client-only | fake success | UI promise | Deferrable | Design ahead |
