/**
 * Customer activity arithmetic for the admin customer record.
 *
 * A "claim" and a "redemption" are the same row: `claim_deal` writes a
 * `redemptions` row with status `pending`, and `verify_redemption` moves it to
 * `success`. So one list tells the whole story and the status column is what
 * separates "claimed" from "actually redeemed" — counting them as two tables
 * would double-count the same act.
 */

/** The four statuses the redemptions CHECK constraint allows. */
export type RedemptionStatus = "pending" | "success" | "failed" | "flagged";

export type CustomerRedemption = {
  status: string;
  redeemed_at: string;
  success_fee_charged: number | string | null;
};

export type CustomerSummary = {
  claims: number;
  redeemed: number;
  pending: number;
  failed: number;
  flagged: number;
  /**
   * Success fees the merchants paid because of this shopper — all time, from
   * `success` rows only. A pending claim has cost nobody anything yet, and a
   * failed one never will.
   */
  feesGenerated: number;
  /** ISO timestamp of the most recent activity, or null when there is none. */
  lastActivityAt: string | null;
};

export function summariseCustomerRedemptions(
  rows: CustomerRedemption[]
): CustomerSummary {
  const s: CustomerSummary = {
    claims: rows.length,
    redeemed: 0,
    pending: 0,
    failed: 0,
    flagged: 0,
    feesGenerated: 0,
    lastActivityAt: null,
  };

  for (const r of rows) {
    if (r.status === "success") {
      s.redeemed += 1;
      const fee =
        typeof r.success_fee_charged === "string"
          ? parseFloat(r.success_fee_charged)
          : (r.success_fee_charged ?? 0);
      if (Number.isFinite(fee)) s.feesGenerated += fee;
    } else if (r.status === "pending") s.pending += 1;
    else if (r.status === "failed") s.failed += 1;
    else if (r.status === "flagged") s.flagged += 1;

    if (s.lastActivityAt === null || r.redeemed_at > s.lastActivityAt) {
      s.lastActivityAt = r.redeemed_at;
    }
  }

  return s;
}
