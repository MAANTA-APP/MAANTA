# Skills: Role & permissions

Last updated: 2026-08-07 · Status: **shipped in code and live on production** —
the `cofounder` CHECK was applied 2026-08-05 and read back (drift **D69**,
closed; ledger version `20260804010000` matches the repo filename). No user
holds the role. The DB policy layer for its narrower-than-admin scope is
**written and repo-verified but not yet applied to production** — drift
**D74** (pending-deploy since 2026-08-07):
`20260807161000_cofounder_read_policies.sql` adds SELECT-only policies on the
enumerated read surface; a human applies it (and reads it back) before the
role is ever assigned.

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

The DB layer now expresses the read scope (drift **D74**, repo-side done
2026-08-07): `20260807161000_cofounder_read_policies.sql` adds SELECT-only
**standalone** policies for `cofounder` on exactly the tables the two consoles
read — `users`, `merchants`, `deals`, `redemptions`, `merchant_transactions`,
`agent_tasks` (the `/founder` dashboard) and `leads`, `agents` (the `/agent/*`
read surface) — deliberately without touching any existing policy
(`leads_agent` is `FOR ALL`; widening it would grant lead writes).
`supabase/tests/cofounder_role_test.sql` asserts the policy set matches that
list exactly and is SELECT-only, behaviorally checks read-yes/write-no/
fraud-events-dark under `SET ROLE authenticated`, and keeps the
self-promotion check. **Production has not applied this migration yet** — a
sweep of live `pg_policies` still finds zero objects referencing the role
(last verified 2026-08-05). D74 closes when a human applies
`20260807161000` and reads back the eight policies.

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
assignment is founder-held (Q14), and drift **D74** must close first — the
policy-layer migration `20260807161000_cofounder_read_policies.sql` exists in
the repo but production has not applied it (pending-deploy).

Or use the rehearsal seed accounts documented in `/demo` and `docs/ops/test-accounts.md`.
