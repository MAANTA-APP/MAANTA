import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, getVerifiedCounts, withPublicMerchantRows } from "@/lib/data";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { W3wChip, CountdownChip } from "@/components/ui/chips";
import { IconArrowLeft, IconCheck, IconChevronRight, IconImage } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { CoverImage } from "@/components/ui/cards";
import { FavouriteButton } from "@/components/favourite-button";
import { shopNavigationTarget } from "@/lib/shop-location";
import { navigationState, SHOP_LOCATION_UNAVAILABLE } from "@/lib/shopper-read-state";

export const dynamic = "force-dynamic";

/** 8ac Shop profile (customer-facing). */
export default async function ShopProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const service = createServiceClient();
  // Synthetic rows are excluded unless demo mode is explicitly on.
  const includeDemo = await isDemoModeEnabled();
  // Public storefront: only render for a publicly-visible, active merchant
  // (status='active' AND is_visible AND NOT is_shadow_banned). Filtering in the
  // query means the row simply isn't returned for a pending/suspended shop.
  const { data: shop } = await withPublicMerchantRows(
    service
      .from("merchants")
      .select(
        "id, merchant_name, floor, unit_number, what3words_address, lat, lng, mall_name, node"
      )
      .eq("id", params.id),
    { includeDemo }
  ).maybeSingle();

  if (!shop) notFound();

  const user = await getAppUser();
  let isFav = false;
  if (user) {
    const { data: fav } = await service
      .from("merchant_favourites")
      .select("id")
      .eq("user_id", user.id)
      .eq("merchant_id", shop.id)
      .maybeSingle();
    isFav = !!fav;
  }

  // The merchant gate above already makes a demo shop unreachable in launch
  // mode, so this second filter is belt-and-braces: it keeps the rule "no
  // synthetic row renders unless demo mode is on" true per-row rather than
  // relying on demo deals only ever hanging off demo merchants.
  let dealsQuery = service
    .from("deals")
    .select("id, title, image_url, expires_at, deal_type")
    .eq("merchant_id", shop.id)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString());
  if (!includeDemo) dealsQuery = dealsQuery.eq("is_demo", false);

  const [{ data: deals }, verified] = await Promise.all([
    dealsQuery.order("expires_at", { ascending: true }),
    getVerifiedCounts([shop.id]),
  ]);

  // D162 — a shop may be coordinate-only, so "Navigate" resolves per shop and
  // can be absent entirely rather than crashing on a null address.
  const navigate = shopNavigationTarget(shop);

  return (
    <main className="pb-10">
      <div className="relative flex h-44 items-center justify-center bg-cream-dark text-faint">
        <IconImage className="h-8 w-8" />
        <Link
          href="/feed"
          aria-label="Back"
          className="absolute left-4 top-4 rounded-full bg-white/90 p-2 text-ink shadow"
        >
          <IconArrowLeft className="h-5 w-5" />
        </Link>
      </div>

      <div className="px-4 pt-5">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-ink">{shop.merchant_name}</h1>
          {user ? (
            <FavouriteButton merchantId={shop.id} initial={isFav} />
          ) : null}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
          {shop.mall_name ?? shop.node}
          {shop.floor ? ` · ${shop.floor}` : ""}
          {shop.what3words_address ? (
            <>
              {" · "}
              <W3wChip address={shop.what3words_address} />
            </>
          ) : null}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <IconCheck className="h-4 w-4 text-verified" />
          {verified.get(shop.id) ?? 0} verified redemptions
        </p>

        <h2 className="mt-7 text-base font-bold text-ink">Live deals</h2>
        <div className="mt-3 space-y-3">
          {(deals ?? []).length === 0 ? (
            <p className="text-sm text-muted">No live deals right now.</p>
          ) : (
            (deals ?? []).map((d) => (
              <Link
                key={d.id}
                href={`/deals/${d.id}`}
                className="flex items-center gap-3 rounded-card bg-white shadow-card p-3 hover:bg-cream/50"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-cream">
                  <CoverImage src={d.image_url} alt="" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{d.title}</p>
                  <CountdownChip expiresAt={d.expires_at} className="mt-1" />
                </div>
                <IconChevronRight className="h-4 w-4 text-faint" />
              </Link>
            ))
          )}
        </div>

        {navigationState(navigate) === "available" && navigate ? (
          <ButtonLink
            href={navigate.href}
            variant="ghost"
            full
            className="mt-8"
            {...(navigate.external
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            Navigate to shop
          </ButtonLink>
        ) : (
          // Absent wayfinding is stated, not silent. The control used to
          // render as `: null`, so a shop with neither a what3words address
          // nor coordinates offered no route AND no explanation — which reads
          // as a broken screen rather than an incomplete shop record.
          <p className="mt-8 text-sm text-muted">{SHOP_LOCATION_UNAVAILABLE}</p>
        )}
      </div>
    </main>
  );
}
