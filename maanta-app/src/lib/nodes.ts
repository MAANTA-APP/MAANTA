/** Node (mall) registry — BBS Mall is Node 0; CBD + Westlands are rehearsal nodes. */
export const NODES = [
  {
    id: "BBS Mall",
    label: "BBS Mall, Eastleigh",
    short: "BBS Mall",
    slug: "bbs_mall",
    live: true,
    // Approximate mall centroid (Eastleigh, Nairobi) for map center / distance.
    lat: -1.2746,
    lng: 36.8501,
    what3words_address: "stored.riches.shine",
  },
  {
    id: "CBD Galleria",
    label: "CBD Galleria, Nairobi",
    short: "CBD Galleria",
    slug: "cbd_galleria",
    live: true,
    lat: -1.2864,
    lng: 36.8172,
    what3words_address: "market.square.entry",
  },
  {
    id: "Westlands Hub",
    label: "Westlands Hub, Nairobi",
    short: "Westlands Hub",
    slug: "westlands_hub",
    live: true,
    lat: -1.2674,
    lng: 36.8075,
    what3words_address: "bright.mango.lane",
  },
  {
    id: "Two Rivers Mall",
    label: "Two Rivers Mall",
    short: "Two Rivers",
    slug: "two_rivers",
    live: false,
    lat: -1.2105,
    lng: 36.7958,
    what3words_address: null as string | null,
  },
  {
    id: "Sarit Centre",
    label: "Sarit Centre",
    short: "Sarit Centre",
    slug: "sarit_centre",
    live: false,
    lat: -1.2615,
    lng: 36.8025,
    what3words_address: null as string | null,
  },
] as const;

export type NodeEntry = (typeof NODES)[number];

export const ALL_NODES = "all";
export const NODE_COOKIE = "maanta_node";
export const DEFAULT_NODE = "BBS Mall";

export function nodeLabel(id: string) {
  if (id === ALL_NODES) return "All nodes";
  return NODES.find((n) => n.id === id)?.label ?? id;
}

/** Map/distance origin for a selected node cookie value. */
export function nodeCoords(id: string): { lat: number; lng: number } | null {
  if (id === ALL_NODES) {
    const live = NODES.find((n) => n.live);
    return live ? { lat: live.lat, lng: live.lng } : null;
  }
  const n = NODES.find((entry) => entry.id === id);
  return n ? { lat: n.lat, lng: n.lng } : null;
}
