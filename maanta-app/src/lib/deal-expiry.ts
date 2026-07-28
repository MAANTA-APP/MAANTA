/** 15-minute grace after deal end — frozen business rule (ENGINEERING_NOTES §1). */
export const DEAL_GRACE_MINUTES = 15;

export type DealExpiryStatus = "live" | "in_grace" | "expired";

export type DealExpiryState = {
  status: DealExpiryStatus;
  displayText: string;
  graceEndsAt: Date | null;
};

function formatDurationParts(ms: number): { hours: number; minutes: number } {
  const totalMins = Math.max(0, Math.ceil(ms / 60_000));
  return { hours: Math.floor(totalMins / 60), minutes: totalMins % 60 };
}

/** "Expires in 2h 14m" */
export function formatExpiresIn(expiresAt: Date, now: Date): string {
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return "Expired";
  const { hours, minutes } = formatDurationParts(ms);
  if (hours > 0) return `Expires in ${hours}h ${minutes}m`;
  if (minutes > 0) return `Expires in ${minutes}m`;
  return "Expires in less than 1m";
}

/** "Grace period: 12 minutes left" */
export function formatGraceLeft(graceEndsAt: Date, now: Date): string {
  const ms = graceEndsAt.getTime() - now.getTime();
  if (ms <= 0) return "Expired";
  const { hours, minutes } = formatDurationParts(ms);
  if (hours > 0) {
    return `Grace period: ${hours}h ${minutes}m left`;
  }
  return `Grace period: ${minutes} minute${minutes === 1 ? "" : "s"} left`;
}

/**
 * Shared deal expiry + grace display logic for shopper and merchant surfaces.
 * Inputs: deal end timestamp; grace period in minutes (default 15).
 */
export function getDealExpiryState(
  expiresAt: string | null | undefined,
  now = new Date(),
  graceMinutes = DEAL_GRACE_MINUTES
): DealExpiryState {
  if (!expiresAt) {
    return { status: "live", displayText: "", graceEndsAt: null };
  }

  const expiry = new Date(expiresAt);
  const graceEndsAt = new Date(expiry.getTime() + graceMinutes * 60_000);
  const t = now.getTime();

  if (t < expiry.getTime()) {
    return {
      status: "live",
      displayText: formatExpiresIn(expiry, now),
      graceEndsAt,
    };
  }
  if (t < graceEndsAt.getTime()) {
    return {
      status: "in_grace",
      displayText: formatGraceLeft(graceEndsAt, now),
      graceEndsAt,
    };
  }
  return { status: "expired", displayText: "Expired", graceEndsAt };
}

/** Card/detail meta line — expiry countdown with grace framing. */
export function dealExpiryLabel(
  expiresAt: string | null | undefined,
  now = new Date()
): string {
  const { displayText } = getDealExpiryState(expiresAt, now);
  return displayText;
}

/** True while the deal is claimable (live or in grace). */
export function isDealClaimable(
  expiresAt: string | null | undefined,
  now = new Date(),
  graceMinutes = DEAL_GRACE_MINUTES
): boolean {
  const { status } = getDealExpiryState(expiresAt, now, graceMinutes);
  return status === "live" || status === "in_grace";
}
