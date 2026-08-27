import Link from "next/link";
import { Suspense } from "react";
import { ShopperTopBar } from "@/components/nav/shopper-top-bar";
import { DealCard, Page, Section, RailScroller } from "@/components/ui/claude";
import { endingSoonDeals, ENDING_SOON_SUBTITLE } from "@/lib/ending-soon";
import { EmptyState } from "@/components/ui/states";
import {
  getLiveDeals,
  getSelectedNode,
  getAppUser,
  getFavouriteMerchantIds,
  getVerifiedCounts,
  type DealRow,
} from "@/lib/data";
import { dealPricing } from "@/lib/pricing";
import { DealCategoryChips } from "@/components/browse/deal-category-chips";
import {
  dealCategoryChips,
  filterDealsByCategory,
  parseDealCategory,
} from "@/lib/deal-categories";
import { feedEmptyState } from "@/lib/feed-empty-state";
import { NotificationOptIn } from "./notification-opt-in";
import { FeedControls } from "./feed-controls";
import { nodeCoords } from "@/lib/nodes";
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
    verified?: Map<string, number>;
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
    // Decision KPIs — rendered by the tall variants only (DealKpis).
    claimsCount: d.claims_count,
    maxClaims: d.max_claims,
    verifiedCount: opts.verified?.get(d.merchant_id) ?? null,
  };
}

/**
 * A deal's own rail tag, for the cross-cut "Ending soon" section.
 *
 * Mirrors how `getLiveDeals` buckets rails: flash by `deal_type`, boosted by an
 * active boost, everything else standard. Derived rather than passed in,
 * because this section holds deals from all three rails at once.
 */
function dealRailTag(d: DealRow): "flash" | "boosted" | "standard" {
  if (d.deal_type === "flash") return "flash";
  return d.boost_active ? "boosted" : "standard";
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: { sort?: string; filter?: string; category?: string };
}) {
  const node = getSelectedNode();
  const origin = nodeCoords(node);
  // Validated, not cast: an unrecognised ?sort= would otherwise reach the
  // distance branch and undo the locked order, and an unrecognised ?filter=
  // would empty every rail and claim there are no deals.
  const sort = parseDealListSort(searchParams?.sort, DEFAULT_FEED_SORT, FEED_SORT_OPTIONS);
  const filter = parseDealListFilter(searchParams?.filter);
  const category = parseDealCategory(searchParams?.category);
  const [{ flash, boosted, nearMe }, user] = await Promise.all([
    getLiveDeals(node),
    getAppUser(),
  ]);
  const favourites = await getFavouriteMerchantIds(user?.id);

  // Chips are derived from every live deal at this node, BEFORE the category
  // filter narrows anything — otherwise picking one chip removes the others and
  // the shopper cannot get back without editing the URL.
  const categoryOptions = dealCategoryChips([...flash, ...boosted, ...nearMe]);

  // `getLiveDeals` already returns each rail in its locked order, so the default
  // path leaves them alone — `sortDealRows` is a pass-through for "featured".
  // Only an explicit shopper choice re-sorts, and then it applies to all rails.
  // Category narrows before the rail sort, not after: the locked orders are
  // orders WITHIN a rail, so they hold on any subset of it. Sorting first and
  // filtering after would give the same list here, but only by accident — the
  // rank of a deal must not depend on which deals were filtered away.
  let flashDeals = sortDealRows(filterDealsByCategory(flash, category), sort, origin);
  let boostedDeals = sortDealRows(filterDealsByCategory(boosted, category), sort, origin);
  let nearDeals = sortDealRows(filterDealsByCategory(nearMe, category), sort, origin);

  // Counts at each stage, so an empty screen can name the filter that actually
  // emptied it instead of guessing. `liveTotal` is before any shopper filter;
  // `afterCategoryTotal` is after the category and before the deal type.
  const liveTotal = flash.length + boosted.length + nearMe.length;
  const afterCategoryTotal = flashDeals.length + boostedDeals.length + nearDeals.length;

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
  // H1 — the additive "Ending soon" selection.
  //
  // Derived from `allDeals`, which is AFTER the shopper's own category and type
  // filters, so it can never surface a deal those filters removed. It is a
  // cross-cut VIEW: every deal stays in its own rail in its locked order, and
  // nothing here reorders, promotes or removes anything (locked-feed-order).
  //
  // Urgency is the deal's own expires_at and nothing else — see lib/ending-soon.
  const endingSoon = endingSoonDeals(allDeals);
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

  // Verified redemptions per shop, for the decision KPIs on the tall cards.
  // One query over the merchants actually on screen — the KPI is omitted rather
  // than guessed if a shop is missing from the map.
  const verified = await getVerifiedCounts(
    Array.from(
      new Set([...allDeals, ...uniqueFavourites].map((d) => d.merchant_id))
    )
  );

  return (
    <Page>
      <ShopperTopBar node={node} />
      <Suspense fallback={null}>
        <FeedControls />
      </Suspense>
      {categoryOptions.length > 0 || category !== "all" ? (
        <Suspense fallback={null}>
          <div className="px-4 pb-3">
            <DealCategoryChips options={categoryOptions} />
          </div>
        </Suspense>
      ) : null}
      {user ? <NotificationOptIn /> : null}

      {total === 0 ? (
        <EmptyState {...feedEmptyState({ liveTotal, afterCategoryTotal, category, filter })} />
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
              {/* Direction A: the first flash deal is the one image-forward
                  lead; the rest of the rail continues beneath it. Order is
                  unchanged — the lead IS position 1 (locked-feed-order). */}
              <div className="px-4">
                <DealCard
                  variant="lead"
                  {...cardProps(flashDeals[0], { origin, favourites, verified, tag: "flash" })}
                />
              </div>
              {flashDeals.length > 1 ? (
                <RailScroller className="mt-3">
                  {flashDeals.slice(1).map((d) => (
                    <DealCard
                      key={d.id}
                      {...cardProps(d, { origin, favourites, verified, tag: "flash" })}
                    />
                  ))}
                </RailScroller>
              ) : null}
            </Section>
          ) : null}

          {endingSoon.length > 0 ? (
            <Section
              title="Ending soon"
              subtitle={ENDING_SOON_SUBTITLE}
              padded={false}
            >
              {/* Additive: these cards also remain in their own rails. The
                  section simply does not render when nothing is genuinely
                  ending, which is most of the time — an "Ending soon" rail
                  that always has content is manufacturing urgency. */}
              <RailScroller>
                {endingSoon.map((d) => (
                  <DealCard
                    key={`ending-${d.id}`}
                    {...cardProps(d, {
                      origin,
                      favourites,
                      verified,
                      // The card keeps the deal's OWN rail tag. This section
                      // cuts across rails, so tagging everything here
                      // "standard" would relabel a flash deal on one screen
                      // while its own rail still calls it flash.
                      tag: dealRailTag(d),
                    })}
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
                    {...cardProps(d, { origin, favourites, verified, tag: "boosted" })}
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
              {/* Direction A: one hero up top, everything else recedes — the
                  standard list draws as compact rows instead of stacked
                  image cards. Same deals, same order, same name. */}
              <div className="space-y-rail">
                {nearDeals.map((d) => (
                  <DealCard
                    key={d.id}
                    variant="row"
                    {...cardProps(d, { origin, favourites, verified, tag: "standard" })}
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
