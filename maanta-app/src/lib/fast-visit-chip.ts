/**
 * Whether a claim should show a Fast Visit chip, and what it should say.
 *
 * ## The gate, and why it is not just the feature flag
 *
 * Fast Visit is currently **OFF**, and nothing in this PR turns it on. But the
 * flag alone is the wrong gate, for the reason D198 records: a claim that
 * already qualified has *earned* its eligibility, and flipping the lever off
 * must not erase it. `award_fast_visit_points` deliberately never re-reads the
 * gate, and `/you` already honours the same rule for the rewards row. So the
 * chip shows when the feature is on **or** this specific claim already carries
 * the persisted arrival verdict.
 *
 * With the flag off and no qualified claims — production today — this renders
 * nothing at all, on every row. That is the intended state.
 *
 * ## Why the verdict is read, never re-derived
 *
 * `fast_visit_qualified_at` is stamped at arrival and is immutable (D191). This
 * module never recomputes qualification from `claimed_at` and `arrived_at`,
 * because a recomputation would produce a different answer if the window rule
 * ever changed — rewriting history for claims already settled. It reads the
 * persisted fact or it says nothing.
 */

export type FastVisitChipState = "hidden" | "window-open" | "qualified" | "missed";

export type FastVisitChipInput = {
  /** `app_config.fast_visit_enabled`, resolved server-side. */
  featureEnabled: boolean;
  /**
   * `redemptions.status`.
   *
   * Load-bearing, not decoration: `record_shopper_arrival` raises
   * `arrival_claim_not_pending` for any non-pending redemption, so once a claim
   * is success, failed or flagged, no arrival can be recorded and no
   * qualification can ever happen. An "open" window on such a row is a promise
   * the database will refuse.
   */
  status: string;
  /** `redemptions.claimed_at` — null on historical rows predating the column. */
  claimedAt: string | null;
  /** `redemptions.arrived_at` — set only by the server-side arrival RPC. */
  arrivedAt: string | null;
  /** `redemptions.fast_visit_qualified_at` — the immutable arrival verdict. */
  qualifiedAt: string | null;
  /** The claim's reward window in minutes. */
  windowMinutes: number;
  /** Injectable for testing the boundary. */
  now?: Date;
};

/**
 * The chip's state for one claim.
 *
 * - `hidden` — say nothing. The feature is off and this claim earned nothing,
 *   or the claim has no recorded claim time so no window ever existed.
 * - `qualified` — the persisted verdict says it made the window.
 * - `window-open` — the feature is on, nobody has arrived yet, and there is
 *   still time.
 * - `missed` — the feature is on and the window closed without a qualifying
 *   arrival. Deliberately NOT called "expired": the claim itself is untouched,
 *   and this must never read as the ticket having become invalid.
 */
export function fastVisitChipState(input: FastVisitChipInput): FastVisitChipState {
  // Earned eligibility survives the gate (D198) AND survives completion.
  // Checked before everything else: a qualified claim keeps its chip whatever
  // the redemption's status is now and whatever the lever is set to.
  if (input.qualifiedAt) return "qualified";
  if (!input.featureEnabled) return "hidden";
  // No claim time means no window ever existed — nothing to report, and
  // certainly not a miss.
  if (!input.claimedAt) return "hidden";

  const claimed = new Date(input.claimedAt).getTime();
  if (!Number.isFinite(claimed)) return "hidden";

  // A redemption that is no longer pending can never qualify: the arrival RPC
  // refuses it outright. So the window is closed as a matter of fact, not of
  // clock — a claim verified at the counter four minutes after being made,
  // without a persisted verdict, must not still advertise an open window the
  // shopper can no longer act on.
  if (input.status !== "pending") return "missed";

  // Arrived, but the persisted verdict did not qualify it: the window is over
  // for this claim however the clock reads.
  if (input.arrivedAt) return "missed";

  const deadline = claimed + input.windowMinutes * 60_000;
  const now = (input.now ?? new Date()).getTime();
  return now < deadline ? "window-open" : "missed";
}

/**
 * Chip copy. Word-first so the state survives greyscale (frozen rule L12), and
 * never phrased so a closed reward window could read as an invalid ticket.
 */
export function fastVisitChipLabel(state: FastVisitChipState): string | null {
  switch (state) {
    case "qualified":
      return "Fast Visit earned";
    case "window-open":
      return "Fast Visit open";
    case "missed":
      // "Reward window closed", never "expired" — the claim is still valid and
      // the shopper can still redeem.
      return "Reward window closed";
    case "hidden":
      return null;
  }
}
