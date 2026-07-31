import { createServiceClient } from "@/lib/supabase/service";
import { withPublicMerchant, withPublicMerchantRows } from "@/lib/data";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** 12k Featured node — BBS Mall, Eastleigh (live shop/deal counts + floors). */
export default async function BbsMallPage() {
  const service = createServiceClient();
  // Synthetic rows are excluded unless demo mode is explicitly on.
  const includeDemo = await isDemoModeEnabled();
  // Public counts must use the canonical public predicate so they never report
  // shops/deals a shopper can't actually see (pending, suspended, low-trust or
  // shadow-banned merchants).
  const [{ count: shops }, { data: deals }] = await Promise.all([
    withPublicMerchantRows(
      service
        .from("merchants")
        .select("id", { count: "exact", head: true })
        .eq("node", "BBS Mall"),
      { includeDemo }
    ),
    withPublicMerchant(
      service
        .from("deals")
        .select("id, merchants!inner(floor, node, status)")
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .eq("merchants.node", "BBS Mall"),
      { includeDemo }
    ),
  ]);

  const byFloor = new Map<string, number>();
  for (const d of (deals ?? []) as unknown as { merchants: { floor: string | null } }[]) {
    const f = d.merchants?.floor ?? "Other";
    byFloor.set(f, (byFloor.get(f) ?? 0) + 1);
  }
  const floors = Array.from(byFloor.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div>
      <section className="bg-ink px-5 py-16">
        <div className="mx-auto max-w-4xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1 text-xs font-bold text-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-verified" /> LIVE NOW
          </span>
          <h1 className="mt-4 text-4xl font-black text-brand">BBS Mall, Eastleigh</h1>
          <p className="mt-2 text-sm text-white/70">
            {shops ?? 0} shops · {(deals ?? []).length} live deals · Nairobi&apos;s launch
            node
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-10">
        <div className="space-y-3">
          {floors.length === 0 ? (
            <p className="rounded-card border border-line bg-white px-5 py-8 text-center text-sm text-muted">
              Deals go live at launch — check back soon
            </p>
          ) : (
            floors.map(([floor, count]) => (
              <div
                key={floor}
                className="flex items-center justify-between rounded-card border border-line bg-white px-5 py-4"
              >
                <span className="text-sm font-bold text-ink">{floor}</span>
                <span className="text-sm text-muted">
                  {count} deal{count === 1 ? "" : "s"}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="mt-8 text-center">
          <ButtonLink href="/feed">Browse BBS Mall deals</ButtonLink>
        </div>
      </section>
    </div>
  );
}
