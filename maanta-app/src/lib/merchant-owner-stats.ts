import { createServiceClient } from "@/lib/supabase/service";
import {
  claimsWindow,
  CLAIMS_TRACKING_CONFIG_KEY,
  type ClaimsWindow,
} from "@/lib/claims-window";

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

export type MerchantVerifiedRow = {
  id: string;
  deal_id: string;
  success_fee_charged: number | string;
  fast_visit_qualified_at: string | null;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 500;

function ok<T>(value: T): MetricValue<T> {
  return { ok: true, value };
}

function failed<T>(): MetricValue<T> {
  return { ok: false, value: null };
}

export function summariseMerchantOwnerMetrics({
  claimCount,
  claimSuccessCount,
  verifiedCount,
  verifiedRows,
  dealTitles,
}: {
  claimCount: number;
  claimSuccessCount: number;
  verifiedCount: number;
  verifiedRows: MerchantVerifiedRow[];
  dealTitles: Map<string, string>;
}): Pick<
  MerchantOwnerStats,
  | "claims"
  | "verifiedVisits"
  | "claimToVerifiedPct"
  | "successFees"
  | "topDeal"
  | "fastVisits"
> {
  const claimToVerifiedPct = ok<number | null>(
    claimCount === 0
      ? null
      : Math.round((claimSuccessCount / claimCount) * 100)
  );

  const successFees = verifiedRows.reduce((sum, row) => {
    const n = Number(row.success_fee_charged);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const byDeal = new Map<string, number>();
  for (const row of verifiedRows) {
    byDeal.set(row.deal_id, (byDeal.get(row.deal_id) ?? 0) + 1);
  }

  const topDeal =
    Array.from(byDeal.entries())
      .sort((a, b) => {
        const countDiff = b[1] - a[1];
        if (countDiff !== 0) return countDiff;
        const aTitle = dealTitles.get(a[0]) ?? "Deal";
        const bTitle = dealTitles.get(b[0]) ?? "Deal";
        const titleDiff = aTitle.localeCompare(bTitle);
        if (titleDiff !== 0) return titleDiff;
        return a[0].localeCompare(b[0]);
      })
      .map(([dealId]) => dealTitles.get(dealId) ?? "Deal")[0] ?? null;

  return {
    claims: ok(claimCount),
    claimToVerifiedPct,
    verifiedVisits: ok(verifiedCount),
    successFees: ok(successFees),
    topDeal: ok(topDeal),
    fastVisits: ok(
      verifiedRows.filter((row) => row.fast_visit_qualified_at !== null).length
    ),
  };
}

async function fetchAllVerifiedRows(
  merchantId: string,
  windowStart: string,
  expectedCount: number
): Promise<{ data: MerchantVerifiedRow[]; error: unknown | null }> {
  if (expectedCount === 0) return { data: [], error: null };

  const service = createServiceClient();
  const rows: MerchantVerifiedRow[] = [];
  let from = 0;

  // PostgREST deployments commonly cap a response at 1,000 rows. The dashboard
  // must not silently undercount a high-volume merchant, so page below that cap
  // until the exact head-count above is satisfied.
  while (rows.length < expectedCount) {
    const { data, error } = await service
      .from("redemptions")
      .select("id, deal_id, success_fee_charged, fast_visit_qualified_at")
      .eq("merchant_id", merchantId)
      .eq("status", "success")
      .gte("redeemed_at", windowStart)
      .order("redeemed_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) return { data: rows, error };

    const page = (data ?? []) as MerchantVerifiedRow[];
    if (page.length === 0) {
      return {
        data: rows,
        error: new Error(
          `Verified-row pagination stopped at ${rows.length}/${expectedCount} rows`
        ),
      };
    }

    rows.push(...page);
    from += page.length;
  }

  return { data: rows.slice(0, expectedCount), error: null };
}

/**
 * Merchant-owner attribution summary for the last 7 days.
 *
 * Every service-client read of tenant data is explicitly scoped by merchant_id.
 * Failures remain failures rather than being flattened into zero (D164/D185).
 */
export async function getMerchantOwnerStats(
  merchantId: string,
  now = new Date()
): Promise<MerchantOwnerStats> {
  const service = createServiceClient();
  const windowStart = new Date(now.getTime() - SEVEN_DAYS_MS).toISOString();

  const [
    claimsCountRes,
    claimSuccessCountRes,
    verifiedCountRes,
    claimsTrackingRes,
  ] = await Promise.all([
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .gte("claimed_at", windowStart),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("status", "success")
      .gte("claimed_at", windowStart),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("status", "success")
      .gte("redeemed_at", windowStart),
    service
      .from("app_config")
      .select("value")
      .eq("key", CLAIMS_TRACKING_CONFIG_KEY)
      .maybeSingle(),
  ]);

  for (const [name, result] of [
    ["claims", claimsCountRes],
    ["claim cohort success", claimSuccessCountRes],
    ["verified visits", verifiedCountRes],
  ] as const) {
    if (result.error) {
      console.error(`merchant owner ${name} stats unavailable`, {
        merchantId,
        error: result.error,
      });
    }
  }

  if (claimsTrackingRes.error) {
    console.error("merchant claim-tracking coverage unavailable", {
      merchantId,
      error: claimsTrackingRes.error,
    });
  }

  const verifiedCount =
    verifiedCountRes.error || verifiedCountRes.count == null
      ? null
      : verifiedCountRes.count;

  const verifiedRowsRes =
    verifiedCount == null
      ? { data: [] as MerchantVerifiedRow[], error: verifiedCountRes.error ?? new Error("Missing verified count") }
      : await fetchAllVerifiedRows(merchantId, windowStart, verifiedCount);

  if (verifiedRowsRes.error) {
    console.error("merchant owner verified detail stats unavailable", {
      merchantId,
      error: verifiedRowsRes.error,
    });
  }

  const dealIds = Array.from(
    new Set(verifiedRowsRes.data.map((row) => row.deal_id).filter(Boolean))
  );
  const dealTitlesRes =
    verifiedRowsRes.error || dealIds.length === 0
      ? { data: [] as { id: string; title: string }[], error: verifiedRowsRes.error }
      : await service
          .from("deals")
          .select("id, title")
          .eq("merchant_id", merchantId)
          .in("id", dealIds);

  if (dealTitlesRes.error) {
    console.error("merchant owner top-deal titles unavailable", {
      merchantId,
      error: dealTitlesRes.error,
    });
  }

  const dealTitles = new Map<string, string>();
  for (const row of dealTitlesRes.data ?? []) {
    dealTitles.set(row.id, row.title);
  }

  const claimCount =
    claimsCountRes.error || claimsCountRes.count == null
      ? null
      : claimsCountRes.count;
  const claimSuccessCount =
    claimSuccessCountRes.error || claimSuccessCountRes.count == null
      ? null
      : claimSuccessCountRes.count;

  const good =
    claimCount != null &&
    claimSuccessCount != null &&
    verifiedCount != null &&
    !verifiedRowsRes.error
      ? summariseMerchantOwnerMetrics({
          claimCount,
          claimSuccessCount,
          verifiedCount,
          verifiedRows: verifiedRowsRes.data,
          dealTitles,
        })
      : null;

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
    claims:
      claimCount == null ? failed<number>() : ok(claimCount),
    claimToVerifiedPct:
      claimCount == null || claimSuccessCount == null
        ? failed<number | null>()
        : ok(
            claimCount === 0
              ? null
              : Math.round((claimSuccessCount / claimCount) * 100)
          ),
    verifiedVisits:
      verifiedCount == null ? failed<number>() : ok(verifiedCount),
    successFees:
      verifiedRowsRes.error || !good
        ? failed<number>()
        : good.successFees,
    fastVisits:
      verifiedRowsRes.error || !good
        ? failed<number>()
        : good.fastVisits,
    topDeal:
      verifiedRowsRes.error || dealTitlesRes.error || !good
        ? failed<string | null>()
        : good.topDeal,
  };
}
