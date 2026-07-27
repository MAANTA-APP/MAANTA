# Access matrix — Node 0 rehearsal

Last updated: 2026-07-27

Source of truth for route guards: `src/lib/roles.ts` and `docs/skills/role-permissions.md`.

**Phone auth:** global E.164 at login and claim verification; role routing uses `public.users.role` only — not phone prefix. See `docs/ops/global-rollout.md`.

## Role summary

| Role | DB value | Default landing after login |
|---|---|---|
| Shopper | `customer` | `/feed` |
| Merchant owner | `merchant_admin` | `/merchant/redeem` (if active) or `/merchant` (pending) |
| Merchant staff | `merchant_staff` | `/merchant/redeem` |
| Field agent | `agent` | `/agent` |
| Co-founder | `cofounder` | `/founder` (recommended) |
| Admin / founder | `admin` | `/admin` |
| Support (rehearsal) | `admin` | `/admin/redemptions` |

## Route access

| Route / surface | Shopper | Merchant | Agent | Cofounder | Admin |
|---|---|---|---|---|---|
| `/feed`, `/browse`, `/map` | ✅ | ✅ | — | — | ✅ |
| `/merchant/(app)/*` | — | ✅ own shop | — | — | — |
| `/admin/*` | — | — | — | ❌ | ✅ |
| `/founder` | — | — | — | ✅ read-only KPIs | ✅ |
| `/agent/*` | — | — | ✅ writes need agent row | ✅ read-only leads | ✅ |
| `/agent/leads/new` | — | — | ✅ | ❌ | ✅ |

## Data visibility by scenario

### Redemption dispute (Scenario A)

| Data | Shopper | Merchant A | Support (admin) | Cofounder | Agent |
|---|---|---|---|---|---|
| Own OTP / ticket | ✅ | — | — | — | — |
| OTP at verify keypad | — | ✅ (entered by shopper) | — | — | — |
| Masked shopper phone at keypad | — | ✅ | — | — | — |
| Redemption list (own merchant) | — | ✅ status + fee | — | — | — |
| Full OTP in admin detail | — | — | ✅ | ❌ | ❌ |
| Shopper email / masked phone | — | — | ✅ | ❌ | ❌ |
| Fee reversal action | — | — | ✅ | ❌ | ❌ |
| Aggregated fee revenue (7d) | — | — | — | ✅ `/founder` | ✅ |

### Merchant lifecycle (Scenario B)

| Action | Waitlist merchant | Admin | Cofounder | Agent |
|---|---|---|---|---|
| See pending banner | ✅ | — | ✅ count on `/founder` | — |
| Approve merchant | ❌ | ✅ | ❌ | ❌ |
| View all leads | — | — | ✅ read-only | ✅ own leads |
| Capture new lead | — | — | ❌ | ✅ |
| Create live deals | ❌ while pending | — | — | — |

### Churn-risk (Scenario C)

| Action | Merchant C | Agent | Cofounder | Admin |
|---|---|---|---|---|
| Churn lifecycle banner | ✅ | — | — | — |
| Churn outreach task | — | ✅ via leads | ✅ task count | ✅ `/admin/support` |
| Close / suspend merchant | — | ❌ | ❌ | ✅ |

## Intentional trade-offs

- **Support uses `admin` role** — same privileges as guardian; separate login is for rehearsal audit only.
- **Cofounder sees platform leads read-only** — cannot capture leads or approve merchants.
- **Founder dashboard is aggregated** — no per-redemption OTP codes.
- **Merchant redemptions list** — no shopper PII (by design).

## Guard implementation

| Guard | File | Allowed roles |
|---|---|---|
| `requireAdminPage` | `src/lib/admin.ts` | `admin` |
| `requireFounderPage` | `src/lib/founder.ts` | `admin`, `cofounder` |
| `requireAgentPage` | `src/lib/agent.ts` | `agent`, `admin`, `cofounder` |
| `getMerchantContext` | `src/lib/merchant.ts` | `merchant_admin`, `merchant_staff` |
