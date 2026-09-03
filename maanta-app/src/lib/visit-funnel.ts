/**
 * The physical funnel, derived from rows that already exist.
 *
 *   CLAIM → ARRIVAL / CHECK-IN → QUEUE → VERIFICATION → REDEMPTION
 *
 * Every stage below is a *reading* of columns the money path and the arrival
 * path already write; nothing here is stored, scored or predicted. The point
 * of keeping the derivation in one pure function is that "a claim is not an
 * arrival, an arrival is not a redemption, a queue entry is not a redemption,
 * and a QR scan is not a redemption" is then a single ordered rule rather
 * than an opinion each page re-forms.
 *
 * ## Where each stage comes from
 *
 * | stage       | evidence                                                        |
 * |-------------|-----------------------------------------------------------------|
 * | claimed     | a `redemptions` row, status `pending`, no arrival, unexpired     |
 * | arrived     | `redemptions.arrived_at` set by `record_shopper_arrival` (QR)    |
 * | in_queue    | a `merchant_presentations` row still `waiting` and unexpired     |
 * | held        | status `flagged` — Guardian soft-blocked; NO fee has moved       |
 * | rejected    | status `failed` — declined at verification; NO fee has moved     |
 * | redeemed    | status `success` — `verify_redemption` succeeded; the ONLY stage |
 * |             | at which the KES 30 success fee is charged or recorded           |
 * | expired     | still `pending` past the ticket's `expires_at` — claimed, never  |
 * |             | verified                                                        |
 *
 * Order matters and is deliberate: a terminal status (`success`, `failed`,
 * `flagged`) wins over anything the arrival columns say, because verification
 * is the outcome and arrival is only a step towards it. Among pending rows,
 * expiry is checked before the queue, so a lapsed ticket still sitting in a
 * stale queue row reads as expired rather than as waiting.
 */

export type VisitStage =
  | "claimed"
  | "arrived"
  | "in_queue"
  | "held"
  | "rejected"
  | "redeemed"
  | "expired";

/** Just enough of a redemption row (plus its queue rows) to place it. */
export type VisitFacts = {
  status: string;
  expires_at: string | null;
  arrived_at?: string | null;
  /** Child rows from `merchant_presentations`, when the caller embedded them. */
  merchant_presentations?:
    | ReadonlyArray<{ status: string; expires_at: string }>
    | null;
};

export function visitStage(r: VisitFacts, now: Date = new Date()): VisitStage {
  if (r.status === "success") return "redeemed";
  if (r.status === "flagged") return "held";
  if (r.status === "failed") return "rejected";

  // pending from here on
  const t = now.getTime();
  if (r.expires_at && new Date(r.expires_at).getTime() <= t) return "expired";

  const waiting = (r.merchant_presentations ?? []).some(
    (p) => p.status === "waiting" && new Date(p.expires_at).getTime() > t
  );
  if (waiting) return "in_queue";
  if (r.arrived_at) return "arrived";
  return "claimed";
}

/**
 * Presentation for each stage: icon + word (greyscale-safe, frozen rule 4),
 * which funnel column it sits in, and whether money moved. `money` is true for
 * exactly one stage; a surface that colours or celebrates it is wrong.
 */
export const VISIT_STAGE_META: Record<
  VisitStage,
  {
    label: string;
    icon: string;
    column: "claim" | "arrival" | "queue" | "verification" | "redemption";
    money: boolean;
    hint: string;
  }
> = {
  claimed: {
    label: "Claimed",
    icon: "○",
    column: "claim",
    money: false,
    hint: "A code was issued. Nobody has arrived and nothing has been verified.",
  },
  arrived: {
    label: "Arrived",
    icon: "◔",
    column: "arrival",
    money: false,
    hint: "Checked in by counter QR. Not a redemption — the code is still unverified.",
  },
  in_queue: {
    label: "In queue",
    icon: "◑",
    column: "queue",
    money: false,
    hint: "Waiting on the staff queue right now. Not a redemption.",
  },
  held: {
    label: "Held",
    icon: "◐",
    column: "verification",
    money: false,
    hint: "Guardian held the verification for an admin decision. No fee has moved.",
  },
  rejected: {
    label: "Rejected",
    icon: "✕",
    column: "verification",
    money: false,
    hint: "Declined at verification. No fee has moved.",
  },
  redeemed: {
    label: "Redeemed",
    icon: "✓",
    column: "redemption",
    money: true,
    hint: "Verified by staff. The only stage at which the success fee is charged.",
  },
  expired: {
    label: "Expired",
    icon: "○",
    column: "claim",
    money: false,
    hint: "Claimed and never verified before the ticket expired.",
  },
};

/** The five columns of the funnel, in physical order. */
export const FUNNEL_COLUMNS = [
  { id: "claim", label: "Claim" },
  { id: "arrival", label: "Arrival / check-in" },
  { id: "queue", label: "Queue" },
  { id: "verification", label: "Verification" },
  { id: "redemption", label: "Redemption" },
] as const;

export type FunnelColumnId = (typeof FUNNEL_COLUMNS)[number]["id"];

export type StageCounts = Record<VisitStage, number>;

export function countStages(rows: VisitFacts[], now: Date = new Date()): StageCounts {
  const counts: StageCounts = {
    claimed: 0,
    arrived: 0,
    in_queue: 0,
    held: 0,
    rejected: 0,
    redeemed: 0,
    expired: 0,
  };
  for (const r of rows) counts[visitStage(r, now)] += 1;
  return counts;
}

/**
 * How many of a claim cohort REACHED each column — cumulative, so a redeemed
 * ticket counts under claim, arrival (if it checked in), queue (if it queued),
 * verification and redemption. This is the "of N claims, how many got to the
 * counter" reading; the per-stage counts above are "where is each one now".
 *
 * Arrival and queue are read from their own evidence rather than inferred
 * from a later stage: a code typed at the keypad with no QR scan is a
 * redemption with no arrival, and that is a true statement about the visit.
 */
export function reachedColumns(
  rows: VisitFacts[],
  now: Date = new Date()
): Record<FunnelColumnId, number> {
  const reached = { claim: 0, arrival: 0, queue: 0, verification: 0, redemption: 0 };
  for (const r of rows) {
    reached.claim += 1;
    if (r.arrived_at) reached.arrival += 1;
    if ((r.merchant_presentations ?? []).length > 0) reached.queue += 1;
    const stage = visitStage(r, now);
    if (stage === "held" || stage === "rejected" || stage === "redeemed") reached.verification += 1;
    if (stage === "redeemed") reached.redemption += 1;
  }
  return reached;
}

/**
 * Minutes an arrived-but-unverified shopper has been waiting, or null when
 * the row is not in that state. The Action Queue's "stale arrival" rule reads
 * this; the threshold lives with the rule, not here.
 */
export function minutesSinceArrival(r: VisitFacts, now: Date = new Date()): number | null {
  if (!r.arrived_at) return null;
  const stage = visitStage(r, now);
  if (stage !== "arrived" && stage !== "in_queue") return null;
  return Math.floor((now.getTime() - new Date(r.arrived_at).getTime()) / 60_000);
}
