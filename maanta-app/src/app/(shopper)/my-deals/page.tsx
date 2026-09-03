import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getAppUser, getVerifiedCounts } from "@/lib/data";
import { formatCode } from "@/lib/ui";
import { EmptyState } from "@/components/ui/states";
import {
  listReadState,
  listReadRows,
  SHOPPER_LIST_READ_ERROR,
} from "@/lib/shopper-read-state";
import { ShopCard } from "@/components/ui/cards";

import { isFastVisitEnabled } from "@/lib/fast-visit";
import { FAST_VISIT_WINDOW_MINUTES } from "@/lib/fast-visit-window";
import {
  MyDealsList,
  type MyDealsSort,
  type MyDealsTicket,
} from "@/components/shopper/my-deals-list";
import { FavouriteButton } from "@/components/favourite-button";
import {
  Body,
  HeadingLg,
  Page,
  Section,
  SegmentedLinks,
} from "@/components/ui/claude";
import { MyDealsControls } from "./my-deals-controls";
import { TicketOfflineNotice } from "@/components/shopper/ticket-offline-notice";

export const dynamic = "force-dynamic";

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
  const sort = (searchParams.sort as MyDealsSort) ?? "newest";
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
    const favsRead = await service
      .from("merchant_favourites")
      .select("merchant_id, merchants(id, merchant_name, floor)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const favsState = listReadState(favsRead);
    const rows = listReadRows(favsRead) as unknown as {
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
          {favsState === "failed" ? (
            // Not "no saved shops": a failed read must never assert that the
            // shopper saved nothing, and the invitation to go and save one
            // would be actively wrong for someone who already has.
            <EmptyState
              title={SHOPPER_LIST_READ_ERROR.title}
              sub={SHOPPER_LIST_READ_ERROR.sub}
            />
          ) : rows.length === 0 ? (
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

  // The error is kept, not discarded. `data ?? []` used to flatten a failed
  // read into an empty one, and this list is where a shopper keeps the codes
  // they redeem at a counter: telling them "No claimed deals yet" while they
  // hold a live ticket is how a redemption silently does not happen (D202, and
  // the same shape as D164/D185).
  const ticketsRead = await service
    .from("redemptions")
    .select(
      "id, otp_code, status, expires_at, redeemed_at, claimed_at, arrived_at, fast_visit_qualified_at, merchants(merchant_name), deals(title, expires_at)"
    )
    .eq("user_id", user.id)
    .order("redeemed_at", { ascending: false })
    .limit(50);
  const ticketsState = listReadState(ticketsRead);
  // Fast Visit is OFF and stays off. The chip resolves to "hidden" on every
  // row in that state — but the flag alone is the wrong gate, because a claim
  // that already qualified has EARNED its eligibility and must keep it if the
  // lever is flipped back (D198). fastVisitChipState() applies both rules.
  const fastVisitOn = await isFastVisitEnabled();

  const rows = listReadRows(ticketsRead) as unknown as {
    id: string;
    otp_code: string;
    status: string;
    expires_at: string;
    redeemed_at: string | null;
    claimed_at: string | null;
    arrived_at: string | null;
    fast_visit_qualified_at: string | null;
    merchants: { merchant_name: string } | null;
    deals: { title: string; expires_at: string | null } | null;
  }[];

  // D213 criterion 3 — this page does not read a clock. Which segment holds a
  // ticket is time-derived, so partitioning it here would freeze Active/Past
  // membership at render time; the whole already-authorised set is handed to
  // the client collection, which decides membership on the shared clock. No
  // refetch is involved: these are the same rows, classified at the right
  // moment instead of the wrong one.
  const tickets: MyDealsTicket[] = rows.map((r) => ({
    id: r.id,
    href: `/tickets/${r.id}`,
    code: formatCode(r.otp_code),
    status: r.status,
    expiresAt: r.expires_at,
    redeemedAt: r.redeemed_at,
    claimedAt: r.claimed_at,
    arrivedAt: r.arrived_at,
    qualifiedAt: r.fast_visit_qualified_at,
    countdownExpiresAt: r.deals?.expires_at ?? r.expires_at,
    merchantName: r.merchants?.merchant_name ?? null,
    dealTitle: r.deals?.title ?? null,
  }));

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

      {/* D235 — the worker serves this page from cache with no network, so the
          codes below are real and usable but the PAGE may be stale. Says so
          rather than letting a saved view pass as a live one. */}
      <TicketOfflineNotice />

      <Section className="mt-5">
        {ticketsState === "failed" ? (
          <EmptyState
            title={SHOPPER_LIST_READ_ERROR.title}
            sub={SHOPPER_LIST_READ_ERROR.sub}
          />
        ) : (
          <MyDealsList
            tickets={tickets}
            when={when}
            sort={sort}
            featureEnabled={fastVisitOn}
            windowMinutes={FAST_VISIT_WINDOW_MINUTES}
          />
        )}
      </Section>
    </Page>
  );
}
