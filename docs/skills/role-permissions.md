# Skills: Role & permissions

Last updated: 2026-08-04 · Status: **shipped in code**; the `cofounder` role is
**pending-deploy** — see drift **D69**.

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
| Admin / founder | `admin` | ✅ (URL) | — | ✅ | ✅ | ✅ |
| Co-founder | `cofounder` | — | — | — | ✅ | ✅ read-only |

**Founder:** still runs on the `admin` role. The `/founder` dashboard is a
read-focused executive view; destructive ops remain in `/admin/*`. Post-login
bootstrap sends `admin` → `/admin` (Founder is linked from the admin sidebar).

**Co-founder:** `cofounder` is its own value in `public.users.role` as of
migration `20260804010000_cofounder_role.sql`. It reaches `/founder` and reads
`/agent/*`; it does **not** reach `/admin/*` and cannot create or link leads —
lead writes are attributed to an `agents` row a co-founder does not have. The
deferral recorded here until 2026-08-04 is closed: co-founder access is now
narrower than full admin, which was the stated condition for adding the value.

Adding the enum value grants nothing at the database level. RLS policies are
written as `current_user_role() = 'admin'` and do not match `cofounder`;
`supabase/tests/cofounder_role_test.sql` asserts that no policy names the role
and that a co-founder cannot promote itself to admin.

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
Every guard below asks a **predicate from `src/lib/roles.ts`** rather than
comparing role strings. That file is also the single declaration of the role
union — `auth.ts` and `data.ts` import it instead of restating it — and
`src/lib/__tests__/roles.test.ts` parses the migration to assert the union and
the CHECK constraint still agree.

| Guard | File | Predicate | Allowed roles |
|---|---|---|---|
| `requireAdminPage` / `requireAdminApi` | `src/lib/admin.ts` | `canAccessAdminConsole` | `admin` |
| `requireFounderPage` / `requireFounderApi` | `src/lib/founder.ts` | `canAccessFounderDashboard` | `admin`, `cofounder` |
| `getMerchantContext` | `src/lib/merchant.ts` | — | `merchant_admin`, `merchant_staff` |
| `requireMerchant(permission)` | `src/lib/merchant-api.ts` | — | merchant ctx + staff flag |
| `requireAgentPage` | `src/lib/agent.ts` | `canViewAgentConsole` | `agent`, `admin`, `cofounder` |
| `requireActiveAgentApi`, `POST /api/leads`, `/agent/leads/new` | `src/lib/agent.ts`, route, page | `canWriteAgentLeads` | `agent`, `admin` (+ active `agents` row for API writes) |
| Claim gate | `currentUserHasVerifiedPhone()` | — | any signed-in user with verified phone |

Read and write on `/agent` are separate predicates on purpose: a co-founder may
look at the pipeline and may not add to it.

## RLS bridge

`current_user_id()` and `current_user_role()` resolve from the Clerk JWT `sub` → `users.clerk_user_id` (migration `20260720140000_clerk_third_party_auth.sql`).

Self-role escalation is blocked by trigger `prevent_self_role_escalation` unless caller is `service_role` or `admin`.

## Route map (internal)

```
/founder          — executive dashboard (admin + cofounder)
/admin/*          — ops console (admin only)
/agent/*          — field leads (agent + admin; cofounder read-only)
/agent/leads/new  — lead capture (agent + admin)
/merchant/(app)/* — merchant console (owner + staff)
/(shopper)/*      — shopper surfaces (default customer)
```

## Provisioning founders

```sql
UPDATE public.users SET role = 'admin'     WHERE email = 'founder@example.com';
UPDATE public.users SET role = 'cofounder' WHERE email = 'cofounder@example.com';
```

The `cofounder` statement fails with a CHECK violation until
`20260804010000_cofounder_role.sql` has been applied to that database. On
production that apply is a human step — see `docs/ops/supabase-migrations.md` and
drift **D69**.

Or use the rehearsal seed accounts documented in `/demo` and `docs/ops/test-accounts.md`.
