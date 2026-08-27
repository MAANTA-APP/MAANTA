import { createServiceClient } from "@/lib/supabase/service";
import { claimsWindow, CLAIMS_TRACKING_CONFIG_KEY, type ClaimsWindow } from "@/lib/claims-window";

export type MetricValue<T> =
  | { ok: true; value: T }
  | { ok: false; value: null };

export type MerchantOwnerStats = {
  windowStart: string;
  claims: MetricValue<number>;
  verifiedVisits: MetricValue<number>;
  claimToVerifiedPct: MetricValue<number | null>;
  successFees: MetricValue<number>;
  topDeal: MetricValue<string | null>;
  fastVisits: MetricValue<number>;
  claimsWindow: ClaimsWindow;
};

export type MerchantClaimRow = {
  id: string;
  status: string;
  claimed_at: string | null;
};

export type MerchantVerifiedRow = {
  id: string;
  deal_id: string;
  success_fee_charged: number | string | null;
  fast_visit_qualified_at: string | null;
  deals: { title: string } | null;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function ok<T>(value: T): MetricValue<T> {
  return { ok: true, value };
}

function failed<T>(): MetricValue<T> {
  return { ok: false, value: null };
}

export function summariseMerchantOwnerRows(
  claimRows: MerchantClaimRow[],
  verifiedRows: MerchantVerifiedRow[]
): Pick<
  MerchantOwnerStats,
  | "claims"
  | "verifiedVisits"
  | "claimToVerifiedPct"
  | "successFees"
  | "topDeal"
  | "fastVisits"
> {
  const claims = ok(claimRows.length);
  const claimToVerifiedPct = ok<number | null>(
    claimRows.length === 0
      ? null
      : Math.round(
          (claimRows.filter((row) => row.status === "success").length /
            claimRows.length) *
            100
        )
  );

  const successFees = verifiedRows.reduce((sum, row) => {
    const n = Number(row.success_fee_charged ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const byDeal = new Map<string, { title: string; count: number }>();
  for (const row of verifiedRows) {
    const title = row.deals?.title ?? "Deal";
    const current = byDeal.get(row.deal_id);
    byDeal.set(row.deal_id, {
      title,
      count: (current?.count ?? 0) + 1,
    });
  }

  const topDeal =
    Array.from(byDeal.entries())
      .sort((a, b) => {
        const countDiff = b[1].count - a[1].count;
        if (countDiff !== 0) return countDiff;
        const titleDiff = a[1].title.localeCompare(b[1].title);
        if (titleDiff !== 0) return titleDiff;
        return a[0].localeCompare(b[0]);
      })[0]?.[1].title ?? null;

  return {
    claims,
    claimToVerifiedPct,
    verifiedVisits: ok(verifiedRows.length),
    successFees: ok(successFees),
    topDeal: ok(topDeal),
    fastVisits: ok(
      verifiedRows.filter((row) => row.fast_visit_qualified_at !== null).length
    ),
  };
}

/**
 * Merchant-owner attribution summary for the last 7 days.
 *
 * Every service-client read is explicitly tenant-scoped by merchant_id.
 * Failures remain failures rather than being flattened into zero (D164/D185).
 */
export async function getMerchantOwnerStats(
  merchantId: string,
  now = new Date()
): Promise<MerchantOwnerStats> {
  const service = createServiceClient();
  const windowStart = new Date(now.getTime() - SEVEN_DAYS_MS).toISOString();

  const [claimsRes, verifiedRes, claimsTrackingRes] = await Promise.all([
    service
      .from("redemptions")
      .select("id, status, claimed_at")
      .eq("merchant_id", merchantId)
      .gte("claimed_at", windowStart),
    service
      .from("redemptions")
      .select(
        "id, deal_id, success_fee_charged, fast_visit_qualified_at, deals(title)"
      )
      .eq("merchant_id", merchantId)
      .eq("status", "success")
      .gte("redeemed_at", windowStart),
    service
      .from("app_config")
      .select("value")
      .eq("key", CLAIMS_TRACKING_CONFIG_KEY)
      .maybeSingle(),
  ]);

  if (claimsRes.error) {
    console.error("merchant owner claims stats unavailable", {
      merchantId,
      error: claimsRes.error,
    });
  }
  if (verifiedRes.error) {
    console.error("merchant owner verified stats unavailable", {
      merchantId,
      error: verifiedRes.error,
    });
  }
  if (claimsTrackingRes.error) {
    console.error("merchant claim-tracking coverage unavailable", {
      merchantId,
      error: claimsTrackingRes.error,
    });
  }

  const claimRows = (claimsRes.data ?? []) as MerchantClaimRow[];
  const verifiedRows = (verifiedRes.data ?? []) as unknown as MerchantVerifiedRow[];

  const good = summariseMerchantOwnerRows(claimRows, verifiedRows);

  const coverage = claimsTrackingRes.error
    ? {
        label: "Claims",
        hint: "Couldn’t confirm how far back claim tracking is complete.",
        partial: true,
      }
    : claimsWindow(claimsTrackingRes.data?.value ?? null, now);

  return {
    windowStart,
    claimsWindow: coverage,
    claims: claimsRes.error ? failed<number>() : good.claims,
    claimToVerifiedPct: claimsRes.error
      ? failed<number | null>()
      : good.claimToVerifiedPct,
    verifiedVisits: verifiedRes.error
      ? failed<number>()
      : good.verifiedVisits,
    successFees: verifiedRes.error
      ? failed<number>()
      : good.successFees,
    topDeal: verifiedRes.error
      ? failed<string | null>()
      : good.topDeal,
    fastVisits: verifiedRes.error
      ? failed<number>()
      : good.fastVisits,
  };
}
