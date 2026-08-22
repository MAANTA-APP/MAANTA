import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { KpiCard } from "@/components/ui/cards";
import { StatusChip } from "@/components/ui/chips";
import { formatKes, relativeAge } from "@/lib/ui";
import { ALL_NODES, nodeLabel } from "@/lib/nodes";
import { isNodeScoped, nodeSwitcherTargets, resolveNodeParam } from "@/lib/admin-dashboard";
import { cn } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * 11-series admin home — the whole operation at a glance, filterable by node.
 *
 * Replaces the approvals queue as the console's front door; the queue moved to
 * `/admin/approvals` unchanged.
 *
 * **How node scoping actually works, because the schema decides it.** Only
 * `merchants` and `deals` carry a `node` column. Redemptions, the ledger and
 * agent tasks reach a node only through their merchant. So a scoped view
 * resolves the node's merchant ids once and filters everything else by
 * `merchant_id in (…)` — one extra query, and every number on the page then
 * means the same thing. Deriving some numbers per-node and leaving others
 * global would produce a dashboard whose rows silently disagree, which is worse
 * than no filter at all.
 *
 * Every window is stated in its own label. A KPI whose period is a guess is a
 * KPI an operator cannot act on.
 */
export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: { node?: string };
}) {
  await requireAdminPage();

  const node = resolveNodeParam(searchParams.node);
  const scoped = isNodeScoped(node);
  const service = createServiceClient();

  const now = new Date().toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  // The node's merchant set — the join every non-node-carrying table needs.
  let merchantIds: string[] | null = null;
  if (scoped) {
    const { data } = await service.from("merchants").select("id").eq("node", node);
    merchantIds = (data ?? []).map((m) => m.id);
  }
  // An empty node (real: a live node with no merchants yet) must filter to
  // nothing rather than degrade to unfiltered. A sentinel id keeps `.in()` valid.
  const scopeIds = merchantIds && merchantIds.length === 0 ? [NO_MATCH] : merchantIds;

  const byMerchant = <T,>(q: T): T =>
    scopeIds ? ((q as { in: (c: string, v: string[]) => T }).in("merchant_id", scopeIds) as T) : q;

  // Same shape for the merchants table, which carries `node` directly. Generic
  // passthrough rather than a wrapper object: PostgREST types the row from the
  // literal select string, and a helper taking `cols: string` erases it.
  const atNode = <T,>(q: T): T =>
    scoped ? ((q as { eq: (c: string, v: string) => T }).eq("node", node) as T) : q;

  const [
    { count: pendingMerchants },
    { count: activeMerchants },
    { count: liveDeals },
    { count: claims7d },
    { count: verified7d },
    { count: heldRedemptions },
    { count: openTasks },
    { data: fees7d },
    { data: arrearsRows },
    { data: recentPending },
  ] = await Promise.all([
    atNode(
      service.from("merchants").select("id", { count: "exact", head: true }).eq("status", "pending")
    ),
    atNode(
      service.from("merchants").select("id", { count: "exact", head: true }).eq("status", "active")
    ),
    scoped
      ? service
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .gt("expires_at", now)
          .eq("node", node)
      : service
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true)
          .gt("expires_at", now),
    byMerchant(
      service.from("redemptions").select("id", { count: "exact", head: true }).gte("created_at", since7d)
    ),
    byMerchant(
      service
        .from("redemptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "success")
        .gte("redeemed_at", since7d)
    ),
    byMerchant(
      service.from("redemptions").select("id", { count: "exact", head: true }).eq("status", "flagged")
    ),
    byMerchant(
      service.from("agent_tasks").select("id", { count: "exact", head: true }).eq("is_complete", false)
    ),
    byMerchant(
      service
        .from("merchant_transactions")
        .select("amount")
        .eq("transaction_type", "success_fee")
        .gte("created_at", since7d)
    ),
    atNode(
      service.from("merchants").select("outstanding_arrears").gt("outstanding_arrears", 0)
    ),
    atNode(
      service
        .from("merchants")
        .select("id, merchant_name, floor, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5)
    ),
  ]);

  const revenue7d = (fees7d ?? []).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
  const arrearsTotal = (arrearsRows ?? []).reduce(
    (s, r) => s + Number(r.outstanding_arrears ?? 0),
    0
  );
  const targets = nodeSwitcherTargets();

  return (
    <main className="max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Operations</h1>
        <p className="text-xs text-muted">
          {scoped ? nodeLabel(node) : "All nodes"} · live now, 7-day windows where labelled
        </p>
      </div>

      {/* Node switcher — links, not client state, so a filtered view is shareable. */}
      <nav aria-label="Filter by node" className="mt-4 flex flex-wrap gap-2">
        {targets.map((t) => {
          const active = t.id === node;
          return (
            <Link
              key={t.id}
              href={t.id === ALL_NODES ? "/admin" : `/admin?node=${encodeURIComponent(t.id)}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold",
                active ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* Needs a human — first, because this is what a glance is for. */}
      <h2 className="mt-7 text-base font-bold text-ink">Needs a human</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QueueCard
          label="Pending approvals"
          value={pendingMerchants ?? 0}
          href="/admin/approvals"
        />
        <QueueCard label="Held redemptions" value={heldRedemptions ?? 0} href="/admin/redemptions" />
        <QueueCard label="Open support tasks" value={openTasks ?? 0} href="/admin/support" />
        <QueueCard
          label="Merchants in arrears"
          value={(arrearsRows ?? []).length}
          href="/admin/billing"
        />
      </div>

      <h2 className="mt-7 text-base font-bold text-ink">The loop (7 days)</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Claims (7d)" value={(claims7d ?? 0).toLocaleString()} />
        <KpiCard label="Verified (7d)" value={(verified7d ?? 0).toLocaleString()} />
        <KpiCard label="Success fees (7d)" value={formatKes(revenue7d)} />
        <KpiCard label="Arrears outstanding" value={formatKes(arrearsTotal)} />
      </div>

      <h2 className="mt-7 text-base font-bold text-ink">Supply</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Active merchants" value={(activeMerchants ?? 0).toLocaleString()} />
        <KpiCard label="Live deals" value={(liveDeals ?? 0).toLocaleString()} />
      </div>

      <div className="mt-7 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-ink">Latest approvals waiting</h2>
        <Link href="/admin/approvals" className="text-sm font-semibold text-secondary hover:text-ink">
          Full queue
        </Link>
      </div>
      <div className="mt-2 space-y-2">
        {(recentPending ?? []).length === 0 ? (
          <p className="rounded-card bg-white shadow-card px-4 py-6 text-center text-sm text-muted">
            {scoped
              ? `No shops waiting at ${nodeLabel(node)}`
              : "No shops waiting for approval"}
          </p>
        ) : (
          (recentPending ?? []).map((m) => (
            <Link
              key={m.id}
              href={`/admin/merchants/${m.id}`}
              className="flex flex-wrap items-center gap-3 rounded-card bg-white shadow-card px-4 py-3 hover:bg-stone-soft"
            >
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                {m.merchant_name}
                {m.floor ? ` — ${m.floor}` : ""}
              </span>
              <span className="text-xs text-muted">{relativeAge(m.created_at)} ago</span>
              <StatusChip status="pending" />
            </Link>
          ))
        )}
      </div>

      {scoped ? (
        <p className="mt-6 text-xs text-muted">
          Scoped to {nodeLabel(node)}. Redemptions, fees and tasks have no node of their own —
          they are counted through that node&apos;s merchants, so every figure above covers the
          same set.
        </p>
      ) : null}
    </main>
  );
}

/** A UUID no row can hold — filters an empty node to nothing rather than to everything. */
const NO_MATCH = "00000000-0000-0000-0000-000000000000";

/** A queue count that is also its own way in. Zero is stated, never hidden. */
function QueueCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-card bg-white shadow-card p-4 hover:bg-stone-soft"
    >
      <p className="text-xs text-muted">{label}</p>
      <p className="tnum mt-1 text-2xl font-bold text-ink">{value.toLocaleString()}</p>
    </Link>
  );
}
