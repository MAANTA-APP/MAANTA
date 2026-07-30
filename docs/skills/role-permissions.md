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
| Merchant owner | `merchant_admin` | ✅ (if also shops) | ✅ | — | — | — |
| Merchant staff | `merchant_staff` | — | ✅ (scoped) | — | — | — |
| Field agent | `agent` | — | — | partial | — | ✅ |
| Admin / founder | `admin` | ✅ | — | ✅ | ✅ | ✅ |

**Founder/co-founder:** Launch uses the `admin` role. The `/founder` dashboard is a read-focused executive view; destructive ops remain in `/admin/*`. A separate `founder` enum value is deferred until co-founder access needs to be narrower than full admin — the full audit of what founders inherit today, and the step-by-step extraction path, is in **`docs/skills/founder-role-split.md`**.

## Role predicates (single source)

All guards resolve roles through **`src/lib/roles.ts`** — no guard open-codes a
`role !== "admin"` comparison any more:

| Predicate | Roles today | Used by |
|---|---|---|
| `isOperator` (`OPERATOR_ROLES`) | `admin` | `/admin/*` pages + APIs |
| `hasFounderAccess` (`FOUNDER_ROLES`) | `admin` | `/founder` |
| `hasAgentConsoleAccess` (`AGENT_CONSOLE_ROLES`) | `agent`, `admin` | `/agent/*`, `/api/leads` |

`FOUNDER_ROLES` and `OPERATOR_ROLES` hold the same value today but stay separate
constants deliberately: narrowing founder access is a one-file change.

## Page guards

| Guard | File | Allowed roles |
|---|---|---|
| `requireAdminPage` / `requireAdminApi` | `src/lib/admin.ts` | `admin` |
| `requireFounderPage` / `requireFounderApi` | `src/lib/founder.ts` | `admin` |
| `getMerchantContext` | `src/lib/merchant.ts` | `merchant_admin`, `merchant_staff` |
| Agent pages | `requireAgentPage` in `src/lib/agent.ts` (`agent/layout.tsx`) | `agent`, `admin` |
| Claim gate | `currentUserHasVerifiedPhone()` | any signed-in user with verified phone |

## Merchant staff permissions → UI

`merchant_staff` rows carry four booleans (`can_verify`, `can_deals`,
`can_topup`, `can_purchase`); owners implicitly hold all four
(`OWNER_PERMISSIONS` in `src/lib/merchant.ts`). **`src/lib/merchant-nav.ts`** is
the single mapping from those booleans to visible entry points:

| Surface | Permission | Hidden when absent |
|---|---|---|
| Redeem tab | `can_verify` | bottom-nav tab, dashboard quick action |
| Deals tab | `can_deals` | bottom-nav tab, "New deal" CTAs, dashboard quick action |
| Wallet tab + top-up | `can_topup` | bottom-nav tab, "Top up wallet" CTA, top-bar wallet link, dashboard quick action |
| Plan & billing | `can_purchase` | More row, Settings row, "Upgrade to Elite" CTA |
| Staff roster | owner only | More row, Settings row |

New invites default to **verify-only** in both the API (`/api/staff`) and the
invite wizard. Hiding is for clarity only — `requireMerchant("can_*")` in
`src/lib/merchant-api.ts` remains the authority on every write, and deep links
into a gated surface render a permission notice rather than a dead-end form.

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

## Update — 2026-07-29: archived-deals actions

`/merchant/deals/archived` renders Repost / Delete only with `can_deals`. Both
writes (`POST /api/deals/repost`, `DELETE /api/archive/[id]`) were already
`requireMerchant("can_deals")`; the UI now agrees with them.
