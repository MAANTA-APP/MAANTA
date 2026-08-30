import { MapClient } from "./map-client";
import { getShopperLiveDeals, getSelectedNode } from "@/lib/data";
import { DEFAULT_NODE, nodeCoords } from "@/lib/nodes";

export const dynamic = "force-dynamic";

function parseCoord(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Dedicated full-screen map for the shopper's current mall/node. */
export default async function MapPage({
  searchParams,
}: {
  searchParams?: { lat?: string; lng?: string; dealId?: string };
}) {
  const node = getSelectedNode();
  const origin = nodeCoords(node) ?? nodeCoords(DEFAULT_NODE)!;
  const { flash, boosted, nearMe } = await getShopperLiveDeals(node);
  const deals = [...flash, ...boosted, ...nearMe];

  return (
    <MapClient
      node={node}
      deals={deals}
      origin={origin}
      initialLat={parseCoord(searchParams?.lat)}
      initialLng={parseCoord(searchParams?.lng)}
      initialDealId={
        typeof searchParams?.dealId === "string" ? searchParams.dealId : null
      }
    />
  );
}
