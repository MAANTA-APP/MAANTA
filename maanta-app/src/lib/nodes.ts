/** Node (mall) registry — BBS Mall is the launch node; others are coming soon. */
export const NODES = [
  {
    id: "BBS Mall",
    label: "BBS Mall, Eastleigh",
    short: "BBS Mall",
    live: true,
    // Approximate mall centroid (Eastleigh, Nairobi) for map center / distance.
    lat: -1.2746,
    lng: 36.8501,
    what3words_address: "stored.riches.shine",
  },
  {
    id: "Two Rivers Mall",
    label: "Two Rivers Mall",
    short: "Two Rivers",
    live: false,
    lat: -1.2105,
    lng: 36.7958,
    what3words_address: null as string | null,
  },
  {
    id: "Sarit Centre",
    label: "Sarit Centre",
    short: "Sarit Centre",
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

export function nodeShortLabel(id: string) {
  if (id === ALL_NODES) return "All nodes";
  return NODES.find((n) => n.id === id)?.short ?? id;
}

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
