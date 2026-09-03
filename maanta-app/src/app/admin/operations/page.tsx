import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { AdminReadError } from "@/components/admin/read-error";
import { KpiCard } from "@/components/ui/cards";
import { readDemoModeEnabled } from "@/lib/demo-mode";
import { withPublicMerchant, withPublicMerchantRows } from "@/lib/data";
import { NODES, NODE_0, nodeLabel } from "@/lib/nodes";
import { FAST_VISIT_WINDOW_MINUTES } from "@/lib/fast-visit-window";
import { GENUINE_JOIN_SELECT, genuineTagged } from "@/lib/evidence-scope";
import { externalCohort, externalCohortSize, internalMerchantIds } from "@/lib/pilot-cohort";

export const dynamic = "force-dynamic";

/**
 * Operations — how each node is running, and the platform settings that
 * decide what a shopper can see.
 *
 * Per node, from the tables that carry a node column: merchants by status,
 * merchants a shopper can actually reach (the canonical public rule, not
 * `status = active` alone), and shopper-visible deals (the feed's own
 * predicate, demo-aware). Then the runtime flags, read-only and with their
 * operational meaning stated beside the value — a flag whose consequence is
 * not written next to it is a flag an operator has to remember. Then the
 * two field surfaces that used to be top-level navigation, with their
 * headline numbers: the Node 0 pilot cohort and the acquisition pipeline.
 *
 * No write control exists on this page. Every flag here is founder-owned and
 * changes in `app_config`, never from a browser.
 */
export default async function AdminOperationsPage() {
  await requireAdminPage();

  const service = createServiceClient();
  const nowIso = new Date().toISOString();
  const demoMode = await readDemoModeEnabled();
  const liveNodes = NODES.filter((n) => n.live);

  const [configRes, agentsRes, leadsRes, ladderRes, ...nodeRes] = await Promise.all([
    service
      .from("app_config")
      .select("key, value")
      .in("key", [
        "demo_mode_enabled",
        "fast_visit_enabled",
        "fast_visit_points",
        "success_fee_kes",
        "node0_opening_credit_kes",
        "node0_opening_credit_merchant_cap",
        "elite_trial_merchant_cap",
      ])
      .order("key"),
    service.from("agents").select("id", { count: "exact", head: true }).eq("is_active", true),
    service.from("leads").select("id", { count: "exact", head: true }).eq("status", "locked"),
    // The ladder, cumulative: genuine verified redemptions by enrolled external
    // merchants. Nobody enrolled is a true zero, computed without a query.
    (() => {
      const ids = externalCohort().map((e) => e.merchantId);
      if (ids.length === 0) return Promise.resolve({ count: 0, error: null });
      return genuineTagged(
        service
          .from("redemptions")
          .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
          .in("merchant_id", ids)
          .eq("status", "success")
      );
    })(),
    ...liveNodes.map((n) =>
      Promise.all([
        service.from("merchants").select("id", { count: "exact", head: true }).eq("node", n.id).eq("status", "active").eq("is_demo", false),
        service.from("merchants").select("id", { count: "exact", head: true }).eq("node", n.id).eq("status", "pending"),
        service.from("merchants").select("id", { count: "exact", head: true }).eq("node", n.id).eq("status", "suspended"),
        withPublicMerchantRows(
          service.from("merchants").select("id", { count: "exact", head: true }).eq("node", n.id),
          { includeDemo: demoMode.enabled }
        ),
        withPublicMerchant(
          service
            .from("deals")
            .select("id, merchants!inner(status,is_visible,is_shadow_banned,is_demo)", { count: "exact", head: true })
            .eq("node", n.id)
            .eq("is_active", true)
            .eq("is_paused", false)
            .gt("expires_at", nowIso),
          { includeDemo: demoMode.enabled }
        ),
      ])
    ),
  ]);

  const n = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
  const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString());
  const config = new Map((configRes.data ?? []).map((row) => [String(row.key), String(row.value)]));
  const flag = (key: string) => config.get(key) ?? null;
  const isOn = (key: string) => flag(key) === "true";
  const ladder = n(ladderRes as { count: number | null; error: unknown });

  return (
    <main className="max-w-5xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Operations</h1>
        <p className="text-xs text-muted">Live now · read-only</p>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        How each node is running, the platform flags that decide what shoppers see,
        and the two field views. Nothing on this page writes anything.
      </p>

      {/* ---- Nodes ------------------------------------------------------------ */}
      <h2 className="mt-6 text-sm font-semibold text-ink">Nodes</h2>
      <div className="mt-2 overflow-x-auto rounded-card bg-white shadow-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Node</th>
              <th className="px-3 py-2 font-semibold">Active (genuine)</th>
              <th className="px-3 py-2 font-semibold">Reachable by shoppers</th>
              <th className="px-3 py-2 font-semibold">Shopper-visible deals</th>
              <th className="px-3 py-2 font-semibold">Awaiting approval</th>
              <th className="px-3 py-2 font-semibold">Suspended</th>
            </tr>
          </thead>
          <tbody>
            {liveNodes.map((node, i) => {
              const [activeRes, pendingRes, suspendedRes, reachableRes, dealsRes] = nodeRes[i];
              return (
                <tr key={node.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/admin?node=${encodeURIComponent(node.id)}`} className="font-semibold text-ink underline-offset-2 hover:underline">
                      {node.short}
                    </Link>
                    {node.id === NODE_0 ? (
                      <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Node 0</span>
                    ) : null}
                  </td>
                  <td className="tnum px-3 py-2">{fmt(n(activeRes))}</td>
                  {/* Reachability depends on the demo flag: the query includes
                      synthetic shops only when demo mode is ON, and an
                      unreadable flag defaults that to false. Rendering the
                      partial count would assert "this many shops are reachable"
                      on a guess (Codex P2 on PR #319, D251) — so it is a dash,
                      exactly as the shopper-visible-deals cell beside it. */}
                  <td className="tnum px-3 py-2">{demoMode.ok ? fmt(n(reachableRes)) : "—"}</td>
                  <td className="tnum px-3 py-2">{demoMode.ok ? fmt(n(dealsRes)) : "—"}</td>
                  <td className="tnum px-3 py-2">{fmt(n(pendingRes))}</td>
                  <td className="tnum px-3 py-2">{fmt(n(suspendedRes))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 max-w-3xl text-xs text-muted">
        &ldquo;Reachable&rdquo; is the canonical public rule — active, visible and not
        shadow-banned
        {demoMode.ok
          ? demoMode.enabled
            ? ", synthetic shops included while demo mode is ON"
            : ", genuine shops only"
          : ". The demo-mode flag could not be read, so reachable counts are a dash: whether synthetic shops are reachable is unknown, not false"}.
        A dash is a read failure, never zero. Non-live nodes in the registry are not listed.
      </p>

      {/* ---- Runtime flags ---------------------------------------------------- */}
      <h2 className="mt-6 text-sm font-semibold text-ink">Runtime flags</h2>
      {configRes.error ? (
        <div className="mt-2"><AdminReadError what="runtime configuration" /></div>
      ) : (
        <div className="mt-2 space-y-2">
          <Flag
            label="Demo mode"
            value={flag("demo_mode_enabled")}
            meaning={
              isOn("demo_mode_enabled")
                ? "ON — synthetic merchants and deals are shopper-visible so a prospect sees a marketplace (ruling 2026-08-26). Merchant 01's own onboarding and Shopper 01's claim must happen with it OFF, or that evidence is contaminated (D189)."
                : "OFF — only genuine merchants and deals reach shoppers. This is the state the measured pilot steps require."
            }
          />
          <Flag
            label="Fast Visit"
            value={flag("fast_visit_enabled")}
            meaning={
              isOn("fast_visit_enabled")
                ? `ON — an arrival within ${FAST_VISIT_WINDOW_MINUTES} minutes of a claim qualifies for points on verification.`
                : "OFF — check-in and the counter queue work, but no points are awarded and no reward copy is shown (D220)."
            }
          />
          <Flag label="Fast Visit points" value={flag("fast_visit_points")} meaning="Points per qualifying verified visit while Fast Visit is ON." />
          <Flag label="Success fee (KES)" value={flag("success_fee_kes")} meaning="Debited from the merchant wallet at every verified redemption, or recorded as arrears. Frozen at KES 30." />
          <Flag label="Opening credit (KES)" value={flag("node0_opening_credit_kes")} meaning="Credited once on activation at the launch node. Around ten verified redemptions later it is spent and the merchant cannot post a new deal — expected, and the measurement. Nobody raises it with the merchant." />
          <Flag label="Opening credit cap (merchants)" value={flag("node0_opening_credit_merchant_cap")} meaning="How many merchants per node receive the opening credit." />
          <Flag label="Elite trial cap (merchants)" value={flag("elite_trial_merchant_cap")} meaning="The launch offer: 30-day Elite trials for the first merchants at the launch node, enforced in the database." />
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted">
        Read-only. Every flag is founder-owned and changes in <code>app_config</code>; no
        console control writes it.
      </p>

      {/* ---- Field views ---------------------------------------------------- */}
      <h2 className="mt-6 text-sm font-semibold text-ink">Field views</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <Link href="/admin/pilot" className="rounded-card bg-white p-4 shadow-card transition hover:bg-stone-soft">
          <p className="text-sm font-bold text-ink">Node 0 pilot cohort →</p>
          <p className="mt-0.5 text-xs text-muted">
            Every non-demo merchant at {nodeLabel(NODE_0)}, diagnosed one by one: supply, claims,
            arrivals, verified visits and fees, with the evidence class stated.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <KpiCard label="Ladder" value={fmt(ladder)} hint="Genuine verified redemptions by enrolled external merchants, all time." />
            <KpiCard label="External enrolled" value={externalCohortSize().toLocaleString()} />
            <KpiCard label="Internal" value={internalMerchantIds().length.toLocaleString()} />
          </div>
        </Link>
        <Link href="/admin/agents" className="rounded-card bg-white p-4 shadow-card transition hover:bg-stone-soft">
          <p className="text-sm font-bold text-ink">Field agents &amp; leads →</p>
          <p className="mt-0.5 text-xs text-muted">
            The acquisition pipeline. Agent-assisted acquisition does not begin until
            D159 is resolved; one genuine Merchant 01 first.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <KpiCard label="Active agents" value={fmt(n(agentsRes))} />
            <KpiCard label="Locked leads" value={fmt(n(leadsRes))} />
          </div>
        </Link>
      </div>
    </main>
  );
}

function Flag({ label, value, meaning }: { label: string; value: string | null; meaning: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-card bg-white px-4 py-3 shadow-card">
      <span className="w-48 shrink-0 text-sm font-semibold text-ink">{label}</span>
      <span className="tnum text-sm font-bold text-ink">{value ?? "Unavailable"}</span>
      <span className="basis-full text-xs text-muted sm:basis-auto sm:flex-1">{meaning}</span>
    </div>
  );
}
