import { isDealClaimable } from "@/lib/deal-expiry";

/** Shopper-visible deals = still open for new claims (live, not grace-only). */

/** Days after onboarding when the "new merchant" banner still shows. */
export const ONBOARDING_WINDOW_DAYS = 14;

/** Days without a live deal before churn-risk outreach. */
export const CHURN_INACTIVITY_DAYS = 30;

export type MerchantLifecycleStage =
  | "waitlist"
  | "onboarding"
  | "live"
  | "inactive"
  | "churn_risk"
  | "suspended"
  | "churned";

export type MerchantLifecycleStats = {
  liveDealCount: number;
  daysSinceLastDealEnded: number | null;
};

export type MerchantLifecycleInfo = {
  stage: MerchantLifecycleStage;
  label: string;
  message: string;
  tone: "neutral" | "positive" | "warning" | "urgent";
};

type DealExpiryRow = { expires_at: string | null; is_active?: boolean | null };

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Count deals still visible to shoppers for new claims.
 * Grace-only deals stay redeemable at the till but are off the feed.
 */
export function countLiveDeals(deals: DealExpiryRow[], now = new Date()): number {
  return deals.filter(
    (d) => d.is_active !== false && (!d.expires_at || isDealClaimable(d.expires_at, now))
  ).length;
}

/** Days since the most recent deal ended (null if no deals ever). */
export function daysSinceLastDealEnded(
  deals: DealExpiryRow[],
  now = new Date()
): number | null {
  const ended = deals
    .map((d) => (d.expires_at ? new Date(d.expires_at) : null))
    .filter((d): d is Date => d !== null && d.getTime() <= now.getTime());
  if (ended.length === 0) return null;
  const latest = ended.reduce((a, b) => (a > b ? a : b));
  return daysBetween(latest, now);
}

export function getMerchantLifecycleStats(
  deals: DealExpiryRow[],
  now = new Date()
): MerchantLifecycleStats {
  return {
    liveDealCount: countLiveDeals(deals, now),
    daysSinceLastDealEnded: daysSinceLastDealEnded(deals, now),
  };
}

export function getMerchantLifecycleStage(
  merchant: { status: string; onboarded_at: string | null },
  stats: MerchantLifecycleStats,
  now = new Date()
): MerchantLifecycleStage {
  const { status, onboarded_at } = merchant;

  if (status === "pending") return "waitlist";
  if (status === "suspended") return "suspended";
  if (status === "churned" || status === "rejected") return "churned";

  if (status === "active") {
    const daysSinceOnboard =
      onboarded_at !== null ? daysBetween(new Date(onboarded_at), now) : null;

    if (daysSinceOnboard !== null && daysSinceOnboard <= ONBOARDING_WINDOW_DAYS) {
      return "onboarding";
    }
    if (stats.liveDealCount > 0) return "live";
    if (
      stats.daysSinceLastDealEnded !== null &&
      stats.daysSinceLastDealEnded >= CHURN_INACTIVITY_DAYS
    ) {
      return "churn_risk";
    }
    return "inactive";
  }

  return "inactive";
}

export function getMerchantLifecycleInfo(
  merchant: {
    status: string;
    onboarded_at: string | null;
    node: string;
    merchant_name: string;
  },
  stats: MerchantLifecycleStats,
  now = new Date()
): MerchantLifecycleInfo {
  const stage = getMerchantLifecycleStage(merchant, stats, now);
  const node = merchant.node || "your mall";

  switch (stage) {
    case "waitlist":
      return {
        stage,
        label: "Waitlist",
        message:
          "Your shop is pending approval — we'll notify you within 24 hours.",
        tone: "neutral",
      };
    case "onboarding":
      return {
        stage,
        label: "Onboarding",
        message: `Welcome! You're live at ${node}. Post deals and verify shopper codes at the counter.`,
        tone: "positive",
      };
    case "live":
      return {
        stage,
        label: "Live",
        message: `You're live at ${node} — shoppers can see your active deals.`,
        tone: "positive",
      };
    case "inactive":
      return {
        stage,
        label: "Inactive",
        message: "No active deals right now. Create one to stay visible to shoppers.",
        tone: "warning",
      };
    case "churn_risk":
      return {
        stage,
        label: "Needs attention",
        message: `You haven't posted a deal in ${CHURN_INACTIVITY_DAYS}+ days. Create a new deal or contact support.`,
        tone: "urgent",
      };
    case "suspended":
      return {
        stage,
        label: "Suspended",
        message: "Your shop is suspended. Contact support to resolve.",
        tone: "urgent",
      };
    case "churned":
      return {
        stage,
        label: "Closed",
        message: "This merchant account is no longer active on MAANTA.",
        tone: "neutral",
      };
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}
