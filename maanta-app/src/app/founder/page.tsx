import Link from "next/link";
import { requireFounderPage } from "@/lib/founder";
import { canAccessAdminConsole } from "@/lib/roles";
import { LeadsReadError } from "@/components/agent/lead-row-list";
import { claimsWindow, CLAIMS_TRACKING_CONFIG_KEY } from "@/lib/claims-window";
import { OperationsLinks } from "@/components/founder/operations-links";
import { createServiceClient } from "@/lib/supabase/service";
import { HeadingLg, Body, Page, Section } from "@/components/ui/claude";
import { KpiCard } from "@/components/ui/cards";
import { formatKes } from "@/lib/ui";
import { NODES } from "@/lib/nodes";

export const dynamic = "force-dynamic";

/** Founder/co-founder executive dashboard — high-level ops at a glance. */
export default async function FounderDashboardPage() {
  // The guard returns the user; the Operations block gates on the same role read
  // rather than assuming a founder-dashboard reader can open the admin console.
  const user = await requireFounderPage();

  const service = createServiceClient();
  const since7d = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const now = new Date().toISOString();

  const [
    totalUsersRes,
    shoppersRes,
    merchantsRes,
    liveDealsRes,
    claims7dRes,
    verified7dRes,
    // SQL SUM via RPC — same rule as /admin/reports: never pull fee rows into
    // JS, PostgREST's 1000-row cap silently under-reports the sum (D149).
    revenue7dRes,
    openTasksRes,
    pendingMerchantsRes,
    dealsByNodeRes,
    claimsTrackingRes,
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
    // D164: `claimed_at`, not `created_at` — the latter never existed, so this
    // count errored, tripped the read-failure guard below, and took the WHOLE
    // dashboard down on every visit. Rows claimed before 20260824130000 have a
    // NULL claimed_at and are excluded by this filter, deliberately: their
    // claim times are unknowable and were not fabricated.
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .gte("claimed_at", since7d),
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "success")
      .gte("redeemed_at", since7d),
    service.rpc("admin_success_fee_revenue", { p_since: since7d }),
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
    // D164: when claim tracking started, so the Claims card can say whether its
    // window is fully covered. A missing row means the migration is not applied
    // here — a legitimate state claimsWindow() reports, not a read failure.
    service
      .from("app_config")
      .select("value")
      .eq("key", CLAIMS_TRACKING_CONFIG_KEY)
      .maybeSingle(),
  ]);

  // Same rule the agent console follows: a failed read must not render as ten
  // zeroed KPIs — "Total users: 0 · Fee revenue: KES 0" is a false statement
  // about the business, not a loading state.
  const readFailed = [
    totalUsersRes,
    shoppersRes,
    merchantsRes,
    liveDealsRes,
    claims7dRes,
    verified7dRes,
    revenue7dRes,
    openTasksRes,
    pendingMerchantsRes,
    dealsByNodeRes,
    // claimsTrackingRes is deliberately absent: a missing config row is a
    // legitimate state, not a read failure, and must not blank the dashboard.
  ].find((r) => r.error)?.error;
  if (readFailed) {
    return (
      <Page className="min-h-dvh bg-stone px-4 pb-16 pt-8">
        <HeadingLg>Founder dashboard</HeadingLg>
        <div className="mt-6">
          <LeadsReadError
            what="the dashboard"
            sub="This is a read error, not zeroed metrics. Reload the page; if it keeps failing, tell the Maanta team."
          />
        </div>
      </Page>
    );
  }

  const totalUsers = totalUsersRes.count;
  const shoppers = shoppersRes.count;
  const merchants = merchantsRes.count;
  const liveDeals = liveDealsRes.count;
  const claims7d = claims7dRes.count;
  const claims = claimsWindow(
    (claimsTrackingRes.data as { value?: string } | null)?.value ?? null
  );
  const verified7d = verified7dRes.count;
  const openTasks = openTasksRes.count;
  const pendingMerchants = pendingMerchantsRes.count;

  const revenue7d = Number(revenue7dRes.data ?? 0) || 0;
  const nodeCounts = new Map<string, number>();
  for (const d of dealsByNodeRes.data ?? []) {
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
          <KpiCard
            label={claims.label}
            value={(claims7d ?? 0).toLocaleString()}
            hint={claims.hint ?? undefined}
          />
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
          {NODES.filter((n) => n.live).map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between rounded-card bg-white px-4 py-3 shadow-card"
            >
              <span className="text-sm font-semibold text-ink">{n.label}</span>
              <span className="text-sm text-muted">{nodeCounts.get(n.id) ?? 0} live</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Yesterday sits above Operations on purpose: the first question a
          founder opens this page with is "what happened", not "what can I
          click". Unlike the /admin/* cards below it is founder-scoped, so a
          co-founder can open it. */}
      <Section title="Daily brief" className="mt-6">
        <Link
          href="/founder/yesterday"
          className="block rounded-card bg-white px-4 py-3 shadow-card transition hover:bg-stone-soft"
        >
          <span className="text-sm font-semibold text-ink">Yesterday →</span>
          <span className="mt-0.5 block text-xs text-muted">
            What changed yesterday: supply, claims, arrivals, verified visits,
            success fees and unresolved alerts, with the genuine/demo split
            stated.
          </span>
        </Link>
      </Section>

      <Section title="Operations" subtitle={`${openTasks ?? 0} open tasks`} className="mt-6">
        {/* Gated: every card points into /admin/*, which a co-founder cannot open. */}
        <OperationsLinks
          canOpenAdminConsole={canAccessAdminConsole(user.role)}
          pendingMerchants={pendingMerchants ?? 0}
        />
      </Section>
    </Page>
  );
}
