import { createServiceClient } from "@/lib/supabase/service";
import {
  getSelectedNode,
  getVerifiedCounts,
  withPublicMerchant,
  type DealRow,
} from "@/lib/data";
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
    let query = withPublicMerchant(
      service
        .from("deals")
        .select(
          "id, merchant_id, node, title, description, image_url, deal_type, flash_duration_hours, is_active, max_claims, claims_count, success_fee, boost_active, starts_at, expires_at, merchants!inner(id, merchant_name, floor, unit_number, what3words_address, mall_name, node, is_visible, is_shadow_banned, status)"
        )
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
    ).limit(30);
    if (node !== ALL_NODES) query = query.eq("node", node);
    if (type === "flash") query = query.eq("deal_type", "flash");
    if (type === "standard") query = query.eq("deal_type", "standard");
    if (type === "boosted") query = query.eq("boost_active", true);
    if (q) query = query.ilike("title", `%${q}%`);
    const { data } = await query;
    results = ((data ?? []) as unknown as DealRow[]).filter((d) => d.merchants);

    // Also match shop names when a text query is present.
    if (q) {
      let shopQuery = withPublicMerchant(
        service
          .from("deals")
          .select(
            "id, merchant_id, node, title, description, image_url, deal_type, flash_duration_hours, is_active, max_claims, claims_count, success_fee, boost_active, starts_at, expires_at, merchants!inner(id, merchant_name, floor, unit_number, what3words_address, mall_name, node, is_visible, is_shadow_banned, status)"
          )
          .eq("is_active", true)
          .gt("expires_at", new Date().toISOString())
      )
        .ilike("merchants.merchant_name", `%${q}%`)
        .limit(30);
      if (node !== ALL_NODES) shopQuery = shopQuery.eq("node", node);
      const { data: byShop } = await shopQuery;
      const seen = new Set(results.map((d) => d.id));
      for (const d of (byShop ?? []) as unknown as DealRow[]) {
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
          {results.map((d) => (
            <DealCardHorizontal
              key={d.id}
              href={`/deals/${d.id}`}
              imageUrl={d.image_url}
              title={`${d.merchants?.merchant_name} — ${d.title}`}
              tag={d.deal_type === "flash" ? "flash" : d.boost_active ? "boosted" : null}
              verifiedCount={verified.get(d.merchant_id) ?? 0}
            />
          ))}
        </div>
      )}
    </main>
  );
}
