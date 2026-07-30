# Skills: Role & permissions

Last updated: 2026-07-29 · Status: **shipped in code**.

Full persona walkthrough: `docs/skills/role-functionality-review-2026-07-29.md`.

## Role source of truth

Roles live in **`public.users.role`** (Postgres CHECK constraint). Clerk provides authentication only — there is **no** Clerk `publicMetadata.role`.

Provisioning: `ensureAppUser()` in `src/lib/auth.ts` creates new users as `customer`. Role changes require an admin or `service_role`.

## Roles

| Role | DB value | Shopper UI | Merchant UI | Admin | Founder | Agent |
|---|---|---|---|---|---|---|
| Shopper | `customer` | ✅ | — | — | — | — |
| Merchant owner | `merchant_admin` | ✅ (URL reachable) | ✅ | — | — | — |
| Merchant staff | `merchant_staff` | — | ✅ (scoped) | — | — | — |
| Field agent | `agent` | — | — | — | — | ✅ |
| Admin / founder / co-founder | `admin` | ✅ (URL) | — | ✅ | ✅ | ✅ |

**Founder/co-founder:** Launch uses the `admin` role. The `/founder` dashboard is a read-focused executive view; destructive ops remain in `/admin/*`. A separate `founder` enum value is deferred until co-founder access needs to be narrower than full admin. Post-login bootstrap sends `admin` → `/admin` (Founder is linked from the admin sidebar).

## Merchant staff permissions

| Flag | DB default | Owner | Page / API |
|---|---|---|---|
| `can_verify` | `true` | always | `/merchant/redeem`, verify/preflight/reject APIs |
| `can_deals` | `false` | always | create/edit/archive/repost deal APIs + wizard |
| `can_topup` | `false` | always | `/merchant/topup` page + STK/Stripe APIs; wallet CTA hidden when false |
| `can_purchase` | `false` | always | boost create/move APIs |

Staff roster (`/merchant/staff`, `/api/staff`) is **owner-only**. Invite UI defaults match DB (verify-only).

## Page guards

| Guard | File | Allowed roles |
|---|---|---|
| `requireAdminPage` / `requireAdminApi` | `src/lib/admin.ts` | `admin` |
| `requireFounderPage` / `requireFounderApi` | `src/lib/founder.ts` | `admin` |
| `getMerchantContext` | `src/lib/merchant.ts` | `merchant_admin`, `merchant_staff` |
| `requireMerchant(permission)` | `src/lib/merchant-api.ts` | merchant ctx + staff flag |
| `requireAgentPage` / `requireActiveAgentApi` | `src/lib/agent.ts` | `agent` or `admin` (+ active `agents` row for writes) |
| Claim gate | `currentUserHasVerifiedPhone()` | any signed-in user with verified phone |

## RLS bridge

`current_user_id()` and `current_user_role()` resolve from the Clerk JWT `sub` → `users.clerk_user_id` (migration `20260720140000_clerk_third_party_auth.sql`).

Self-role escalation is blocked by trigger `prevent_self_role_escalation` unless caller is `service_role` or `admin`.

## Route map (internal)

```
/founder          — executive dashboard (admin only)
/admin/*          — ops console (admin only)
/agent/*          — field leads (agent + admin)
/merchant/(app)/* — merchant console (owner + staff)
/(shopper)/*      — shopper surfaces (default customer)
```

## Provisioning founders

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'founder@example.com';
```

Or use the rehearsal seed accounts documented in `/demo` and `docs/ops/test-accounts.md`.
