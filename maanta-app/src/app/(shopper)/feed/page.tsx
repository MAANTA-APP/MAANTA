import Link from "next/link";
import { ShopperTopBar } from "@/components/nav/shopper-top-bar";
import { DealCardHorizontal, DealCardVertical } from "@/components/ui/cards";
import { EmptyState } from "@/components/ui/states";
import { getLiveDeals, getSelectedNode, getAppUser } from "@/lib/data";
import { IconBolt } from "@/components/ui/icons";
import { NotificationOptIn } from "./notification-opt-in";

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
      <div className="no-scrollbar mt-3 flex gap-3 overflow-x-auto px-4">{children}</div>
    </section>
  );
}

export default async function FeedPage() {
  const node = getSelectedNode();
  const [{ flash, boosted, nearMe, verifiedByMerchant }, user] = await Promise.all([
    getLiveDeals(node),
    getAppUser(),
  ]);

  const total = flash.length + boosted.length + nearMe.length;

  return (
    <main>
      <ShopperTopBar node={node} />
      {user ? <NotificationOptIn /> : null}

      {total === 0 ? (
        <EmptyState title="No live deals right now" sub="Check back soon" />
      ) : (
        <>
          {flash.length > 0 ? (
            <Rail
              title="Flash Deals"
              icon={<IconBolt className="h-4 w-4 text-ink" />}
              seeAllHref="/search?type=flash"
            >
              {flash.map((d) => (
                <DealCardHorizontal
                  key={d.id}
                  href={`/deals/${d.id}`}
                  imageUrl={d.image_url}
                  title={`${d.merchants?.merchant_name} — ${d.title}`}
                  tag="flash"
                  verifiedCount={verifiedByMerchant.get(d.merchant_id) ?? 0}
                />
              ))}
            </Rail>
          ) : null}

          {boosted.length > 0 ? (
            <Rail title="Priority Placements" seeAllHref="/search?type=boosted">
              {boosted.map((d) => (
                <DealCardHorizontal
                  key={d.id}
                  href={`/deals/${d.id}`}
                  imageUrl={d.image_url}
                  title={`${d.merchants?.merchant_name} — ${d.title}`}
                  tag="boosted"
                  verifiedCount={verifiedByMerchant.get(d.merchant_id) ?? 0}
                />
              ))}
            </Rail>
          ) : null}

          {nearMe.length > 0 ? (
            <section className="mt-6 px-4">
              <h2 className="text-base font-bold text-ink">Deals Near Me</h2>
              <p className="mt-0.5 text-[11px] text-faint">
                ranked by verified redemptions
              </p>
              <div className="mt-3 space-y-4">
                {nearMe.map((d) => (
                  <DealCardVertical
                    key={d.id}
                    href={`/deals/${d.id}`}
                    imageUrl={d.image_url}
                    merchantName={d.merchants?.merchant_name ?? ""}
                    floor={d.merchants?.floor ?? null}
                    title={d.title}
                    dealType={d.deal_type}
                    verifiedCount={verifiedByMerchant.get(d.merchant_id) ?? 0}
                    expiresAt={d.expires_at}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
