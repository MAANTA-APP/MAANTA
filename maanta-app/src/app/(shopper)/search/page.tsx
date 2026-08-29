import { createServiceClient } from "@/lib/supabase/service";
import {
  getSelectedNode,
  getVerifiedCounts,
  withPublicMerchant,
  selectDealsWithMerchants,
  type DealRow,
} from "@/lib/data";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { dealPricing } from "@/lib/pricing";
import { ALL_NODES } from "@/lib/nodes";
import { SearchControls } from "./search-controls";
import { SearchResults } from "@/components/shopper/search-results";

export const dynamic = "force-dynamic";

/** 8m Search + 8x no results (+ 8n filter sheet). */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; type?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const type = searchParams.type ?? "all";
  const node = getSelectedNode();
  const service = createServiceClient();
  // Synthetic rows are excluded unless demo mode is explicitly on.
  const includeDemo = await isDemoModeEnabled();

  let results: DealRow[] = [];
  if (q || type !== "all") {
    results = await selectDealsWithMerchants(async (select) => {
      // Paused deals leave shopper discovery immediately (PR #150,
      // docs/skills/paused-deal-semantics.md, D25) — `claim_deal` raises
      // `deal_paused` and would 409 the tap. `/feed`, `/browse` and `/map` get
      // this from `getLiveDeals`; search builds its own query, so it carries the
      // same predicate as `selectLiveDealBucket` rather than inheriting it. D119.
      let query = withPublicMerchant(
        service
          .from("deals")
          .select(select)
          .eq("is_active", true)
          .eq("is_paused", false)
          .gt("expires_at", new Date().toISOString()),
        { includeDemo }
      ).limit(30);
      if (node !== ALL_NODES) query = query.eq("node", node);
      if (type === "flash") query = query.eq("deal_type", "flash");
      if (type === "standard") query = query.eq("deal_type", "standard");
      if (type === "boosted") query = query.eq("boost_active", true);
      if (q) query = query.ilike("title", `%${q}%`);
      return query;
    });

    // Also match shop names when a text query is present.
    if (q) {
      const byShop = await selectDealsWithMerchants(async (select) => {
        // Same pause filter as the title query above — both are discovery.
        let shopQuery = withPublicMerchant(
          service
            .from("deals")
            .select(select)
            .eq("is_active", true)
            .eq("is_paused", false)
            .gt("expires_at", new Date().toISOString()),
          { includeDemo }
        )
          .ilike("merchants.merchant_name", `%${q}%`)
          .limit(30);
        if (node !== ALL_NODES) shopQuery = shopQuery.eq("node", node);
        return shopQuery;
      });
      const seen = new Set(results.map((d) => d.id));
      for (const d of byShop) {
        if (!seen.has(d.id)) results.push(d);
      }
    }
  }

  const verified = await getVerifiedCounts(results.map((r) => r.merchant_id));
  const searched = q.length > 0 || type !== "all";

  return (
    <main className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-ink">Search</h1>
      <SearchControls initialQuery={q} initialType={type} />

      {!searched ? null : (
        <SearchResults
          query={q}
          items={results.map((d) => {
            // Show YOU PAY on results too — same lib/pricing source as the feed,
            // so a shopper sees a consistent price everywhere it appears.
            const priced = dealPricing(d);
            return {
              id: d.id,
              expiresAt: d.expires_at,
              // Founder request 2026-08-22: search results were the thinnest
              // card in the app — a price and a verified count, with no
              // was-price, no time left and no scarcity, so deciding needed a
              // tap. They now use the same row card the feed uses, with the
              // decision KPIs.
              card: {
                variant: "row" as const,
                href: `/deals/${d.id}`,
                imageUrl: d.image_url,
                merchantName: d.merchants?.merchant_name ?? "",
                mallName: d.merchants?.floor ?? null,
                title: d.title,
                tag:
                  d.deal_type === "flash"
                    ? ("flash" as const)
                    : d.boost_active
                      ? ("boosted" as const)
                      : ("standard" as const),
                expiresAt: d.expires_at,
                merchantId: d.merchant_id,
                showFavourite: false,
                pay: priced.pay,
                wasKes: priced.was,
                extras: priced.extras,
                claimsCount: d.claims_count,
                maxClaims: d.max_claims,
                verifiedCount: verified.get(d.merchant_id) ?? 0,
              },
            };
          })}
        />
      )}
    </main>
  );
}
