# Skills: Founder-role split — audit and extraction path

Last updated: 2026-07-29 · Status: **audit complete, scaffolding shipped, cutover deferred**

Companion to `docs/skills/role-permissions.md`. This is the record of what
founder/co-founder accounts can actually do today, and the smallest safe path
to a narrower founder privilege model when we decide to cut over.

## 1. What founders inherit today

Founders and the co-founder are provisioned as **`public.users.role = 'admin'`**.
There is no `founder` value in the role CHECK constraint, no Clerk metadata
role, and no per-capability table. Consequences:

| Surface | Guard | Founder reaches it? |
|---|---|---|
| `/founder` executive dashboard | `requireFounderPage` (`src/lib/founder.ts`) | ✅ intended |
| `/admin/*` full ops console | `requireAdminPage` (`src/lib/admin.ts`) | ✅ **inherited, not intended** |
| `/api/admin/*` every admin route | `requireAdminApi` | ✅ **inherited, not intended** |
| `/agent/*` field console | `hasAgentConsoleAccess` (`src/lib/roles.ts`) | ✅ inherited |
| RLS `current_user_role() = 'admin'` policies | Postgres | ✅ inherited |
| `prevent_self_role_escalation` trigger | Postgres | **bypassed** — admins may change roles |

So "founder" today is not a role at all: it is an admin account with an extra
dashboard. The co-founder is byte-for-byte identical to the founder.

## 2. Sensitive powers bundled into the shared `admin` role

Ordered by blast radius. Every one of these is reachable by any account that can
open `/founder`.

| # | Power | Route / file | Why it's sensitive |
|---|---|---|---|
| 1 | **Success-fee reversal** | `POST /api/admin/redemptions/[id]/reverse-fee` → RPC `reverse_success_fee` | Moves real money back into a merchant wallet. Mandatory decision note; audited in `fee_reversals` + `admin_ops_log`. The single most dangerous power in the product. |
| 2 | **Merchant approval** | `POST /api/admin/merchants/[id]/approve` | Puts a shop live at Node 0; gates who can charge shoppers. |
| 3 | **Plan / tier override** | `POST /api/admin/plans/[id]` | Grants Elite (KES 3,500/mo value) or moves a trial. Frozen-rule surface. |
| 4 | **Merchant ops writes** | `POST /api/admin/merchants/[id]/ops`, `.../location` | Suspends/reinstates a shop, moves its mall location. |
| 5 | **Guardian / fraud actions** | `POST /api/admin/fraud/[id]`, `/api/admin/redemptions/[id]/release`, `.../appeal` | Releases held redemptions, resolves disputes — money and merchant trust. |
| 6 | **Support override** | `POST /api/admin/support/[id]` | Force-resolves a shopper/merchant dispute. |
| 7 | **Deal moderation** | `POST /api/admin/deals/[id]` | Takes a live deal down. |
| 8 | **Role escalation via RLS** | direct `users.role` update under the admin bypass | An admin can mint another admin. |

The `/founder` dashboard itself is **read-only** (counts and KPI queries) plus
four shortcut links into `/admin/*`. Nothing on `/founder` writes.

## 3. Assessment — should we split now?

**No, not this pass.** The split is a database migration (a new value in the
`users.role` CHECK constraint), an RLS review of every policy that tests
`current_user_role() = 'admin'`, and a re-provisioning of live founder accounts.
That is a cutover with production-auth risk, and the review's brief is explicit
about not over-engineering a role we aren't ready to switch to today.

The concrete cost of waiting is bounded and known: two accounts (founder,
co-founder) hold powers 1–8 above rather than only the read dashboard. Both are
audited — every reverse-fee and admin op writes to `admin_ops_log` with the actor's
user id — so the risk is *unnecessary privilege*, not *unattributable action*.

## 4. What shipped instead (scaffolding, behaviour unchanged)

`src/lib/roles.ts` is the new single home for role predicates:

```ts
export const OPERATOR_ROLES     = ["admin"];          // /admin/* power set
export const FOUNDER_ROLES      = ["admin"];          // /founder dashboard
export const AGENT_CONSOLE_ROLES = ["agent", "admin"]; // /agent/*
isOperator(user) · hasFounderAccess(user) · hasAgentConsoleAccess(user)
```

`FOUNDER_ROLES` and `OPERATOR_ROLES` hold the same value today but are two
separate knobs on purpose. Before this change, `user.role !== "admin"` was
open-coded in eight places (`admin.ts`, `founder.ts`, `agent.ts`,
`/agent/page.tsx`, `/agent/leads/page.tsx`, `/agent/leads/new/page.tsx`,
`/api/leads/route.ts`), so narrowing founder access meant finding all of them.
Now it is one file. `src/lib/__tests__/roles.test.ts` pins the current
allow-lists, so a future split shows up as a deliberate test change.

`AppRole` was also defined twice (`src/lib/auth.ts` and `src/lib/data.ts`);
both now re-use the definition in `roles.ts`.

## 5. Extraction path when we do cut over

Smallest safe sequence, each step independently shippable:

1. **Migration** — add `'founder'` to the `public.users.role` CHECK constraint.
   Do **not** move any account yet. RLS policies that test
   `current_user_role() = 'admin'` keep working unchanged.
2. **Code** — `FOUNDER_ROLES = ["admin", "founder"]` in `src/lib/roles.ts`.
   `/founder` now admits both; `/admin/*` still admits only `admin`. This is the
   only code change needed for a working founder role.
3. **RLS review** — for each policy that tests `= 'admin'`, decide read vs write.
   The `/founder` dashboard reads `users`, `deals`, `redemptions`,
   `merchant_transactions`, `agent_tasks`, `merchants` — grant those to
   `'founder'` as SELECT-only policies. Grant no write policy.
4. **Provision the co-founder as `founder`** first (the narrower, lower-risk
   account) and verify `/founder` works and `/admin` redirects. Keep the
   founder on `admin` until step 5 is agreed.
5. **Decide the founder's own level.** Two defensible end states:
   - *Founder = `founder` + a break-glass `admin` login* (recommended: least
     privilege by default, escalation is a deliberate act with its own audit
     trail); or
   - *Founder stays `admin`, co-founder is `founder`* (simplest, but leaves
     power 1 — fee reversal — on the everyday account).
6. **Docs + seeds** — update `docs/skills/role-permissions.md`,
   `docs/ops/test-accounts.md` and `supabase/seed/node0_ops_personas_seed.sql`.

Explicitly **out of scope** for that cutover: a per-capability permission table.
Powers 1–8 are few enough that a second role value covers the real need; a
capability matrix is the right answer only once support staff need slices of
admin that founders don't have.

## 6. Guardrails to keep in the meantime

- Fee reversal keeps its mandatory decision note (route + RPC + DB test).
- Every admin op keeps writing `admin_ops_log` via `logAdminOp`.
- `e2e/role-access.spec.ts` asserts the agent role **cannot** reach `/admin`,
  `/admin/redemptions` or `/founder` — the negative half of the model.
- Nothing on `/founder` may become a write surface without revisiting this doc;
  a founder-only write is exactly what would make step 5 urgent.
