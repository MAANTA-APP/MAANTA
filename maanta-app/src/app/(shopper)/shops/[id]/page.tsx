import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, getVerifiedCounts, withPublicMerchantRows } from "@/lib/data";
import { W3wChip, CountdownChip } from "@/components/ui/chips";
import { IconArrowLeft, IconCheck, IconChevronRight, IconImage } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/button";
import { CoverImage } from "@/components/ui/cards";
import { FavouriteButton } from "@/components/favourite-button";

export const dynamic = "force-dynamic";

/** 8ac Shop profile (customer-facing). */
export default async function ShopProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const service = createServiceClient();
  // Public storefront: only render for a publicly-visible, active merchant
  // (status='active' AND is_visible AND NOT is_shadow_banned). Filtering in the
  // query means the row simply isn't returned for a pending/suspended shop.
  const { data: shop } = await withPublicMerchantRows(
    service
      .from("merchants")
      .select(
        "id, merchant_name, floor, unit_number, what3words_address, mall_name, node"
      )
      .eq("id", params.id)
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

  const [{ data: deals }, verified] = await Promise.all([
    service
      .from("deals")
      .select("id, title, image_url, expires_at, deal_type")
      .eq("merchant_id", shop.id)
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true }),
    getVerifiedCounts([shop.id]),
  ]);

  const w3wHref = `https://what3words.com/${shop.what3words_address.replace(/^\/+/, "")}`;

  return (
    <main className="pb-10">
      <div className="relative flex h-44 items-center justify-center bg-cream-dark text-faint">
        <IconImage className="h-8 w-8" aria-label="Shop photo" />
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
          {shop.floor ? ` · ${shop.floor}` : ""} ·{" "}
          <W3wChip address={shop.what3words_address} />
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
                className="flex items-center gap-3 rounded-card border border-line bg-white p-3 hover:bg-cream/50"
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

        <ButtonLink
          href={w3wHref}
          variant="ghost"
          full
          className="mt-8"
          target="_blank"
          rel="noopener noreferrer"
        >
          Navigate to shop
        </ButtonLink>
      </div>
    </main>
  );
}
