/** Node (mall) registry — BBS Mall is the launch node; others are coming soon. */
export const NODES = [
  { id: "BBS Mall", label: "BBS Mall, Eastleigh", short: "BBS Mall", live: true },
  { id: "Two Rivers Mall", label: "Two Rivers Mall", short: "Two Rivers", live: false },
  { id: "Sarit Centre", label: "Sarit Centre", short: "Sarit Centre", live: false },
] as const;

export const ALL_NODES = "all";
export const NODE_COOKIE = "maanta_node";
export const DEFAULT_NODE = "BBS Mall";

export function nodeShortLabel(id: string) {
  if (id === ALL_NODES) return "All nodes";
  return NODES.find((n) => n.id === id)?.short ?? id;
}
