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
| Field agent | `agent` | — | — | — | — | ✅ |
| Co-founder | `cofounder` | — | — | — | ✅ | ✅ (read-only) |
| Admin / founder | `admin` | ✅ | — | ✅ | ✅ | ✅ |

**Founder/co-founder:** Full guardian uses `admin`. Executive co-founder uses `cofounder` — `/founder` + read-only `/agent` leads; no `/admin/*` or payout edits. See `docs/ops/access-matrix.md`.

## Page guards

| Guard | File | Allowed roles |
|---|---|---|
| `requireAdminPage` / `requireAdminApi` | `src/lib/admin.ts` | `admin` |
| `requireFounderPage` | `src/lib/founder.ts` | `admin`, `cofounder` |
| `getMerchantContext` | `src/lib/merchant.ts` | `merchant_admin`, `merchant_staff` |
| Agent pages | inline + `src/lib/agent.ts` | `agent`, `admin`, `cofounder` |
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
