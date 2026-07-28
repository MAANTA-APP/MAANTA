import { redirect } from "next/navigation";
import { BrowseClient } from "@/components/browse/browse-client";
import {
  getAppUser,
  getFavouriteMerchantIds,
  getLiveDeals,
  getSelectedNode,
} from "@/lib/data";
import { parseBrowseChip } from "@/lib/browse";
import {
  type DealListFilter,
  type DealListSort,
} from "@/lib/deal-list-controls";
import { DEFAULT_NODE, nodeCoords } from "@/lib/nodes";

export const dynamic = "force-dynamic";

/** Browse — list of live deals for the selected mall/node (map is at /map). */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams?: {
    lat?: string;
    lng?: string;
    dealId?: string;
    sort?: string;
    filter?: string;
    chip?: string;
  };
}) {
  // Legacy deep links from deal detail → standalone map.
  if (searchParams?.lat && searchParams?.lng) {
    const q = new URLSearchParams();
    q.set("lat", searchParams.lat);
    q.set("lng", searchParams.lng);
    if (searchParams.dealId) q.set("dealId", searchParams.dealId);
    redirect(`/map?${q.toString()}`);
  }

  const node = getSelectedNode();
  const origin = nodeCoords(node) ?? nodeCoords(DEFAULT_NODE)!;
  const sort = (searchParams?.sort as DealListSort) ?? "nearest";
  const filter = (searchParams?.filter as DealListFilter) ?? "all";
  const chip = parseBrowseChip(searchParams?.chip);
  const [{ flash, boosted, nearMe }, user] = await Promise.all([
    getLiveDeals(node),
    getAppUser(),
  ]);
  const favourites = await getFavouriteMerchantIds(user?.id);
  const deals = [...flash, ...boosted, ...nearMe];

  return (
    <BrowseClient
      node={node}
      deals={deals}
      origin={origin}
      favourites={Array.from(favourites)}
      sort={sort}
      filter={filter}
      chip={chip}
      isSignedIn={!!user}
    />
  );
}
