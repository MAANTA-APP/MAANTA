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

/** Browse — list of live deals for the selected mall/node (map is at /map). */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams?: {
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
    />
  );
}
