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
  activeDealLimit,
  activeDealLimitCopy,
} from "@/lib/plan-limits";
import {
  getMerchantLifecycleInfo,
  getMerchantLifecycleStats,
} from "@/lib/merchant-lifecycle";

export const dynamic = "force-dynamic";

/** Merchant deal list: operational deals plus ended rows that still occupy a cap slot. */
export default async function MerchantDealsPage() {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;
  await expireStaleBoosts(merchant.id);

  const service = createServiceClient();
  const [dealsRes, verifiedRes] = await Promise.all([
    service
      .from("deals")
      .select(
        "id, title, image_url, is_paused, boost_active, expires_at, claims_count, max_claims, is_active"
      )
      .eq("merchant_id", merchant.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    service
      .from("redemptions")
      .select("deal_id")
      .eq("merchant_id", merchant.id)
      .eq("status", "success"),
  ]);

  if (dealsRes.error) {
    console.error("merchant deals unavailable", {
      merchantId: merchant.id,
      error: dealsRes.error,
    });
    return (
      <main className="px-4 pt-5">
        <h1 className="text-2xl font-bold text-ink">My deals</h1>
        <div className="mt-5 rounded-card bg-white p-5 text-center shadow-card">
          <p className="text-sm font-semibold text-ink">Couldn&apos;t load your deals</p>
          <p className="mt-1 text-xs text-muted">Try again before creating or archiving a deal.</p>
          <Link href="/merchant/deals" className="mt-4 inline-block text-sm font-semibold text-ink underline">
            Try again
          </Link>
        </div>
      </main>
    );
  }

  if (verifiedRes.error) {
    console.error("merchant deal verification counts unavailable", {
      merchantId: merchant.id,
      error: verifiedRes.error,
    });
  }

  const deals = dealsRes.data ?? [];
  const verifiedByDeal = new Map<string, number>();
  if (!verifiedRes.error) {
    for (const row of verifiedRes.data ?? []) {
      verifiedByDeal.set(
        row.deal_id,
        (verifiedByDeal.get(row.deal_id) ?? 0) + 1
      );
    }
  }

  const allDealRows = deals.map((deal) => ({
    expires_at: deal.expires_at,
    is_active: deal.is_active,
  }));
  const lifecycle = getMerchantLifecycleInfo(
    merchant,
    getMerchantLifecycleStats(allDealRows)
  );

  // Keep grace-window deals operationally reachable. Rows past the redemption
  // window are still is_active=true and therefore still occupy a trigger slot;
  // expose them explicitly so the merchant can archive them and recover capacity.
  const operational = deals.filter(
    (deal) =>
      !deal.expires_at || isDealInRedemptionWindow(deal.expires_at)
  );
  const endedSlotOccupants = deals.filter(
    (deal) =>
      !!deal.expires_at && !isDealInRedemptionWindow(deal.expires_at)
  );

  const emptyTitle =
    lifecycle.stage === "churn_risk"
      ? "No active deals — shoppers can't find you"
      : "No deals published yet";
  const emptySub =
    lifecycle.stage === "churn_risk"
      ? "You haven't posted a deal in 30+ days. Create a new deal to re-appear in the feed."
      : undefined;

  const verifiedCountFor = (dealId: string) =>
    verifiedRes.error ? null : verifiedByDeal.get(dealId) ?? 0;

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

      {operational.length === 0 && endedSlotOccupants.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          sub={emptySub}
          actionLabel="Create your first deal"
          actionHref="/merchant/deals/new"
        />
      ) : null}

      {operational.length > 0 ? (
        <>
          <p className="mt-1 text-xs text-muted">Current deals</p>
          <div className="mt-4 space-y-3">
            {operational.map((deal) => (
              <MerchantDealRow
                key={deal.id}
                href={`/merchant/deals/${deal.id}`}
                imageUrl={deal.image_url}
                title={deal.title}
                status={deal.is_paused ? "paused" : "active"}
                expiresAt={deal.expires_at}
                verifiedCount={verifiedCountFor(deal.id)}
              />
            ))}
          </div>
        </>
      ) : null}

      {endedSlotOccupants.length > 0 ? (
        <section className={operational.length > 0 ? "mt-6" : "mt-4"}>
          <h2 className="text-sm font-bold text-ink">Ended — archive to free a slot</h2>
          <p className="mt-1 text-xs text-muted">
            These deals are no longer open to shoppers but still occupy a plan slot until archived.
          </p>
          <div className="mt-3 space-y-3">
            {endedSlotOccupants.map((deal) => (
              <MerchantDealRow
                key={deal.id}
                href={`/merchant/deals/${deal.id}`}
                imageUrl={deal.image_url}
                title={deal.title}
                status="ended"
                expiresAt={deal.expires_at}
                verifiedCount={verifiedCountFor(deal.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-4 text-xs text-faint">
        Deal slots {deals.length}/{activeDealLimit(merchant.tier)} · {activeDealLimitCopy(merchant.tier)} · Wallet {formatKes(merchant.account_balance)}
      </p>

      {verifiedRes.error ? (
        <p className="mt-2 text-xs text-muted" role="status">
          Verification counts couldn&apos;t be loaded. Deal status is unaffected.
        </p>
      ) : null}

      <div className="mt-5">
        <ButtonLink href="/merchant/deals/new" variant="ghost" full>
          New deal
        </ButtonLink>
      </div>

      <Link
        href="/merchant/deals/archived"
        className="mt-4 flex items-center justify-between rounded-card bg-white px-4 py-3.5 shadow-card"
      >
        <span className="text-sm font-semibold text-ink">Archived deals</span>
        <span className="text-sm text-muted underline">View</span>
      </Link>
    </main>
  );
}
