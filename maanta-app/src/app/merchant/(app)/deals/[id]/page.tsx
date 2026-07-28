import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext, expireStaleBoosts } from "@/lib/merchant";
import { getBoostFee } from "@/lib/data";
import { CoverImage, KpiCard } from "@/components/ui/cards";
import { CountdownChip, StatusChip } from "@/components/ui/chips";
import { IconArrowLeft, IconPause } from "@/components/ui/icons";
import { formatKes, timeLeftLabel } from "@/lib/ui";
import { DealActions } from "./deal-actions";

export const dynamic = "force-dynamic";

/** 10c Deal detail / performance (+ 10ab paused, 10r boost active). */
export default async function MerchantDealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, permissions } = res.ctx;
  await expireStaleBoosts(merchant.id);

  const service = createServiceClient();
  const { data: deal } = await service
    .from("deals")
    .select(
      "id, title, description, image_url, deal_type, is_active, is_paused, boost_active, claims_count, max_claims, success_fee, expires_at"
    )
    .eq("id", params.id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!deal) notFound();

  const [{ count: verifiedCount }, { data: boost }, { data: otherDeals }, boostFee] =
    await Promise.all([
      service
        .from("redemptions")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", deal.id)
        .eq("status", "success"),
      service
        .from("boost_flags")
        .select("id, ends_at")
        .eq("deal_id", deal.id)
        .eq("is_active", true)
        .gt("ends_at", new Date().toISOString())
        .maybeSingle(),
      service
        .from("deals")
        .select("id, title")
        .eq("merchant_id", merchant.id)
        .eq("is_active", true)
        .neq("id", params.id)
        .gt("expires_at", new Date().toISOString()),
      getBoostFee(),
    ]);

  const verified = verifiedCount ?? 0;
  const feesPaid = verified * Number(deal.success_fee);
  const ended = deal.expires_at ? new Date(deal.expires_at) <= new Date() : false;
  const status = !deal.is_active || ended ? "ended" : deal.is_paused ? "paused" : "active";

  return (
    <main className="px-4 pb-10 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/merchant/deals" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{deal.title}</h1>
        <div className="flex flex-none items-center gap-2">
          {deal.expires_at ? <CountdownChip expiresAt={deal.expires_at} /> : null}
          <StatusChip status={status} />
        </div>
      </div>

      <div className="mt-4 h-44 overflow-hidden rounded-2xl border border-line bg-cream">
        <CoverImage src={deal.image_url} alt={deal.title} />
      </div>

      {status === "paused" ? (
        <div className="mt-4 rounded-card bg-cream p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <IconPause className="h-4 w-4" />
            Deal paused — hidden from the feed
          </p>
          <p className="mt-1 text-xs text-muted">
            No new claims while paused. Codes already claimed stay valid until the deal
            expires, plus a 15-minute grace period.
          </p>
        </div>
      ) : null}

      {boost ? (
        <div className="mt-4 rounded-card bg-brand p-4">
          <p className="text-sm font-bold text-ink">
            Boost active — {timeLeftLabel(boost.ends_at).replace(" left", "")} remaining
          </p>
          <p className="mt-0.5 text-xs text-ink/70">
            Showing in Priority Placements · {formatKes(boostFee)} / 24h
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <KpiCard label="Verified" value={verified} />
        <KpiCard
          label="Claimed"
          value={
            deal.max_claims != null
              ? `${deal.claims_count}/${deal.max_claims}`
              : deal.claims_count
          }
        />
        <KpiCard label="Fees paid" value={formatKes(feesPaid)} className="col-span-2" />
      </div>

      <DealActions
        dealId={deal.id}
        title={deal.title}
        description={deal.description ?? ""}
        status={status}
        boosted={!!boost}
        boostEndsAt={boost?.ends_at ?? null}
        boostFee={boostFee}
        balance={merchant.account_balance}
        canPurchase={permissions.can_purchase}
        canDeals={permissions.can_deals}
        otherDeals={(otherDeals ?? []).map((d) => ({ id: d.id, title: d.title }))}
      />
    </main>
  );
}
