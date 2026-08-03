import Link from "next/link";
import { requireFounderPage } from "@/lib/founder";
import { createServiceClient } from "@/lib/supabase/service";
import { HeadingLg, Body, Page, Section } from "@/components/ui/claude";
import { KpiCard } from "@/components/ui/cards";
import { formatKes } from "@/lib/ui";
import { getLiveNodes } from "@/lib/nodes-registry";

export const dynamic = "force-dynamic";

/** Founder/co-founder executive dashboard — high-level ops at a glance. */
export default async function FounderDashboardPage() {
  await requireFounderPage();

  const service = createServiceClient();
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const now = new Date().toISOString();

  // Read the node registry rather than the compiled-in array (D72). On an ops
  // surface this is the more truthful of the two: it shows a node registered by
  // INSERT — including one the migration adopted from existing data — which the
  // constant would not know about until a deploy.
  const liveNodes = await getLiveNodes();

  const [
    { count: totalUsers },
    { count: shoppers },
    { count: merchants },
    { count: liveDeals },
    { count: claims7d },
    { count: verified7d },
    { data: fees7d },
    { count: openTasks },
    { count: pendingMerchants },
    { data: dealsByNode },
  ] = await Promise.all([
    service.from("users").select("id", { count: "exact", head: true }),
    service.from("users").select("id", { count: "exact", head: true }).eq("role", "customer"),
    service
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("role", ["merchant_admin", "merchant_staff"]),
    service
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .gt("expires_at", now),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7d),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "success")
      .gte("redeemed_at", since7d),
    service
      .from("merchant_transactions")
      .select("amount")
      .eq("transaction_type", "success_fee")
      .gte("created_at", since7d),
    service
      .from("agent_tasks")
      .select("id", { count: "exact", head: true })
      .eq("is_complete", false),
    service
      .from("merchants")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    service
      .from("deals")
      .select("node")
      .eq("is_active", true)
      .gt("expires_at", now),
  ]);

  const revenue7d = (fees7d ?? []).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
  const nodeCounts = new Map<string, number>();
  for (const d of dealsByNode ?? []) {
    nodeCounts.set(d.node, (nodeCounts.get(d.node) ?? 0) + 1);
  }

  return (
    <Page className="min-h-dvh bg-stone px-4 pb-16 pt-8">
      <HeadingLg>Founder dashboard</HeadingLg>
      <Body className="mt-1">Node 0 launch metrics and operational shortcuts.</Body>

      <Section title="Users (7d window where noted)" className="mt-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Total users" value={(totalUsers ?? 0).toLocaleString()} />
          <KpiCard label="Shoppers" value={(shoppers ?? 0).toLocaleString()} />
          <KpiCard label="Merchant accounts" value={(merchants ?? 0).toLocaleString()} />
          <KpiCard label="Claims (7d)" value={(claims7d ?? 0).toLocaleString()} />
        </div>
      </Section>

      <Section title="Deals & money" className="mt-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Live deals now" value={(liveDeals ?? 0).toLocaleString()} />
          <KpiCard label="Verified (7d)" value={(verified7d ?? 0).toLocaleString()} />
          <KpiCard label="Fee revenue (7d)" value={formatKes(revenue7d)} />
          <KpiCard label="Pending approvals" value={(pendingMerchants ?? 0).toLocaleString()} />
        </div>
      </Section>

      <Section title="Live deals by node" className="mt-6">
        <div className="space-y-2">
          {liveNodes.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3 shadow-card"
            >
              <span className="text-sm font-semibold text-ink">{n.label}</span>
              <span className="text-sm text-muted">{nodeCounts.get(n.id) ?? 0} live</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Operations" subtitle={`${openTasks ?? 0} open tasks`} className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/admin/support"
            className="rounded-card border border-line bg-white px-4 py-4 shadow-card transition hover:bg-stone-soft"
          >
            <p className="text-sm font-semibold text-ink">Support queue</p>
            <p className="mt-0.5 text-xs text-muted">Review and resolve agent tasks</p>
          </Link>
          <Link
            href="/admin"
            className="rounded-card border border-line bg-white px-4 py-4 shadow-card transition hover:bg-stone-soft"
          >
            <p className="text-sm font-semibold text-ink">Merchant approvals</p>
            <p className="mt-0.5 text-xs text-muted">{pendingMerchants ?? 0} shops waiting</p>
          </Link>
          <Link
            href="/admin/reports"
            className="rounded-card border border-line bg-white px-4 py-4 shadow-card transition hover:bg-stone-soft"
          >
            <p className="text-sm font-semibold text-ink">Platform reports</p>
            <p className="mt-0.5 text-xs text-muted">14-day redemption chart + KPIs</p>
          </Link>
          <Link
            href="/admin/redemptions"
            className="rounded-card border border-line bg-white px-4 py-4 shadow-card transition hover:bg-stone-soft"
          >
            <p className="text-sm font-semibold text-ink">Redemptions</p>
            <p className="mt-0.5 text-xs text-muted">Guardian, disputes, fee reversals</p>
          </Link>
        </div>
      </Section>
    </Page>
  );
}
