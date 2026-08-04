/**
 * The role vocabulary, and who may reach which console.
 *
 * ## Why this file exists
 *
 * Before it, the role union was declared twice — `AppRole` in `src/lib/auth.ts`
 * and inline in `AppUser` in `src/lib/data.ts` — and every guard compared role
 * strings by hand in eleven places. Adding `cofounder` to a system shaped like
 * that means editing eleven call sites and hoping. Miss one on a read guard and
 * a co-founder gets a blank page; miss one on a *write* guard and they get an
 * action the role was defined not to have.
 *
 * So the union is declared once here, `auth.ts` and `data.ts` import it, and
 * access questions are asked as predicates rather than string comparisons. One
 * place to change, one place to test.
 *
 * ## Read and write are separate questions
 *
 * `/agent` is the surface where this matters. A co-founder may *look* at the
 * acquisition pipeline; they may not create or lock leads — that is field-rep
 * work, attributed to an `agents` row they do not have. A single
 * "can access the agent console" predicate cannot express that, and a guard that
 * cannot express a rule ends up enforcing it somewhere else, by accident.
 * `canViewAgentConsole` and `canWriteAgentLeads` are therefore distinct, and the
 * write path additionally requires an active `agents` row (see `agent.ts`).
 *
 * ## What this file is not
 *
 * It is not the enforcement point for anything that moves money. These
 * predicates gate *routes*. Database authority stays in RLS and in the RPCs —
 * `current_user_role() = 'admin'` in the policies does not match `cofounder`,
 * which is the intended posture and is asserted in
 * `supabase/tests/cofounder_role_test.sql`.
 */

/**
 * Every value `public.users.role` may hold.
 *
 * Kept in lockstep with the CHECK constraint in
 * `supabase/migrations/20260804010000_cofounder_role.sql` by
 * `__tests__/roles.test.ts`, which parses the migration and compares the two.
 * A role added to one and not the other fails that test rather than showing up
 * as a runtime redirect nobody can explain.
 */
export const APP_ROLES = [
  "customer",
  "merchant_admin",
  "merchant_staff",
  "agent",
  "admin",
  "cofounder",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/**
 * Human labels for the admin users list.
 *
 * Here rather than in the page because the page's map was keyed by hand: a new
 * role silently rendered as its raw DB value — `merchant_admin` in an operator's
 * table. `__tests__/roles.test.ts` requires an entry for every role, so that is
 * now a failing test rather than a shipped surface.
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  customer: "Customer",
  merchant_admin: "Merchant",
  merchant_staff: "Staff",
  agent: "Agent",
  admin: "Admin",
  cofounder: "Co-founder",
};

/**
 * Full platform ops — merchant approvals, disputes, fee reversals, payouts.
 *
 * Deliberately `admin` alone. Co-founder exists precisely to be narrower than
 * this; widening it here would make the role pointless.
 */
export function canAccessAdminConsole(role: string): boolean {
  return role === "admin";
}

/** Executive dashboard — aggregated launch metrics, no per-ticket money actions. */
export function canAccessFounderDashboard(role: string): boolean {
  return role === "admin" || role === "cofounder";
}

/** Read the acquisition pipeline: `/agent`, `/agent/leads`, a lead's detail. */
export function canViewAgentConsole(role: string): boolean {
  return role === "agent" || role === "admin" || role === "cofounder";
}

/**
 * Create or modify leads.
 *
 * Narrower than {@link canViewAgentConsole} on purpose: `cofounder` is absent.
 * Lead writes are attributed to an `agents` row, and the API guard requires an
 * *active* one on top of this check.
 */
export function canWriteAgentLeads(role: string): boolean {
  return role === "agent" || role === "admin";
}
