import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext, getMerchantStats, expireStaleBoosts } from "@/lib/merchant";
import { canUseMerchantSurface } from "@/lib/merchant-nav";
import { KpiCard, RedemptionRow } from "@/components/ui/cards";
import { ButtonLink } from "@/components/ui/button";
import {
  getMerchantLifecycleInfo,
  getMerchantLifecycleStats,
} from "@/lib/merchant-lifecycle";

export const dynamic = "force-dynamic";

/** 10z Merchant dashboard — KPIs, quick actions, recent activity. */
export default async function MerchantDashboardPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, permissions } = res.ctx;
  await expireStaleBoosts(merchant.id);

  const service = createServiceClient();
  const [stats, { data: dealRows }, { data: recent }] = await Promise.all([
    getMerchantStats(merchant.id),
    service
      .from("deals")
      .select("expires_at, is_active")
      .eq("merchant_id", merchant.id),
    service
      .from("redemptions")
      .select("id, status, redeemed_at, success_fee_charged")
      .eq("merchant_id", merchant.id)
      .neq("status", "pending")
      .order("redeemed_at", { ascending: false })
      .limit(5),
  ]);

  const lifecycleStats = getMerchantLifecycleStats(dealRows ?? []);
  const lifecycle = getMerchantLifecycleInfo(merchant, lifecycleStats);
  const activeDeals = lifecycleStats.liveDealCount;
  const limit = merchant.tier === "elite" ? 2 : 1;

  const quickActions = (
    [
      { surface: "redeem", href: "/merchant/redeem", label: "Redeem", variant: undefined },
      {
        surface: "deals",
        href: "/merchant/deals/new",
        label: "New deal",
        variant: "ghost",
      },
      {
        surface: "topup",
        href: "/merchant/topup",
        label: "Top up",
        variant: "ghost",
      },
    ] as const
  ).filter((a) => canUseMerchantSurface(a.surface, permissions));

  return (
    <main className="px-4 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <span className="rounded-full bg-cream px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
          {lifecycle.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <KpiCard label="Redemptions today" value={stats.today} />
        <KpiCard label="This week" value={stats.week} />
        <KpiCard label="Active deals" value={`${activeDeals}/${limit}`} />
        <KpiCard
          label="Wallet balance"
          value={Math.round(merchant.account_balance).toLocaleString("en-KE")}
        />
      </div>

      {/* Quick actions mirror the bottom bar: only what this user can do. */}
      {quickActions.length > 0 ? (
        <>
          <h2 className="mt-6 text-base font-bold text-ink">Quick actions</h2>
          <div className="mt-3 flex gap-2.5">
            {quickActions.map((a) => (
              <ButtonLink
                key={a.href}
                href={a.href}
                size="md"
                variant={a.variant}
                className="flex-1"
              >
                {a.label}
              </ButtonLink>
            ))}
          </div>
        </>
      ) : null}

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
