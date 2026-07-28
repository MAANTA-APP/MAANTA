# Skills: Role & permissions

Last updated: 2026-07-26 · Status: **shipped in code**.

## Role source of truth

Roles live in **`public.users.role`** (Postgres CHECK constraint). Clerk provides authentication only — there is **no** Clerk `publicMetadata.role`.

Provisioning: `ensureAppUser()` in `src/lib/auth.ts` creates new users as `customer`. Role changes require an admin or `service_role`.

## Roles

| Role | DB value | Shopper UI | Merchant UI | Admin | Founder | Agent |
|---|---|---|---|---|---|---|
| Shopper | `customer` | ✅ | — | — | — | — |
| Merchant owner | `merchant_admin` | ✅ (if also shops) | ✅ | — | — | — |
| Merchant staff | `merchant_staff` | — | ✅ (scoped) | — | — | — |
| Field agent | `agent` | — | — | partial | — | ✅ |
| Admin / founder | `admin` | ✅ | — | ✅ | ✅ | ✅ |

**Founder/co-founder:** Launch uses the `admin` role. The `/founder` dashboard is a read-focused executive view; destructive ops remain in `/admin/*`. A separate `founder` enum value is deferred until co-founder access needs to be narrower than full admin.

## Page guards

| Guard | File | Allowed roles |
|---|---|---|
| `requireAdminPage` / `requireAdminApi` | `src/lib/admin.ts` | `admin` |
| `requireFounderPage` / `requireFounderApi` | `src/lib/founder.ts` | `admin` |
| `getMerchantContext` | `src/lib/merchant.ts` | `merchant_admin`, `merchant_staff` |
| Agent pages | inline in `agent/layout.tsx` | `agent`, `admin` |
| Claim gate | `currentUserHasVerifiedPhone()` | any signed-in user with verified phone |

## RLS bridge

`current_user_id()` and `current_user_role()` resolve from the Clerk JWT `sub` → `users.clerk_user_id` (migration `20260720140000_clerk_third_party_auth.sql`).

Self-role escalation is blocked by trigger `prevent_self_role_escalation` unless caller is `service_role` or `admin`.

## Route map (internal)

```
/founder          — executive dashboard (admin only)
/admin/*          — ops console (admin only)
/agent/*          — field leads (agent + admin)
/merchant/(app)/* — merchant console
```

## Provisioning founders

```sql
UPDATE public.users SET role = 'admin' WHERE email = 'founder@example.com';
```

Or use the rehearsal seed accounts documented in `/demo` and `supabase/seed/node0_rehearsal_seed.sql`.
