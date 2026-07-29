/**
 * Central role predicates for the four server-side guards
 * (`src/lib/admin.ts`, `src/lib/founder.ts`, `src/lib/agent.ts`, and the
 * merchant context in `src/lib/merchant.ts`).
 *
 * Roles live in `public.users.role` — Clerk carries authentication only, never
 * a role claim (see docs/skills/role-permissions.md).
 *
 * Why the lists below are separate even though two of them are identical
 * today: founder/co-founder access and raw operational admin power are
 * DIFFERENT concepts that launch happens to serve with the same `admin` row.
 * Keeping them as distinct constants means the future founder-role split is a
 * change to this file plus one migration, instead of a hunt for every
 * `role !== "admin"` string comparison. It changes no behaviour today.
 * The split plan is documented in docs/skills/founder-role-split.md.
 */

export type AppRole =
  | "customer"
  | "merchant_admin"
  | "merchant_staff"
  | "agent"
  | "admin";

type RoleBearer = { role: AppRole } | null | undefined;

/**
 * Roles holding the full operational admin power set: merchant approvals,
 * deal moderation, Guardian/fraud actions, plan overrides, support overrides
 * and — the most sensitive of them — success-fee reversal.
 */
export const OPERATOR_ROLES: readonly AppRole[] = ["admin"];

/**
 * Roles that reach the `/founder` executive dashboard. Identical to
 * OPERATOR_ROLES at launch: founders are provisioned as `admin`. A dedicated
 * `founder` role is added HERE first, then to the DB CHECK constraint.
 */
export const FOUNDER_ROLES: readonly AppRole[] = ["admin"];

/** Roles that reach the `/agent` field console. */
export const AGENT_CONSOLE_ROLES: readonly AppRole[] = ["agent", "admin"];

/** Full operational admin power (the `/admin` console and its APIs). */
export function isOperator(user: RoleBearer): boolean {
  return !!user && OPERATOR_ROLES.includes(user.role);
}

/** Executive/founder read access (the `/founder` dashboard). */
export function hasFounderAccess(user: RoleBearer): boolean {
  return !!user && FOUNDER_ROLES.includes(user.role);
}

/** Field-agent console access (leads, lead→merchant linking). */
export function hasAgentConsoleAccess(user: RoleBearer): boolean {
  return !!user && AGENT_CONSOLE_ROLES.includes(user.role);
}
