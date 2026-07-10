import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext, getMerchantStats } from "@/lib/merchant";
import { KpiCard, RedemptionRow } from "@/components/ui/cards";
import { ButtonLink } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** 10z Merchant dashboard — KPIs, quick actions, recent activity. */
export default async function MerchantDashboardPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;

  const service = createServiceClient();
  const [stats, { count: activeDeals }, { data: recent }] = await Promise.all([
    getMerchantStats(merchant.id),
    service
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString()),
    service
      .from("redemptions")
      .select("id, status, redeemed_at, success_fee_charged")
      .eq("merchant_id", merchant.id)
      .neq("status", "pending")
      .order("redeemed_at", { ascending: false })
      .limit(5),
  ]);

  const limit = merchant.tier === "elite" ? 2 : 1;

  return (
    <main className="px-4 pt-5">
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Redemptions today" value={stats.today} />
        <KpiCard label="This week" value={stats.week} />
        <KpiCard label="Active deals" value={`${activeDeals ?? 0}/${limit}`} />
        <KpiCard
          label="Wallet balance"
          value={Math.round(merchant.account_balance).toLocaleString("en-KE")}
        />
      </div>

      <h2 className="mt-6 text-base font-bold text-ink">Quick actions</h2>
      <div className="mt-3 flex gap-2.5">
        <ButtonLink href="/merchant/redeem" size="md" className="flex-1">
          Redeem
        </ButtonLink>
        <ButtonLink href="/merchant/deals/new" size="md" variant="ghost" className="flex-1">
          New deal
        </ButtonLink>
        <ButtonLink href="/merchant/topup" size="md" variant="ghost" className="flex-1">
          Top up
        </ButtonLink>
      </div>

      <h2 className="mt-6 text-base font-bold text-ink">Recent activity</h2>
      <div className="mt-2 rounded-card border border-line bg-white px-4">
        {(recent ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No redemptions yet</p>
        ) : (
          (recent ?? []).map((r) => (
            <RedemptionRow
              key={r.id}
              when={r.redeemed_at}
              status={r.status as "success" | "failed" | "flagged"}
              amount={r.success_fee_charged}
            />
          ))
        )}
      </div>
      <Link
        href="/merchant/redemptions"
        className="mt-3 block text-center text-xs font-semibold text-muted underline"
      >
        View all redemptions
      </Link>
    </main>
  );
}
