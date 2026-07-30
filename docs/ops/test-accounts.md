# Test accounts — Node 0 rehearsal personas

Last updated: 2026-07-29

All accounts sign in with **email OTP** at `/login`. Codes land in the founder inbox via Gmail plus-addressing (`aragagency+*@gmail.com`). No passwords are set.

Role capability matrix: `docs/skills/role-functionality-review-2026-07-29.md`.

Apply seeds in order:

1. `maanta-app/supabase/seed/node0_rehearsal_seed.sql`
2. `maanta-app/supabase/seed/node0_ops_personas_seed.sql`

After first Clerk sign-in, `ensureAppUser()` links `clerk_user_id` to the seeded `public.users` row. If a new Clerk user is created instead, run:

```sql
UPDATE public.users
SET clerk_user_id = '<clerk_sub>'
WHERE email = '<account email>';
```

## Merchant personas

| Label | Email | Role | Merchant ID | Shop | Lifecycle stage |
|---|---|---|---|---|---|
| **Merchant A** — high-performing | `aragagency+nuur@gmail.com` | `merchant_admin` | `c0000000-0000-4000-a000-000000000001` | Nuur Fashion House | Live (Elite, 2 deals, redemption history) |
| **Merchant B** — new / onboarding | `aragagency+bilan@gmail.com` | `merchant_admin` | `c0000000-0000-4000-a000-000000000002` | Bilan Beauty & Cosmetics | Onboarding (approved 5 days ago, 2 deals, KES 20 wallet) |
| **Merchant C** — churn-risk | `aragagency+churn@gmail.com` | `merchant_admin` | `c0000000-0000-4000-a000-000000000004` | Hassan Old Town Fabrics | Churn-risk (no live deals, last deal ended 45+ days ago) |
| **Waitlist** — pre-approval | `aragagency+macmacaan@gmail.com` | `merchant_admin` | `c0000000-0000-4000-a000-000000000003` | Macmacaan Sweets & Café | Waitlist (`status = pending`) |

### Recommended merchant routes

| Persona | Start here | Then explore |
|---|---|---|
| Merchant A | `/merchant/dashboard` | `/merchant/deals`, `/merchant/redeem` (OTP `431977`), `/merchant/redemptions` |
| Merchant B | `/merchant/dashboard` | `/merchant/deals`, `/merchant/wallet` (low balance gate), `/merchant/deals/new` |
| Merchant C | `/merchant/deals` | `/merchant/dashboard` (inactive empty state), `/merchant/support` |
| Waitlist | `/merchant` | Pending banner on `/merchant/dashboard` after sign-in |

### Merchant staff (verify-scoped)

Rehearsal staff rows live in `supabase/seed/test_accounts_maanta_2026_07.sql`
(`merchant.a.staff@maanta.app` / `merchant.b.staff@maanta.app`, default
**verify-only**). Invite a staff member from Merchant A → `/merchant/staff/new`
(defaults: verify on, deals/top-up/purchase off) to exercise scoped UI.

| Check | Expect |
|---|---|
| `/merchant/redeem` without `can_verify` | Deny copy |
| `/merchant/deals/new` without `can_deals` | Deny copy |
| `/merchant/topup` / wallet CTA without `can_topup` | Deny / hidden CTA |
| `/merchant/staff` as staff | Redirect / hidden from More |

## Ops personas

| Label | Email | Role | Agent profile | Access |
|---|---|---|---|---|
| **Admin / founder / co-founder** | `aragagency@gmail.com` | `admin` | — | `/admin/*`, `/founder`, `/agent/*` (no separate founder DB role) |
| **Support / disputes** | `aragagency+support@gmail.com` | `admin` | — | `/admin/redemptions`, `/admin/support`, `/admin/merchants` |
| **Field agent** | `aragagency+agent@gmail.com` | `agent` | `g0000000-0000-4000-a000-000000000001` | `/agent`, `/agent/leads`, lead capture |

There is no separate `support`, `founder`, or `cofounder` DB role — execs and
disputes specialists use `admin` with dedicated logins for audit separation.

### Recommended ops routes

| Persona | Start here | Then explore |
|---|---|---|
| Admin | `/admin` | `/admin/merchants` (approve Macmacaan), `/admin/redemptions` (dispute seed), `/founder` |
| Support | `/admin/redemptions` | `/admin/redemptions/[id]` (merchant override dispute), `/admin/support` |
| Agent | `/agent` | `/agent/leads` (Hassan churn lead), `/agent/leads/new` |

## Shopper (control)

| Email | Role | Landing |
|---|---|---|
| `aragagency+shopper@gmail.com` | `customer` | `/feed` |

## Demo index

Public persona list (no auth): `/demo`

## Clerk notes

- Interactive browser testing needs valid Clerk keys for instance `cheerful-sailfish-3`.
- Placeholder Clerk keys allow `curl` SSR but block real browser handshakes.
- Roles are **not** in Clerk metadata — they live in `public.users.role` only.
