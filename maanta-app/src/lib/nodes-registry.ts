import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { NODES, type NodeEntry } from "@/lib/nodes";

/**
 * Server-side reader for `public.nodes` — the registry table added by
 * `supabase/migrations/20260802120000_nodes_registry.sql` for drift **D72**.
 *
 * Where this sits relative to `src/lib/nodes.ts`, because the split is the
 * whole point and is easy to get backwards:
 *
 *  - **The table is the source of truth for which nodes exist.** It carries the
 *    foreign key from `deals.node` and `merchants.node`, so a node value that
 *    is not a row cannot be written at all. Registering a mall is an INSERT.
 *  - **`nodes.ts` is a build-time cache of that table**, used by client
 *    components and by the synchronous `getSelectedNode()` cookie check, which
 *    cannot await a query. It is not authoritative and must never disagree —
 *    `src/lib/__tests__/nodes-registry-parity.test.ts` fails the build if it
 *    does, comparing the constant against the migration's seed field by field.
 *
 * So adding a mall today is: insert the row, update the constant, and the
 * parity guard fails if you do only one. Making the app read this table on
 * every surface — which is what removes the deploy entirely — is the remaining
 * half of D72 and is tracked there, not silently assumed here.
 */

export type NodeRecord = {
  /** Opaque stable key. Never render it — use `label` or `shortLabel`. */
  id: string;
  slug: string;
  label: string;
  shortLabel: string;
  mallName: string | null;
  lat: number | null;
  lng: number | null;
  what3wordsAddress: string | null;
  isLive: boolean;
  displayOrder: number;
};

type NodeRow = {
  id: string;
  slug: string;
  label: string;
  short_label: string;
  mall_name: string | null;
  lat: number | null;
  lng: number | null;
  what3words_address: string | null;
  is_live: boolean;
  display_order: number;
};

const NODE_COLUMNS =
  "id, slug, label, short_label, mall_name, lat, lng, what3words_address, is_live, display_order";

function fromRow(row: NodeRow): NodeRecord {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    shortLabel: row.short_label,
    mallName: row.mall_name,
    lat: row.lat,
    lng: row.lng,
    what3wordsAddress: row.what3words_address,
    isLive: row.is_live,
    displayOrder: row.display_order,
  };
}

/**
 * The compiled-in registry, in the same shape the table returns.
 *
 * Used when the database cannot be reached. Safe precisely because the parity
 * guard proves the two agree: falling back cannot show a node the table does
 * not have. A mall registered by INSERT alone — with no matching deploy — is
 * the one case the fallback would miss, and that is the case the parity guard
 * exists to make impossible to ship.
 */
function compiledNodes(): NodeRecord[] {
  return NODES.map((n: NodeEntry, i) => ({
    id: n.id,
    slug: n.slug,
    label: n.label,
    shortLabel: n.short,
    mallName: null,
    lat: n.lat,
    lng: n.lng,
    what3wordsAddress: n.what3words_address ?? null,
    isLive: n.live,
    displayOrder: i,
  }));
}

async function readNodes(): Promise<NodeRecord[]> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("nodes")
      .select(NODE_COLUMNS)
      .order("display_order", { ascending: true })
      .order("label", { ascending: true });

    // Say so when falling back. The compiled list is close enough to the table
    // that a silent degrade is invisible — which is the problem: the case this
    // fallback exists for is "the migration has not been applied yet", and that
    // would otherwise look identical to a healthy read forever. Raised in
    // review of the PR that added this.
    if (error) {
      console.error("nodes registry read failed, using compiled nodes:", error);
      return compiledNodes();
    }
    if (!data || data.length === 0) {
      console.error(
        "nodes registry returned no rows, using compiled nodes — has 20260802120000_nodes_registry.sql been applied?"
      );
      return compiledNodes();
    }
    return (data as unknown as NodeRow[]).map(fromRow);
  } catch (err) {
    console.error("nodes registry read threw, using compiled nodes:", err);
    return compiledNodes();
  }
}

/**
 * Every registered node, live or not.
 *
 * Cached for five minutes. Nodes change on the order of months, and unlike the
 * demo-mode flag — which is deliberately uncached because a stale `true` shows
 * synthetic data to real users — a stale node list is inert: the worst case is
 * that a newly registered mall takes five minutes to appear in a switcher.
 * Retiring a node is not urgent either, since `is_live` gates selection and the
 * foreign key keeps historical rows valid regardless.
 */
export const getNodes = unstable_cache(readNodes, ["nodes-registry"], {
  revalidate: 300,
  tags: ["nodes-registry"],
});

/** Nodes a shopper may currently select. */
export async function getLiveNodes(): Promise<NodeRecord[]> {
  return (await getNodes()).filter((n) => n.isLive);
}

/** One node by its opaque id, or null when it is not registered. */
export async function getNode(id: string): Promise<NodeRecord | null> {
  return (await getNodes()).find((n) => n.id === id) ?? null;
}
