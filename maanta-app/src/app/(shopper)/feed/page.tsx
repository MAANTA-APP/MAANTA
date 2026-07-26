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
import { dealExpiryLabel, dealRail } from "@/lib/browse";
import { distanceMeters, formatDistanceMeters } from "@/lib/what3words";

export const dynamic = "force-dynamic";

type FeedSort = "nearest" | "newest" | "ending";
type FeedFilter = "all" | "flash" | "boosted" | "standard";

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

function distanceValue(
  d: DealRow,
  origin: { lat: number; lng: number } | null
): number {
  if (!origin) return Infinity;
  const lat = d.merchants?.lat;
  const lng = d.merchants?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return Infinity;
  return distanceMeters(origin, { lat, lng });
}

function sortDeals(
  deals: DealRow[],
  sort: FeedSort,
  origin: { lat: number; lng: number } | null
): DealRow[] {
  const copy = [...deals];
  if (sort === "newest") {
    return copy.sort(
      (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
    );
  }
  if (sort === "ending") {
    return copy.sort((a, b) => {
      const ae = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
      const be = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
      return ae - be;
    });
  }
  return copy.sort(
    (a, b) => distanceValue(a, origin) - distanceValue(b, origin)
  );
}

function filterDeals(deals: DealRow[], filter: FeedFilter): DealRow[] {
  if (filter === "all") return deals;
  return deals.filter((d) => dealRail(d) === filter);
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
  const sort = (searchParams?.sort as FeedSort) ?? "nearest";
  const filter = (searchParams?.filter as FeedFilter) ?? "all";
  const [{ flash, boosted, nearMe }, user] = await Promise.all([
    getLiveDeals(node),
    getAppUser(),
  ]);
  const favourites = await getFavouriteMerchantIds(user?.id);

  let flashDeals = sortDeals(flash, sort, origin);
  let boostedDeals = sortDeals(boosted, sort, origin);
  let nearDeals = sortDeals(nearMe, sort, origin);

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
  const favouriteDeals = filterDeals(
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
                <Link href="/search?type=flash" className="text-xs font-semibold text-muted">
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
                <Link href="/search?type=boosted" className="text-xs font-semibold text-muted">
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
