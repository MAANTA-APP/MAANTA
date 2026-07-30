import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { canUseMerchantSurface } from "@/lib/merchant-nav";
import { CoverImage } from "@/components/ui/cards";
import { StatusChip } from "@/components/ui/chips";
import { EmptyState } from "@/components/ui/states";
import { ArchivedActions } from "./archived-actions";

export const dynamic = "force-dynamic";

/** 10q Archived deals — last 5 expired deals, Repost / Delete. */
export default async function ArchivedDealsPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, permissions } = res.ctx;
  // Repost publishes a deal and Delete drops an archive row — both are
  // `can_deals` writes server-side (/api/deals/repost, /api/archive/[id]), so
  // staff without it get the read-only history rather than buttons that 403.
  const canDeals = canUseMerchantSurface("deals", permissions);

  const service = createServiceClient();
  const { data: entries } = await service
    .from("archive_history")
    .select("id, deal_snapshot, archived_at, reposted_at")
    .eq("merchant_id", merchant.id)
    .order("archived_at", { ascending: false })
    .limit(5);

  const rows = (entries ?? []).map((e) => ({
    id: e.id,
    reposted: !!e.reposted_at,
    snap: e.deal_snapshot as {
      title?: string;
      image_url?: string;
      claims_count?: number;
      max_claims?: number | null;
    },
  }));

  return (
    <main className="px-4 pt-5">
      <h1 className="text-center text-lg font-bold text-ink">Archived deals</h1>
      <p className="mt-1 text-center text-xs text-muted">Last 5 expired deals</p>

      {rows.length === 0 ? (
        <EmptyState title="Nothing archived yet" sub="Expired deals land here automatically" />
      ) : (
        <div className="mt-5 space-y-4">
          {rows.map((r) => (
            <div key={r.id} className="rounded-card border border-line bg-white p-3.5">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cream">
                  <CoverImage src={r.snap.image_url ?? null} alt="" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{r.snap.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Claimed: {r.snap.claims_count ?? 0}
                    {r.snap.max_claims ? `/${r.snap.max_claims}` : ""}
                  </p>
                </div>
                <StatusChip status="ended" label={r.reposted ? "Reposted" : "Ended"} />
              </div>
              {canDeals ? (
                <ArchivedActions archiveId={r.id} reposted={r.reposted} />
              ) : null}
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-center text-xs text-faint">Showing last 5 expired deals</p>
    </main>
  );
}
