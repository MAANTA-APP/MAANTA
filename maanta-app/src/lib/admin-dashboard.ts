import { ALL_NODES, NODES, nodeLabel } from "@/lib/nodes";

/**
 * Node selection for the admin dashboard (`/admin?node=…`).
 *
 * The switcher is URL state, not client state: a filtered view is a link an
 * admin can share, refresh, and open from a phone, and the server component
 * re-queries with the filter — no client JS involved.
 *
 * Validation is strict-with-a-fallback: an unknown `?node=` silently becomes
 * "All nodes" rather than erroring or, worse, string-matching into a filter
 * that returns zeros. A dashboard showing zeros for a typo'd node would read
 * as "the operation is dead", which is the one thing a glance surface must
 * never mis-say.
 */
export function resolveNodeParam(param: string | undefined): string {
  if (!param || param === ALL_NODES) return ALL_NODES;
  return NODES.some((n) => n.id === param) ? param : ALL_NODES;
}

/**
 * The switcher's targets: All nodes plus every LIVE node.
 *
 * Non-live registry entries (Two Rivers, Sarit) are excluded — a switcher tab
 * for a node with no merchants invites reading its zeros as a problem. They
 * appear the day `live` flips, with no code change here.
 */
export function nodeSwitcherTargets(): { id: string; label: string }[] {
  return [
    { id: ALL_NODES, label: nodeLabel(ALL_NODES) },
    ...NODES.filter((n) => n.live).map((n) => ({ id: n.id, label: n.short })),
  ];
}

/** True when the dashboard is filtered to one node. */
export function isNodeScoped(node: string): boolean {
  return node !== ALL_NODES;
}
