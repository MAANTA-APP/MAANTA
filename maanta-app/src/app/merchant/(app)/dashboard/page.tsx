import type { ReactNode } from "react";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext, expireStaleBoosts } from "@/lib/merchant";
import { getMerchantOwnerStats } from "@/lib/merchant-owner-stats";
import { KpiCard, RedemptionRow } from "@/components/ui/cards";
import { ButtonLink } from "@/components/ui/button";
import {
  getMerchantLifecycleInfo,
  getMerchantLifecycleStats,
} from "@/lib/merchant-lifecycle";
import { publicOrigin } from "@/lib/app-url";
import { activeDealLimit } from "@/lib/plan-limits";
import { CounterQr } from "@/components/merchant/counter-qr";
import { formatKes } from "@/lib/ui";

export const dynamic = "force-dynamic";

function metricValue<T>(metric: { ok: boolean; value: T | null }, render: (value: T) => ReactNode) {
  return metric.ok && metric.value !== null ? render(metric.value) : "—";
}

/** Merchant owner dashboard — attributable value, deal capacity and recent activity. */
export default async function MerchantDashboardPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, isOwner } = res.ctx;
  await expireStaleBoosts(merchant.id);

  let counterLink: string | null = null;
  if (isOwner) {
    const { data: tokenRow } = await createServiceClient()
      .from("merchants")
      .select("qr_token")
      .eq("id", merchant.id)
      .maybeSingle<{ qr_token: string | null }>();
    if (tokenRow?.qr_token) {
      counterLink = `${publicOrigin()}/qr/${tokenRow.qr_token}`;
    }
  }

  const service = createServiceClient();
  const [stats, dealRowsRes, recentRes] = await Promise.all([
    getMerchantOwnerStats(merchant.id),
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

  if (dealRowsRes.error) {
    console.error("merchant dashboard deal slots unavailable", {
      merchantId: merchant.id,
      error: dealRowsRes.error,
    });
  }
  if (recentRes.error) {
    console.error("merchant dashboard recent activity unavailable", {
      merchantId: merchant.id,
      error: recentRes.error,
    });
  }

  const dealRows = dealRowsRes.data ?? [];
  const lifecycleStats = getMerchantLifecycleStats(dealRows);
  const lifecycle = getMerchantLifecycleInfo(merchant, lifecycleStats);
  const occupiedSlots = dealRowsRes.error
    ? null
    : dealRows.filter((deal) => deal.is_active === true).length;
  const limit = activeDealLimit(merchant.tier);

  return (
    <main className="px-4 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <span className="rounded-full bg-cream px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
          {lifecycle.label}
        </span>
      </div>

      <h2 className="mt-5 text-base font-bold text-ink">Last 7 days</h2>
      <p className="mt-1 text-xs text-muted">
        What shoppers did through MAANTA at your shop.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <KpiCard
          label="Claims"
          value={metricValue(stats.claims, (value) => value)}
          hint={!stats.claims.ok ? "Couldn’t load this figure." : undefined}
        />
        <KpiCard
          label="Verified visits"
          value={metricValue(stats.verifiedVisits, (value) => value)}
          hint={!stats.verifiedVisits.ok ? "Couldn’t load this figure." : undefined}
        />
        <KpiCard
          label="Claim → verified"
          value={
            stats.claimToVerifiedPct.ok
              ? stats.claimToVerifiedPct.value == null
                ? "—"
                : `${stats.claimToVerifiedPct.value}%`
              : "—"
          }
          hint={
            !stats.claimToVerifiedPct.ok
              ? "Couldn’t load this figure."
              : stats.claimToVerifiedPct.value == null
                ? "No claims in this window."
                : "Claims made in this window that are now verified."
          }
        />
        <KpiCard
          label="Success fees"
          value={metricValue(stats.successFees, (value) => formatKes(value))}
          hint={!stats.successFees.ok ? "Couldn’t load this figure." : undefined}
        />
      </div>

      <div className="mt-3 rounded-card bg-white px-4 py-3.5 shadow-card">
        <p className="text-xs text-muted">Top deal by verified visits</p>
        <p className="mt-1 truncate text-sm font-bold text-ink">
          {!stats.topDeal.ok
            ? "Couldn’t load"
            : stats.topDeal.value ?? "No verified visits yet"}
        </p>
      </div>

      <h2 className="mt-6 text-base font-bold text-ink">Shop status</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <KpiCard
          label="Deal slots"
          value={occupiedSlots == null ? "—" : `${occupiedSlots}/${limit}`}
          hint={
            occupiedSlots == null
              ? "Couldn’t load deal capacity."
              : `Live now: ${lifecycleStats.liveDealCount}`
          }
        />
        <KpiCard
          label="Wallet balance"
          value={formatKes(merchant.account_balance)}
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

      {counterLink ? (
        <div className="mt-6 rounded-card bg-white px-4 py-3.5 shadow-card">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Your MAANTA QR link
          </h2>
          <div className="mt-3 flex justify-center">
            <CounterQr url={counterLink} size={148} />
          </div>
          <p className="mt-3 text-xs text-muted">
            Shoppers scan this to check in. One code for the whole shop —
            entrance and till. Staff still verify the 6-digit code as usual.
          </p>
          <Link
            href="/merchant/qr/print"
            className="mt-3 inline-block text-xs font-semibold text-ink underline underline-offset-4"
          >
            Print counter QR
          </Link>
        </div>
      ) : null}

      <h2 className="mt-6 text-base font-bold text-ink">Recent activity</h2>
      <div className="mt-2 rounded-card bg-white px-4 shadow-card">
        {recentRes.error ? (
          <p className="py-6 text-center text-sm text-muted">
            Couldn&apos;t load recent activity — try again.
          </p>
        ) : (recentRes.data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No redemptions yet</p>
        ) : (
          (recentRes.data ?? []).map((r) => (
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
