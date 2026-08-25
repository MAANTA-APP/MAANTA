/**
 * How to label the "Claims" KPI honestly while its history is shorter than its
 * window (D164).
 *
 * `redemptions.claimed_at` only started being recorded when migration
 * 20260824130000 was applied; every claim before that has NULL and is invisible
 * to the count. So for the first seven days a "Claims (7d)" card is counting a
 * window that reaches back further than the data does, and a small number reads
 * as low demand when it actually means short history — during exactly the week
 * of the Node 0 pilot when that misreading is most expensive.
 *
 * Three states must stay distinguishable, because all three otherwise render as
 * a bare "0":
 *   1. a real zero — nobody claimed anything, and the window is fully covered;
 *   2. a failed read — handled upstream by the read-failure guards, never here;
 *   3. incomplete coverage — the honest case this module exists for.
 *
 * Shared by `/admin` and `/founder` so the two can never disagree about what a
 * claim is or how far back the number reaches.
 */

export const CLAIMS_TRACKING_CONFIG_KEY = "claims_tracking_started_at";

/** Seven days, the window the KPI advertises. */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ClaimsWindow = {
  /** The card's label — "Claims (7d)" only once seven days are genuinely covered. */
  label: string;
  /** A caveat line, or null when the window is fully covered and needs none. */
  hint: string | null;
  /** True while the 7-day window reaches back further than tracking does. */
  partial: boolean;
};

/**
 * @param trackingStartedAt `app_config.claims_tracking_started_at`, or null if
 *   the row is missing — which means the migration has not been applied here,
 *   so nothing is tracked at all and the card must not imply otherwise.
 * @param now injectable so the boundary is testable without freezing the clock.
 */
export function claimsWindow(
  trackingStartedAt: string | null | undefined,
  now: Date = new Date()
): ClaimsWindow {
  if (!trackingStartedAt) {
    return {
      label: "Claims",
      hint: "Claim tracking is not enabled yet — this is not a count of zero claims.",
      partial: true,
    };
  }

  const started = new Date(trackingStartedAt);
  if (Number.isNaN(started.getTime())) {
    // A malformed config value must not silently become a confident "(7d)".
    return {
      label: "Claims",
      hint: "Claim tracking start is unreadable — treat this number as incomplete.",
      partial: true,
    };
  }

  const covered = now.getTime() - started.getTime();
  if (covered >= WINDOW_MS) {
    return { label: "Claims (7d)", hint: null, partial: false };
  }

  return {
    label: "Claims since tracking began",
    hint: `Claims have only been recorded since ${formatTrackingDate(started)} — earlier claims are not counted.`,
    partial: true,
  };
}

/** "24 Aug" — short, unambiguous, and not locale-dependent at read time. */
function formatTrackingDate(d: Date): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}
