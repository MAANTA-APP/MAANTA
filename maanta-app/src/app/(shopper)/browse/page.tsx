import { BrowseClient } from "@/components/browse/browse-client";
import {
  getAppUser,
  getFavouriteMerchantIds,
  getLiveDeals,
  getSelectedNode,
} from "@/lib/data";
import {
  type DealListFilter,
  type DealListSort,
} from "@/lib/deal-list-controls";
import { DEFAULT_NODE, nodeCoords } from "@/lib/nodes";

export const dynamic = "force-dynamic";

function parseCoord(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Browse — map + list of live deals for the selected mall/node. */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams?: {
    lat?: string;
    lng?: string;
    dealId?: string;
    sort?: string;
    filter?: string;
  };
}) {
  const node = getSelectedNode();
  const origin = nodeCoords(node) ?? nodeCoords(DEFAULT_NODE)!;
  const sort = (searchParams?.sort as DealListSort) ?? "nearest";
  const filter = (searchParams?.filter as DealListFilter) ?? "all";
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
      initialLat={parseCoord(searchParams?.lat)}
      initialLng={parseCoord(searchParams?.lng)}
      initialDealId={
        typeof searchParams?.dealId === "string" ? searchParams.dealId : null
      }
    />
  );
}
