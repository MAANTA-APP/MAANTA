import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, getVerifiedCounts } from "@/lib/data";
import { formatCode } from "@/lib/ui";
import { EmptyState } from "@/components/ui/states";
import { ShopCard } from "@/components/ui/cards";
import { CountdownChip, ClaimChip } from "@/components/ui/chips";
import { FavouriteButton } from "@/components/favourite-button";
import {
  Body,
  HeadingLg,
  Page,
  Section,
  SegmentedLinks,
} from "@/components/ui/claude";
import { MyDealsControls } from "./my-deals-controls";

export const dynamic = "force-dynamic";

type SortKey = "newest" | "ending" | "redeemed";

function sortRedemptions<T extends { expires_at: string; redeemed_at: string | null }>(
  rows: T[],
  sort: SortKey
): T[] {
  const copy = [...rows];
  if (sort === "ending") {
    return copy.sort(
      (a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
    );
  }
  if (sort === "redeemed") {
    return copy.sort((a, b) => {
      const ar = a.redeemed_at ? new Date(a.redeemed_at).getTime() : 0;
      const br = b.redeemed_at ? new Date(b.redeemed_at).getTime() : 0;
      return br - ar;
    });
  }
  return copy.sort(
    (a, b) => new Date(b.expires_at).getTime() - new Date(a.expires_at).getTime()
  );
}

/** 8l My deals (claimed) + 8ab Favourites (Shops tab) + 8t empty. */
export default async function MyDealsPage({
  searchParams,
}: {
  searchParams: { tab?: string; when?: string; sort?: string };
}) {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/my-deals");

  const tab = searchParams.tab === "shops" ? "shops" : "deals";
  const when = searchParams.when === "past" ? "past" : "active";
  const sort = (searchParams.sort as SortKey) ?? "newest";
  const service = createServiceClient();

  const tabLinks = (
    <SegmentedLinks
      active={tab}
      tabs={[
        { value: "deals", label: "Deals", href: "/my-deals" },
        { value: "shops", label: "Shops", href: "/my-deals?tab=shops" },
      ]}
    />
  );

  if (tab === "shops") {
    const { data: favs } = await service
      .from("merchant_favourites")
      .select("merchant_id, merchants(id, merchant_name, floor)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const rows = (favs ?? []) as unknown as {
      merchant_id: string;
      merchants: { id: string; merchant_name: string; floor: string | null } | null;
    }[];
    const verified = await getVerifiedCounts(rows.map((r) => r.merchant_id));

    return (
      <Page className="px-0 pt-6">
        <div className="px-4">
          <HeadingLg>My deals</HeadingLg>
          <Body className="mt-1">Claimed deals and saved shops.</Body>
          <div className="mt-4">{tabLinks}</div>
        </div>
        <Section className="mt-5">
          {rows.length === 0 ? (
            <EmptyState
              title="No saved shops yet"
              sub="Tap the heart on a deal to save its shop here."
              actionLabel="Browse deals"
              actionHref="/feed"
            />
          ) : (
            <div className="space-y-3">
              {rows.map((r) =>
                r.merchants ? (
                  <ShopCard
                    key={r.merchant_id}
                    href={`/shops/${r.merchants.id}`}
                    name={r.merchants.merchant_name}
                    meta={r.merchants.floor ?? ""}
                    verifiedCount={verified.get(r.merchant_id) ?? 0}
                    favouriteSlot={
                      <FavouriteButton merchantId={r.merchant_id} initial={true} />
                    }
                  />
                ) : null
              )}
            </div>
          )}
        </Section>
      </Page>
    );
  }

  const { data } = await service
    .from("redemptions")
    .select(
      "id, otp_code, status, expires_at, redeemed_at, merchants(merchant_name), deals(title, expires_at)"
    )
    .eq("user_id", user.id)
    .order("redeemed_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as {
    id: string;
    otp_code: string;
    status: string;
    expires_at: string;
    redeemed_at: string | null;
    merchants: { merchant_name: string } | null;
    deals: { title: string; expires_at: string | null } | null;
  }[];

  const now = new Date();
  const isActive = (r: (typeof rows)[number]) =>
    r.status === "pending" && new Date(r.expires_at) > now;
  const shown = sortRedemptions(
    rows.filter((r) => (when === "active" ? isActive(r) : !isActive(r))),
    sort
  );

  return (
    <Page className="px-0 pt-6">
      <div className="px-4">
        <HeadingLg>My deals</HeadingLg>
        <Body className="mt-1">Claimed deals and saved shops.</Body>
        <div className="mt-4 space-y-2.5">
          {tabLinks}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <SegmentedLinks
              active={when}
              className="w-full sm:flex-1"
              tabs={[
                { value: "active", label: "Active", href: "/my-deals" },
                { value: "past", label: "Past", href: "/my-deals?when=past" },
              ]}
            />
            <Suspense fallback={null}>
              <MyDealsControls when={when} className="w-full sm:flex-1" />
            </Suspense>
          </div>
        </div>
      </div>

      <Section className="mt-5">
        {shown.length === 0 ? (
          // Past-tab copy must not claim the shopper has never claimed — they
          // may hold active tickets on the other segment.
          <EmptyState
            title={when === "past" ? "No past deals" : "No claimed deals yet"}
            sub={
              when === "past"
                ? "Redeemed and expired deals will show here."
                : undefined
            }
            actionLabel="Browse deals"
            actionHref="/feed"
          />
        ) : (
          <div className="space-y-3">
            {shown.map((r) => {
              const isActiveRow = r.status === "pending" && new Date(r.expires_at) > now;
              const state = isActiveRow
                ? "active"
                : r.status === "success"
                  ? "redeemed"
                  : "expired";
              return (
                <Link
                  key={r.id}
                  href={`/tickets/${r.id}`}
                  className="flex items-center gap-3 rounded-card bg-white px-4 py-4 shadow-card hover:bg-stone-soft/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {r.merchants?.merchant_name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">{r.deals?.title}</p>
                    <p className="tnum mt-1 text-xs text-secondary">
                      <span className="font-code tracking-[0.06em]">
                        {formatCode(r.otp_code)}
                      </span>
                    </p>
                    {isActiveRow ? (
                      <CountdownChip expiresAt={r.deals?.expires_at ?? r.expires_at} className="mt-1.5" />
                    ) : null}
                  </div>
                  <ClaimChip state={state} className="flex-none" />
                </Link>
              );
            })}
          </div>
        )}
      </Section>
    </Page>
  );
}
