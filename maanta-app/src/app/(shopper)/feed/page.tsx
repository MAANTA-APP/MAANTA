import Link from "next/link";
import { ShopperTopBar } from "@/components/nav/shopper-top-bar";
import { DiscoverDealCard } from "@/components/discover-deal-card";
import { EmptyState } from "@/components/ui/states";
import {
  getLiveDeals,
  getSelectedNode,
  getAppUser,
  getFavouriteMerchantIds,
  type DealRow,
} from "@/lib/data";
import { dealPricing } from "@/lib/pricing";
import { IconBolt } from "@/components/ui/icons";
import { NotificationOptIn } from "./notification-opt-in";
import { nodeCoords } from "@/lib/nodes";
import { collectionWindowLabel } from "@/lib/browse";
import { distanceMeters, formatDistanceMeters } from "@/lib/what3words";

export const dynamic = "force-dynamic";

function Rail({
  title,
  icon,
  seeAllHref,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  seeAllHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between px-4">
        <h2 className="flex items-center gap-1.5 text-base font-bold text-ink">
          {icon}
          {title}
        </h2>
        {seeAllHref ? (
          <Link href={seeAllHref} className="text-xs font-semibold text-muted">
            See all ›
          </Link>
        ) : null}
      </div>
      <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
        {children}
      </div>
    </section>
  );
}

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
    tag: "flash" | "boosted" | null;
  }
) {
  const pricing = dealPricing(d);
  return {
    href: `/deals/${d.id}`,
    imageUrl: d.image_url,
    merchantName: d.merchants?.merchant_name ?? "",
    mallName: d.merchants?.mall_name ?? d.node,
    title: d.title,
    collectionLabel: collectionWindowLabel(d.starts_at, d.expires_at),
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

export default async function FeedPage() {
  const node = getSelectedNode();
  const origin = nodeCoords(node);
  const [{ flash, boosted, nearMe }, user] = await Promise.all([
    getLiveDeals(node),
    getAppUser(),
  ]);
  const favourites = await getFavouriteMerchantIds(user?.id);

  const allDeals = [...flash, ...boosted, ...nearMe];
  const favouriteDeals = allDeals.filter((d) => favourites.has(d.merchant_id));
  // Dedupe by deal id (a merchant can appear in multiple rails conceptually).
  const seen = new Set<string>();
  const uniqueFavourites = favouriteDeals.filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  const total = flash.length + boosted.length + nearMe.length;

  return (
    <main>
      <ShopperTopBar node={node} />
      {user ? <NotificationOptIn /> : null}

      {total === 0 ? (
        <EmptyState
          title="No deals live right now"
          sub="Merchants drop new deals through the day."
        />
      ) : (
        <>
          {flash.length > 0 ? (
            <Rail
              title="Flash deals near you"
              icon={<IconBolt className="h-4 w-4 text-ink" />}
              seeAllHref="/search?type=flash"
            >
              {flash.map((d) => (
                <DiscoverDealCard
                  key={d.id}
                  {...cardProps(d, { origin, favourites, tag: "flash" })}
                />
              ))}
            </Rail>
          ) : null}

          {boosted.length > 0 ? (
            <Rail title="Boosted deals near you" seeAllHref="/search?type=boosted">
              {boosted.map((d) => (
                <DiscoverDealCard
                  key={d.id}
                  {...cardProps(d, { origin, favourites, tag: "boosted" })}
                />
              ))}
            </Rail>
          ) : null}

          {nearMe.length > 0 ? (
            <section className="mt-6 px-4 pb-2">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-ink">Standard deals near you</h2>
                <Link
                  href="/browse"
                  className="text-xs font-semibold text-muted"
                >
                  Map ›
                </Link>
              </div>
              <div className="mt-3 space-y-4">
                {nearMe.map((d) => (
                  <DiscoverDealCard
                    key={d.id}
                    variant="vertical"
                    {...cardProps(d, { origin, favourites, tag: null })}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {uniqueFavourites.length > 0 ? (
            <Rail title="Your favourites">
              {uniqueFavourites.map((d) => (
                <DiscoverDealCard
                  key={`fav-${d.id}`}
                  {...cardProps(d, {
                    origin,
                    favourites,
                    tag:
                      d.deal_type === "flash"
                        ? "flash"
                        : d.boost_active
                          ? "boosted"
                          : null,
                  })}
                />
              ))}
            </Rail>
          ) : null}
        </>
      )}
    </main>
  );
}
