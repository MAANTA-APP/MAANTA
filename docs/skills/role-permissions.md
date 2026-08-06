# Skills: Role & permissions

Last updated: 2026-08-05 · Status: **shipped in code and live on production** —
the `cofounder` CHECK was applied 2026-08-05 and read back (drift **D69**,
closed; ledger version `20260804010000` matches the repo filename). No user
holds the role. Its narrower-than-admin scope is **app-enforced only** — no
database policy references `cofounder` — tracked as drift **D74** (open): add
the RLS/policy layer before the role is ever assigned.

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
and that a co-founder cannot promote itself to admin. Verified against
production 2026-08-05: a sweep of `pg_policies`, `pg_proc` and table grants
found zero objects referencing the role. That means every narrowing above is
**app-layer only** — drift **D74** requires a DB policy layer (and the
inversion of that test assertion) to land before the role is assigned to
anyone.

## Merchant staff permissions

| Flag | DB default | Owner | Page / API |
|---|---|---|---|
| `can_verify` | `true` | always | `/merchant/redeem`, verify/preflight/reject APIs |
| `can_deals` | `false` | always | create/edit/archive/repost deal APIs + wizard |
| `can_topup` | `false` | always | `/merchant/topup` page + STK/Stripe APIs; wallet CTA hidden when false |
| `can_purchase` | `false` | always | boost create/move APIs |

Staff roster (`/merchant/staff`, `/api/staff`) is **owner-only**. Invite UI defaults match DB (verify-only).

## Page guards

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

The `cofounder` statement fails with a CHECK violation on any database that has
not applied `20260804010000_cofounder_role.sql`. **As of 2026-08-05 production
has it** (D69 closed, verified by `pg_get_constraintdef` read-back), so the
statement would succeed there — which is exactly why it must not be run yet:
assignment is founder-held (Q14), and drift **D74** (the missing DB policy
layer) must close first.

Or use the rehearsal seed accounts documented in `/demo` and `docs/ops/test-accounts.md`.
