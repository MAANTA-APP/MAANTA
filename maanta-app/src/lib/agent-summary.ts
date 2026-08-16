/**
 * Field-agent performance arithmetic, kept out of the page so it can be tested.
 *
 * The admin agents list already computed one of these numbers inline (converted
 * leads in the last seven days) and the detail screen needs the same figure plus
 * several more. Two implementations of "this agent's week" would drift, and the
 * one on the list is the one an admin compares against the target.
 */

export type LeadStatus = "locked" | "converted" | "expired" | "lost";

export type AgentLead = {
  status: string;
  created_at: string;
};

export type AgentSummary = {
  total: number;
  locked: number;
  converted: number;
  expired: number;
  lost: number;
  /** Converted leads created inside the trailing 7 days — what the target is read against. */
  convertedThisWeek: number;
  /** Converted over total, 0–1. Null when there are no leads at all rather than 0, so the
   *  screen can say "no leads yet" instead of asserting a 0% conversion rate. */
  conversionRate: number | null;
};

const WEEK_MS = 7 * 24 * 3600_000;

export function summariseAgentLeads(leads: AgentLead[], now: number): AgentSummary {
  const weekStart = now - WEEK_MS;
  const s: AgentSummary = {
    total: leads.length,
    locked: 0,
    converted: 0,
    expired: 0,
    lost: 0,
    convertedThisWeek: 0,
    conversionRate: null,
  };

  for (const l of leads) {
    const status = l.status as LeadStatus;
    if (status === "locked") s.locked += 1;
    else if (status === "converted") s.converted += 1;
    else if (status === "expired") s.expired += 1;
    else if (status === "lost") s.lost += 1;

    if (status === "converted" && Date.parse(l.created_at) >= weekStart) {
      s.convertedThisWeek += 1;
    }
  }

  if (s.total > 0) s.conversionRate = s.converted / s.total;
  return s;
}

/**
 * Hours left on a lead's 48-hour lock, floored at 0.
 *
 * A lock whose clock has run out is not "locked -1h"; the row still carries
 * `status = 'locked'` until something expires it, so the screen says 0.
 */
export function lockHoursLeft(lockedUntil: string, now: number): number {
  return Math.max(0, Math.round((Date.parse(lockedUntil) - now) / 3600_000));
}
