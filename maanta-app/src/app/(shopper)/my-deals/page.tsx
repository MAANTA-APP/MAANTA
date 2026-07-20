import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, getVerifiedCounts } from "@/lib/data";
import { cn, formatCode } from "@/lib/ui";
import { EmptyState } from "@/components/ui/states";
import { ShopCard } from "@/components/ui/cards";
import { CountdownChip, ClaimChip } from "@/components/ui/chips";
import { FavouriteButton } from "@/components/favourite-button";

export const dynamic = "force-dynamic";

function LinkTabs({
  tabs,
  active,
}: {
  tabs: { href: string; label: string; value: string }[];
  active: string;
}) {
  return (
    <div className="flex overflow-hidden rounded-full border border-ink/80 bg-white p-0.5">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          className={cn(
            "flex h-9 flex-1 items-center justify-center rounded-full text-sm font-semibold",
            active === t.value ? "bg-ink text-white" : "text-muted"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** 8l My deals (claimed) + 8ab Favourites (Shops tab) + 8t empty. */
export default async function MyDealsPage({
  searchParams,
}: {
  searchParams: { tab?: string; when?: string };
}) {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/my-deals");

  const tab = searchParams.tab === "shops" ? "shops" : "deals";
  const when = searchParams.when === "past" ? "past" : "active";
  const service = createServiceClient();

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
      <main className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-ink">My deals</h1>
        <div className="mt-4">
          <LinkTabs
            active="shops"
            tabs={[
              { value: "deals", label: "Deals", href: "/my-deals" },
              { value: "shops", label: "Shops", href: "/my-deals?tab=shops" },
            ]}
          />
        </div>
        {rows.length === 0 ? (
          <EmptyState
            title="No saved shops yet"
            actionLabel="Browse deals"
            actionHref="/feed"
          />
        ) : (
          <div className="mt-5 space-y-3">
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
      </main>
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
    merchants: { merchant_name: string } | null;
    deals: { title: string; expires_at: string | null } | null;
  }[];

  const now = new Date();
  const isActive = (r: (typeof rows)[number]) =>
    r.status === "pending" && new Date(r.expires_at) > now;
  const shown = rows.filter((r) => (when === "active" ? isActive(r) : !isActive(r)));

  return (
    <main className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-ink">My deals</h1>
      <div className="mt-4">
        <LinkTabs
          active="deals"
          tabs={[
            { value: "deals", label: "Deals", href: "/my-deals" },
            { value: "shops", label: "Shops", href: "/my-deals?tab=shops" },
          ]}
        />
      </div>
      <div className="mt-3">
        <LinkTabs
          active={when}
          tabs={[
            { value: "active", label: "Active", href: "/my-deals" },
            { value: "past", label: "Past", href: "/my-deals?when=past" },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No claimed deals yet"
          actionLabel="Browse deals"
          actionHref="/feed"
        />
      ) : (
        <div className="mt-5 space-y-3">
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
                className="flex items-center gap-3 rounded-card border border-line bg-white px-4 py-4 hover:bg-cream/50"
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
                    {isActiveRow ? " · valid while the deal runs" : ""}
                  </p>
                  {isActiveRow ? (
                    <CountdownChip expiresAt={r.expires_at} className="mt-1.5" />
                  ) : null}
                </div>
                <ClaimChip state={state} className="flex-none" />
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
