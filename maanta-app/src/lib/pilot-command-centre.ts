/**
 * Node 0 Pilot Command Centre — the deterministic rules behind the table.
 *
 * Pure functions, no I/O, so every rule is testable and every status a reader
 * sees can be traced to a stated condition. This mirrors
 * `lib/admin-ops-health.ts` (PR 4) deliberately: same shape, same discipline,
 * one more surface. Nothing here scores, ranks, weights or predicts.
 *
 * ## Three doctrines this file is built around
 *
 * 1. **A failed read is never a zero** (D164 / D185). Every count that can fail
 *    is `number | null`. `null` means "not established" and every rule below
 *    refuses to fire on it. Rendering "—" is correct; rendering 0 is a lie that
 *    reads as "nothing is happening".
 * 2. **Genuine-tagged is not external field validation** (D174 / D184 / D188).
 *    The row carries both, separately, and the status rules never treat an
 *    internal shop's activity as pilot progress.
 * 3. **No causal claims from tiny samples** (node0 evidence protocol). Ratios
 *    below a minimum sample are not computed at all — not computed and hidden,
 *    not computed and caveated. A 1-of-1 conversion is not a 100% conversion.
 */

import type { EvidenceClass } from "@/lib/pilot-cohort";

/**
 * Minimum claims before a claim → verified ratio is computed for a single
 * merchant.
 *
 * Matches the fleet-wide floor in `admin-ops-health.ts`. The node0 evidence
 * protocol calls claim → walk-in "a tripwire, not a target" with no pass
 * percentage, so this floor exists to stop a 1-claim merchant rendering a
 * headline percentage, not to establish one.
 */
export const MIN_CLAIMS_FOR_MERCHANT_RATIO = 5;

/** One row of the cohort table. Every nullable count is a possible read failure. */
export type PilotMerchantRow = {
  merchantId: string;
  name: string;
  /** Cohort position — only external merchants have one. */
  position: number | null;
  evidence: EvidenceClass;
  tier: "standard" | "elite";
  status: string;
  isVisible: boolean;
  /** Active deals held vs the plan's cap. */
  activeDeals: number | null;
  dealCap: number;
  /** Deals a shopper can actually see right now. */
  shopperVisibleDeals: number | null;
  claims: number | null;
  arrivals: number | null;
  verified: number | null;
  fastVisits: number | null;
  /** Success fees in KES over the window; null when the figure is unavailable. */
  successFeesKes: number | null;
};

export type PilotStatusId =
  | "read-failed"
  | "suspended"
  | "no-supply"
  | "claims-no-visits"
  | "at-cap"
  | "awaiting-first-claim"
  | "active";

export type PilotStatus = {
  id: PilotStatusId;
  label: string;
  /** The exact condition that fired. Never a score, never a vibe. */
  reason: string;
  severity: "ok" | "attention" | "urgent" | "unknown";
};

/**
 * The merchant's status, from the first rule that matches.
 *
 * Order is the point: an unreadable row must not be diagnosed, a suspended
 * merchant must not be reported as short of supply, and "no supply" outranks
 * "no claims" because supply is the thing that would cause both.
 */
export function pilotMerchantStatus(row: PilotMerchantRow): PilotStatus {
  // 1. Unknown before anything else. A row we could not read is not a finding.
  if (
    row.shopperVisibleDeals === null ||
    row.claims === null ||
    row.verified === null
  ) {
    return {
      id: "read-failed",
      label: "Unavailable",
      reason:
        "One or more counts for this merchant could not be read. This is a read failure, not an empty result — do not act on the blanks.",
      severity: "unknown",
    };
  }

  if (row.status === "suspended" || !row.isVisible) {
    return {
      id: "suspended",
      label: "Not visible",
      reason:
        row.status === "suspended"
          ? "Merchant status is suspended, so nothing of theirs reaches shoppers."
          : "Merchant is flagged not visible, so nothing of theirs reaches shoppers.",
      severity: "attention",
    };
  }

  if (row.shopperVisibleDeals === 0) {
    return {
      id: "no-supply",
      label: "No shopper-visible supply",
      reason:
        "Zero deals are currently visible to shoppers, so no claim can be made at all.",
      severity: "urgent",
    };
  }

  if (row.claims > 0 && row.verified === 0) {
    return {
      id: "claims-no-visits",
      label: "Claims, no verified visits",
      reason: `${row.claims} claim${row.claims === 1 ? "" : "s"} and 0 verified visits: shoppers are claiming but not completing at the counter.`,
      severity: "attention",
    };
  }

  if (row.activeDeals !== null && row.activeDeals >= row.dealCap) {
    return {
      id: "at-cap",
      label: "At plan cap",
      reason: `${row.activeDeals}/${row.dealCap} active deals — this merchant cannot publish another without archiving one.`,
      severity: "attention",
    };
  }

  if (row.claims === 0) {
    return {
      id: "awaiting-first-claim",
      label: "Awaiting first claim",
      reason: "Supply is visible to shoppers and no claim has been made yet.",
      severity: "ok",
    };
  }

  return {
    id: "active",
    label: "Active",
    reason: `${row.claims} claim${row.claims === 1 ? "" : "s"}, ${row.verified} verified.`,
    severity: "ok",
  };
}

/**
 * Claim → verified ratio for one merchant, or null when the sample is too
 * small or either count failed to read.
 *
 * Returning null rather than a number is the whole point: the caller renders
 * "—" and the reader draws no conclusion, which is the honest outcome at
 * Node 0 volumes.
 */
export function merchantConversion(row: PilotMerchantRow): number | null {
  if (row.claims === null || row.verified === null) return null;
  if (row.claims < MIN_CLAIMS_FOR_MERCHANT_RATIO) return null;
  return row.verified / row.claims;
}

export type CohortTotals = {
  merchants: number;
  external: number;
  internal: number;
  unclassified: number;
  /** null when any contributing row failed to read. */
  shopperVisibleDeals: number | null;
  claims: number | null;
  arrivals: number | null;
  verified: number | null;
  fastVisits: number | null;
  successFeesKes: number | null;
};

/**
 * Sum the cohort.
 *
 * A null in any row poisons that column's total to null. That is deliberate:
 * a total that quietly drops an unreadable merchant understates the operation
 * and looks like a real, smaller number.
 */
export function cohortTotals(rows: PilotMerchantRow[]): CohortTotals {
  const sum = (pick: (r: PilotMerchantRow) => number | null): number | null => {
    let total = 0;
    for (const r of rows) {
      const v = pick(r);
      if (v === null) return null;
      total += v;
    }
    return total;
  };

  return {
    merchants: rows.length,
    external: rows.filter((r) => r.evidence === "external").length,
    internal: rows.filter((r) => r.evidence === "internal").length,
    unclassified: rows.filter((r) => r.evidence === "unclassified").length,
    shopperVisibleDeals: sum((r) => r.shopperVisibleDeals),
    claims: sum((r) => r.claims),
    arrivals: sum((r) => r.arrivals),
    verified: sum((r) => r.verified),
    fastVisits: sum((r) => r.fastVisits),
    successFeesKes: sum((r) => r.successFeesKes),
  };
}

export type PilotAlert = {
  id: string;
  label: string;
  reason: string;
  severity: "attention" | "urgent";
  merchantId?: string;
};

/**
 * Cohort-level alerts, each naming the condition that fired.
 *
 * Only merchants whose status is itself actionable produce an alert, so the
 * list cannot disagree with the table it sits beside. Unreadable rows produce
 * one alert about the read, never a diagnosis.
 */
export function buildPilotAlerts(rows: PilotMerchantRow[]): PilotAlert[] {
  const alerts: PilotAlert[] = [];

  const unreadable = rows.filter((r) => pilotMerchantStatus(r).id === "read-failed");
  if (unreadable.length > 0) {
    alerts.push({
      id: "read-failed",
      label: `${unreadable.length} merchant${unreadable.length === 1 ? "" : "s"} could not be read`,
      reason:
        "At least one count failed to load. Every blank in those rows is unknown, not zero — reload before drawing any conclusion.",
      severity: "urgent",
    });
  }

  for (const row of rows) {
    const status = pilotMerchantStatus(row);
    if (status.id === "no-supply" || status.id === "claims-no-visits") {
      alerts.push({
        id: `${status.id}:${row.merchantId}`,
        label: `${row.name} — ${status.label.toLowerCase()}`,
        reason: status.reason,
        severity: status.severity === "urgent" ? "urgent" : "attention",
        merchantId: row.merchantId,
      });
    }
  }

  return alerts;
}
