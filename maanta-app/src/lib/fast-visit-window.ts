/**
 * Fast Visit reward window — pure time math, shared by the shopper ticket
 * panel (client) and any server surface that states eligibility.
 *
 * The rule (founder brief, 2026-08-26): a shopper who physically arrives at
 * the merchant within 15 minutes of claiming earns Fast Visit ELIGIBILITY;
 * MAANTA Points are awarded only after staff verify the redemption. The
 * window is a REWARD window only — it is not claim expiry, not deal expiry,
 * not a redemption deadline. When it lapses the claim continues normally.
 *
 * The AUTHORITATIVE qualification is decided in the database AT ARRIVAL by
 * `record_shopper_arrival` (feature gate ON at that instant, claim time
 * known, arrival <= claimed_at + 15 minutes, both server-stamped) and
 * persisted as `redemptions.fast_visit_qualified_at` — immutable once
 * written. Surfaces that state whether an arrival QUALIFIED read that
 * persisted fact; nothing client-side re-derives it from raw timestamps,
 * because timestamps alone cannot know whether the feature was on when the
 * shopper walked in. Everything here is presentation only — a shopper's
 * device clock can change what their screen shows, never what the server
 * awards.
 */

export const FAST_VISIT_WINDOW_MINUTES = 15;

const WINDOW_MS = FAST_VISIT_WINDOW_MINUTES * 60 * 1000;

/** The instant the reward window closes, or null when the claim time is unknown. */
export function fastVisitDeadline(claimedAt: string | null | undefined): Date | null {
  if (!claimedAt) return null;
  const t = new Date(claimedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + WINDOW_MS);
}

/** "8m 17s" / "45s" — how fast the shopper actually was. */
export function formatArrivalDuration(
  claimedAt: string,
  arrivedAt: string
): string {
  const ms = new Date(arrivedAt).getTime() - new Date(claimedAt).getTime();
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** "14:32" — the ticking reward countdown, MM:SS, clamped at 0:00. */
export function formatRewardCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
