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
import { nodeCoords, nodeLabel } from "@/lib/nodes";
import { dealExpiryLabel } from "@/lib/browse";
import {
  DEFAULT_FEED_SORT,
  FEED_SORT_OPTIONS,
  filterDealRowsByRail,
  parseDealListFilter,
  parseDealListSort,
  sortDealRows,
} from "@/lib/deal-list-controls";
import { distanceMeters, formatDistanceMeters } from "@/lib/what3words";
import {
  FEED_SECTIONS,
  nearMeSubtitle,
  orderNearMeDeals,
  selectNearMeDeals,
} from "@/lib/feed-sections";

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
  // Validated, not cast: an unrecognised ?sort= would otherwise reach the
  // distance branch and undo the locked order, and an unrecognised ?filter=
  // would empty every rail and claim there are no deals.
  const sort = parseDealListSort(searchParams?.sort, DEFAULT_FEED_SORT, FEED_SORT_OPTIONS);
  const filter = parseDealListFilter(searchParams?.filter);
  const [{ flash, boosted, nearMe }, user] = await Promise.all([
    getLiveDeals(node),
    getAppUser(),
  ]);
  const favourites = await getFavouriteMerchantIds(user?.id);

  // `getLiveDeals` already returns each rail in its locked order, so the default
  // path leaves them alone — `sortDealRows` is a pass-through for "featured".
  // Only an explicit shopper choice re-sorts, and then it applies to all rails.
  let flashDeals = sortDealRows(flash, sort, origin);
  let boostedDeals = sortDealRows(boosted, sort, origin);
  // D-01: Deals Near Me is proximity-led by definition, so it is ordered by
  // `orderNearMeDeals` rather than the shared sort control — and re-filtered so
  // a flash or boosted deal can never leak in from a widened query.
  let nearDeals =
    sort === "nearest"
      ? orderNearMeDeals(selectNearMeDeals(nearMe), origin)
      : sortDealRows(selectNearMeDeals(nearMe), sort, origin);

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
      {/* Every page needs an h1 for screen readers and document outline. The
          Discover design intentionally leads with the top bar, so this is
          visually hidden rather than shown. It is also the stable anchor the
          design-truth smoke suite asserts (frames.json → S-feed). */}
      <h1 className="sr-only">Discover deals</h1>
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
              title={FEED_SECTIONS.flash.title}
              subtitle={FEED_SECTIONS.flash.subtitle}
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
              title={FEED_SECTIONS.boosted.title}
              subtitle={FEED_SECTIONS.boosted.subtitle}
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

          {/* Deals Near Me — founder decision D-01. Nearby STANDARD deals only:
              a Standard merchant's one standard deal plus an Elite merchant's
              non-boosted standard deals. Flash and Priority placements stay
              separate surfaces above. "Near" is node-scoped and ordered by each
              shop's distance from the node centre — not device geolocation — so
              the subtitle says exactly that and drops the proximity claim when
              there are no coordinates. See src/lib/feed-sections.ts. */}
          {nearDeals.length > 0 ? (
            <Section
              title={FEED_SECTIONS.nearMe.title}
              subtitle={nearMeSubtitle(origin, nodeLabel(node))}
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
