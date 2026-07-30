import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext, expireStaleBoosts } from "@/lib/merchant";
import { MerchantDealRow } from "@/components/ui/cards";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { formatKes } from "@/lib/ui";
import { IconPlus } from "@/components/ui/icons";
import { isDealInRedemptionWindow } from "@/lib/deal-expiry";
import {
  getMerchantLifecycleInfo,
  getMerchantLifecycleStats,
} from "@/lib/merchant-lifecycle";

export const dynamic = "force-dynamic";

/** 10b Deal list (active only) + 10n empty. */
export default async function MerchantDealsPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;
  await expireStaleBoosts(merchant.id);

  const service = createServiceClient();
  const [{ data: deals }, { data: verified }] = await Promise.all([
    service
      .from("deals")
      .select("id, title, image_url, is_paused, boost_active, expires_at, claims_count, max_claims, is_active")
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    service
      .from("redemptions")
      .select("deal_id")
      .eq("merchant_id", merchant.id)
      .eq("status", "success"),
  ]);

  const verifiedByDeal = new Map<string, number>();
  for (const r of verified ?? []) {
    verifiedByDeal.set(r.deal_id, (verifiedByDeal.get(r.deal_id) ?? 0) + 1);
  }

  const allDealRows = (deals ?? []).map((d) => ({
    expires_at: d.expires_at,
    is_active: d.is_active,
  }));
  const lifecycle = getMerchantLifecycleInfo(
    merchant,
    getMerchantLifecycleStats(allDealRows)
  );

  // Merchant list keeps grace-window deals so till codes can still be managed.
  const live = (deals ?? []).filter(
    (d) => !d.expires_at || isDealInRedemptionWindow(d.expires_at)
  );
  const limit = merchant.tier === "elite" ? 2 : 1;

  const emptyTitle =
    lifecycle.stage === "churn_risk"
      ? "No active deals — shoppers can't find you"
      : "No deals published yet";
  const emptySub =
    lifecycle.stage === "churn_risk"
      ? "You haven't posted a deal in 30+ days. Create a new deal to re-appear in the feed."
      : undefined;

  return (
    <main className="px-4 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">My deals</h1>
        <Link
          href="/merchant/deals/new"
          aria-label="New deal"
          className="rounded-full bg-cream p-2 text-ink hover:bg-cream-dark"
        >
          <IconPlus className="h-5 w-5" />
        </Link>
      </div>
      <p className="mt-1 text-xs text-muted">Active deals</p>

      {live.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          sub={emptySub}
          actionLabel="Create your first deal"
          actionHref="/merchant/deals/new"
        />
      ) : (
        <div className="mt-4 space-y-3">
          {live.map((d) => (
            <MerchantDealRow
              key={d.id}
              href={`/merchant/deals/${d.id}`}
              imageUrl={d.image_url}
              title={d.title}
              status={d.is_paused ? "paused" : "active"}
              expiresAt={d.expires_at}
              verifiedCount={verifiedByDeal.get(d.id) ?? 0}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-faint">
        {merchant.tier === "elite" ? "Elite" : "Standard"} plan · {limit} active deal
        {limit > 1 ? "s" : ""} at a time · Wallet {formatKes(merchant.account_balance)}
      </p>

      <div className="mt-5">
        <ButtonLink href="/merchant/deals/new" variant="ghost" full>
          New deal
        </ButtonLink>
      </div>

      <Link
        href="/merchant/deals/archived"
        className="mt-4 flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5"
      >
        <span className="text-sm font-semibold text-ink">Archived deals</span>
        <span className="text-sm text-muted underline">View</span>
      </Link>
    </main>
  );
}
