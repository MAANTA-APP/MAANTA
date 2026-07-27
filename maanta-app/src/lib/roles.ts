import type { AppUser } from "@/lib/data";

export type AppRole = AppUser["role"];

export function isAdminRole(role: string): boolean {
  return role === "admin";
}

/** Full platform ops — approvals, disputes, payouts, billing. */
export function canAccessAdminConsole(role: string): boolean {
  return role === "admin";
}

/** Executive dashboard — aggregated KPIs, no per-ticket money actions. */
export function canAccessFounderDashboard(role: string): boolean {
  return role === "admin" || role === "cofounder";
}

/** Field console — leads, onboarding attribution, churn outreach. */
export function canAccessAgentConsole(role: string): boolean {
  return role === "agent" || role === "admin" || role === "cofounder";
}
