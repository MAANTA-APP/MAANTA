import Link from "next/link";
import { Suspense } from "react";
import { ShopperTopBar } from "@/components/nav/shopper-top-bar";
import { DealCard, Page, Section, RailScroller } from "@/components/ui/claude";
import { EmptyState } from "@/components/ui/states";
import {
  getLiveDeals,
  getSelectedNode,
  getAppUser,
  getFavouriteMerchantIds,
  type DealRow,
} from "@/lib/data";
import { dealPricing } from "@/lib/pricing";
import { NotificationOptIn } from "./notification-opt-in";
import { FeedControls } from "./feed-controls";
import { nodeCoords } from "@/lib/nodes";
import { dealExpiryLabel } from "@/lib/browse";
import {
  filterDealRowsByRail,
  sortDealRows,
  type DealListFilter,
  type DealListSort,
} from "@/lib/deal-list-controls";
import { distanceMeters, formatDistanceMeters } from "@/lib/what3words";

export const dynamic = "force-dynamic";

function distanceForDeal(
  d: DealRow,
  origin: { lat: number; lng: number } | null
): string | null {
  if (!origin) return null;
  const lat = d.merchants?.lat;
  const lng = d.merchants?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return formatDistanceMeters(distanceMeters(origin, { lat, lng }));
}

function cardProps(
  d: DealRow,
  opts: {
    origin: { lat: number; lng: number } | null;
    favourites: Set<string>;
    tag: "flash" | "boosted" | "standard" | null;
  }
) {
  const pricing = dealPricing(d);
  return {
    href: `/deals/${d.id}`,
    imageUrl: d.image_url,
    merchantName: d.merchants?.merchant_name ?? "",
    mallName: d.merchants?.mall_name ?? d.node,
    title: d.title,
    expiryLabel: dealExpiryLabel(d.expires_at),
    distanceLabel: distanceForDeal(d, opts.origin),
    pay: pricing.pay,
    wasKes: pricing.was,
    extras: pricing.extras,
    tag: opts.tag,
    expiresAt: d.expires_at,
    merchantId: d.merchant_id,
    isFavourite: opts.favourites.has(d.merchant_id),
  };
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: { sort?: string; filter?: string };
}) {
  const node = getSelectedNode();
  const origin = nodeCoords(node);
  const sort = (searchParams?.sort as DealListSort) ?? "nearest";
  const filter = (searchParams?.filter as DealListFilter) ?? "all";
  const [{ flash, boosted, nearMe }, user] = await Promise.all([
    getLiveDeals(node),
    getAppUser(),
  ]);
  const favourites = await getFavouriteMerchantIds(user?.id);

  let flashDeals = sortDealRows(flash, sort, origin);
  let boostedDeals = sortDealRows(boosted, sort, origin);
  let nearDeals = sortDealRows(nearMe, sort, origin);

  if (filter !== "all") {
    flashDeals = filter === "flash" ? flashDeals : [];
    boostedDeals = filter === "boosted" ? boostedDeals : [];
    nearDeals = filter === "standard" ? nearDeals : [];
    if (filter === "flash") {
      boostedDeals = [];
      nearDeals = [];
    } else if (filter === "boosted") {
      flashDeals = [];
      nearDeals = [];
    } else if (filter === "standard") {
      flashDeals = [];
      boostedDeals = [];
    }
  }

  const allDeals = [...flashDeals, ...boostedDeals, ...nearDeals];
  const favouriteDeals = filterDealRowsByRail(
    allDeals.filter((d) => favourites.has(d.merchant_id)),
    filter
  );
  const seen = new Set<string>();
  const uniqueFavourites = favouriteDeals.filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  const total = flashDeals.length + boostedDeals.length + nearDeals.length;

  return (
    <Page>
      <ShopperTopBar node={node} />
      <Suspense fallback={null}>
        <FeedControls />
      </Suspense>
      {user ? <NotificationOptIn /> : null}

      {total === 0 ? (
        <EmptyState
          title="No deals live right now"
          sub="Merchants drop new deals through the day."
        />
      ) : (
        <>
          {flashDeals.length > 0 ? (
            <Section
              title="Top picks near you"
              subtitle="Flash deals — grab them while they last"
              action={
                <Link href="/browse" className="text-xs font-semibold text-muted">
                  See all ›
                </Link>
              }
              padded={false}
            >
              <RailScroller>
                {flashDeals.map((d) => (
                  <DealCard
                    key={d.id}
                    {...cardProps(d, { origin, favourites, tag: "flash" })}
                  />
                ))}
              </RailScroller>
            </Section>
          ) : null}

          {boostedDeals.length > 0 ? (
            <Section
              title="Neighbourhood favourites"
              subtitle="Boosted deals near you"
              action={
                <Link href="/browse" className="text-xs font-semibold text-muted">
                  See all ›
                </Link>
              }
              padded={false}
            >
              <RailScroller>
                {boostedDeals.map((d) => (
                  <DealCard
                    key={d.id}
                    {...cardProps(d, { origin, favourites, tag: "boosted" })}
                  />
                ))}
              </RailScroller>
            </Section>
          ) : null}

          {nearDeals.length > 0 ? (
            <Section
              title="Deals near me"
              subtitle="Standard deals at your mall"
              action={
                <Link href="/map" className="text-xs font-semibold text-muted">
                  Map ›
                </Link>
              }
            >
              <div className="space-y-rail">
                {nearDeals.map((d) => (
                  <DealCard
                    key={d.id}
                    variant="vertical"
                    {...cardProps(d, { origin, favourites, tag: "standard" })}
                  />
                ))}
              </div>
            </Section>
          ) : null}

          {uniqueFavourites.length > 0 ? (
            <Section title="Your favourites" padded={false}>
              <RailScroller>
                {uniqueFavourites.map((d) => (
                  <DealCard
                    key={`fav-${d.id}`}
                    {...cardProps(d, {
                      origin,
                      favourites,
                      tag:
                        d.deal_type === "flash"
                          ? "flash"
                          : d.boost_active
                            ? "boosted"
                            : "standard",
                    })}
                  />
                ))}
              </RailScroller>
            </Section>
          ) : null}
        </>
      )}
    </Page>
  );
}
