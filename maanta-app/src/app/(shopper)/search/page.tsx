import { createServiceClient } from "@/lib/supabase/service";
import {
  getSelectedNode,
  getVerifiedCounts,
  withPublicMerchant,
  selectDealsWithMerchants,
  type DealRow,
} from "@/lib/data";
import { dealPricing } from "@/lib/pricing";
import { ALL_NODES } from "@/lib/nodes";
import { SearchControls } from "./search-controls";
import { DealCardHorizontal } from "@/components/ui/cards";
import { EmptyState } from "@/components/ui/states";
import { ButtonLink } from "@/components/ui/button";

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

  let results: DealRow[] = [];
  if (q || type !== "all") {
    results = await selectDealsWithMerchants(async (select) => {
      let query = withPublicMerchant(
        service
          .from("deals")
          .select(select)
          .eq("is_active", true)
          .gt("expires_at", new Date().toISOString())
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
        let shopQuery = withPublicMerchant(
          service
            .from("deals")
            .select(select)
            .eq("is_active", true)
            .gt("expires_at", new Date().toISOString())
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

      {!searched ? null : results.length === 0 ? (
        <div className="mt-6 text-center">
          <EmptyState
            title={q ? `No results for "${q}"` : "No results"}
            sub="Try a different word, or browse all live deals."
          />
          <ButtonLink href="/feed" variant="ghost" size="sm" className="-mt-8">
            Browse deals
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {results.map((d) => {
            // Show YOU PAY on results too — same lib/pricing source as the feed,
            // so a shopper sees a consistent price everywhere it appears.
            const priced = dealPricing(d);
            return (
              <DealCardHorizontal
                key={d.id}
                href={`/deals/${d.id}`}
                imageUrl={d.image_url}
                title={`${d.merchants?.merchant_name} — ${d.title}`}
                tag={d.deal_type === "flash" ? "flash" : d.boost_active ? "boosted" : null}
                verifiedCount={verified.get(d.merchant_id) ?? 0}
                pay={priced.pay}
                extras={priced.extras}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
