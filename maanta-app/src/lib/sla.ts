/**
 * D81 — the 72-hour support SLA clock (founder ruling 2026-08-09).
 *
 * The shopper-facing promise is "within 72 hours" (frozen 72-hour
 * dispute-resolution SLA, Decisions Log 2026-07-24). This module is the one
 * place that promise becomes a deadline, an aging state, and the literal D81
 * copy — rendered on the shipped operational surfaces only (11d held list,
 * 11e/11o support queue, 13e redemption detail). It never gates an action.
 *
 * Clock rules (binding, D81):
 *  - The clock starts when a case ENTERS its operational queue, not when the
 *    underlying redemption happened. Concretely: a held redemption's start is
 *    the immutable `guardian_events` overall soft_block row's `created_at`
 *    (NOT `redemptions.redeemed_at`, which defaults to claim time and is
 *    overwritten on approve-release); a support case's start is
 *    `agent_tasks.created_at`.
 *  - The deadline is exactly `openedAt + 72 hours`. Both are pure functions of
 *    `openedAt`, so reassignment, viewing, retrying, refreshing, or reopening
 *    the UI cannot reset them.
 *  - "Due soon" = deadline within 24 hours. That threshold is an internal
 *    warning only; the promise stays 72 hours and 24 never reaches a shopper.
 *
 * Display rule: N is whole hours, ceiling — every label reads as "within N
 * hours", matching the promise's own phrasing ("Due in 72 hours" at entry,
 * "Resolved in 72 hours" at an exactly-on-time close). States are decided on
 * the raw timestamps, never on the rounded N. Hours are always written out in
 * full — no truncated mobile forms.
 */

export const SUPPORT_SLA_HOURS = 72;
export const SUPPORT_SLA_DUE_SOON_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

export type SlaState =
  | "on_track"
  | "due_soon"
  | "overdue"
  | "resolved_on_time"
  | "resolved_late";

export type Sla = {
  state: SlaState;
  /** The literal D81 copy: "Due in N hours" / "Overdue by N hours" / "Resolved in N hours". */
  label: string;
  /** Exactly openedAt + 72 hours. */
  deadline: Date;
  /** The N in the label. */
  hours: number;
};

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** "1 hour" / "N hours" — hours are always written out, never truncated. */
export function slaHoursLabel(n: number): string {
  return `${n} ${n === 1 ? "hour" : "hours"}`;
}

/** The stable deadline: exactly 72 hours after the case entered its queue. */
export function slaDeadline(openedAt: string | Date): Date {
  return new Date(toDate(openedAt).getTime() + SUPPORT_SLA_HOURS * HOUR_MS);
}

/** Whole elapsed hours since queue entry (floor) — the 11e age line. */
export function slaAgeHours(openedAt: string | Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - toDate(openedAt).getTime()) / HOUR_MS));
}

/**
 * The D81 state contract. `now` is required (no wall-clock default) so server
 * components evaluate one render instant and tests stay fixed-time.
 */
export function computeSla(
  openedAt: string | Date,
  opts: { resolvedAt?: string | Date | null; now: Date }
): Sla {
  const opened = toDate(openedAt);
  const deadline = slaDeadline(opened);

  if (opts.resolvedAt != null) {
    const resolved = toDate(opts.resolvedAt);
    const hours = Math.max(0, Math.ceil((resolved.getTime() - opened.getTime()) / HOUR_MS));
    // On time means resolved WITHIN 72 hours — the boundary itself is on time.
    const onTime = resolved.getTime() <= deadline.getTime();
    return {
      state: onTime ? "resolved_on_time" : "resolved_late",
      label: `Resolved in ${slaHoursLabel(hours)}`,
      deadline,
      hours,
    };
  }

  const remainingMs = deadline.getTime() - opts.now.getTime();
  if (remainingMs <= 0) {
    const hours = Math.max(1, Math.ceil(-remainingMs / HOUR_MS));
    return { state: "overdue", label: `Overdue by ${slaHoursLabel(hours)}`, deadline, hours };
  }

  const hours = Math.ceil(remainingMs / HOUR_MS);
  return {
    state: remainingMs <= SUPPORT_SLA_DUE_SOON_HOURS * HOUR_MS ? "due_soon" : "on_track",
    label: `Due in ${slaHoursLabel(hours)}`,
    deadline,
    hours,
  };
}

/**
 * Resolution instant of an overridden agent task, from the audit line the 11e
 * override appends in the same update that completes it:
 * `[override by admin <id> at <ISO>]`. Fallback for rows whose best-effort
 * `admin_ops_log` write did not land; the first line is the completing one.
 * Returns null rather than guessing when no parseable line exists.
 */
export function resolvedAtFromAuditLine(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.match(/\[override by admin [^\]]+ at ([^\]]+)\]/);
  if (!match) return null;
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
