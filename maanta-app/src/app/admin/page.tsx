import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { KpiCard } from "@/components/ui/cards";
import { StatusChip } from "@/components/ui/chips";
import { formatKes, relativeAgo } from "@/lib/ui";
import { ALL_NODES, nodeLabel } from "@/lib/nodes";
import { isNodeScoped, nodeSwitcherTargets, resolveNodeParam } from "@/lib/admin-dashboard";
import { cn } from "@/lib/ui";
import { LeadsReadError } from "@/components/agent/lead-row-list";
import { claimsWindow, CLAIMS_TRACKING_CONFIG_KEY } from "@/lib/claims-window";
import { buildAdminAttentionItems } from "@/lib/admin-ops-health";
import { AdminReadError } from "@/components/admin/read-error";
import { readDemoModeEnabled } from "@/lib/demo-mode";

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
    const { data, error } = await service
      .from("merchants")
      .select("id")
      .eq("node", node);
    if (error) {
      return (
        <main className="min-h-dvh bg-stone px-4 pb-16 pt-6">
          <h1 className="text-xl font-bold text-ink">Operations</h1>
          <div className="mt-6">
            <AdminReadError what="the selected node&apos;s merchant scope" />
          </div>
        </main>
      );
    }
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

  // The attention queue must use the same public-visibility predicate as
  // shopper browse, not merely "active + unexpired". Paused deals and hidden,
  // shadow-banned or inactive merchants are not supply.
  // Failure-aware on purpose. isDemoModeEnabled() folds an unreachable config
  // into OFF, which is correct for product surfaces but wrong here: the flag
  // decides whether demo rows are excluded from the supply count below, so a
  // failed read would quietly shrink that number — possibly to 0 — and fire
  // the URGENT "No live deals" item from an error rather than an observation.
  // When the read fails the count is reported as unavailable instead.
  const demoMode = await readDemoModeEnabled();
  const includeDemo = demoMode.enabled;
  let shopperVisibleDealsQuery = service
    .from("deals")
    .select(
      "id, merchants!inner(status,is_visible,is_shadow_banned,is_demo)",
      { count: "exact", head: true }
    )
    .eq("is_active", true)
    .eq("is_paused", false)
    .gt("expires_at", now)
    .eq("merchants.status", "active")
    .eq("merchants.is_visible", true)
    .eq("merchants.is_shadow_banned", false);
  if (!includeDemo) {
    shopperVisibleDealsQuery = shopperVisibleDealsQuery
      .eq("is_demo", false)
      .eq("merchants.is_demo", false);
  }
  if (scoped) shopperVisibleDealsQuery = shopperVisibleDealsQuery.eq("node", node);

  // D188/D189 — a redemption row's own is_demo flag is not enough.
  // claim_deal historically creates non-demo redemption rows even against demo
  // merchants/deals, so every "genuine-tagged" census must join both parents.
  let genuineClaimsQuery = service
    .from("redemptions")
    .select("id, merchants!inner(is_demo,node), deals!inner(is_demo)", {
      count: "exact",
      head: true,
    })
    .eq("is_demo", false)
    .eq("merchants.is_demo", false)
    .eq("deals.is_demo", false)
    .gte("claimed_at", since7d);
  let genuineVerifiedQuery = service
    .from("redemptions")
    .select("id, merchants!inner(is_demo,node), deals!inner(is_demo)", {
      count: "exact",
      head: true,
    })
    .eq("status", "success")
    .eq("is_demo", false)
    .eq("merchants.is_demo", false)
    .eq("deals.is_demo", false)
    .gte("redeemed_at", since7d);
  let genuineCohortVerifiedQuery = service
    .from("redemptions")
    .select("id, merchants!inner(is_demo,node), deals!inner(is_demo)", {
      count: "exact",
      head: true,
    })
    .eq("status", "success")
    .eq("is_demo", false)
    .eq("merchants.is_demo", false)
    .eq("deals.is_demo", false)
    .gte("claimed_at", since7d);
  if (scoped) {
    genuineClaimsQuery = genuineClaimsQuery.eq("merchants.node", node);
    genuineVerifiedQuery = genuineVerifiedQuery.eq("merchants.node", node);
    genuineCohortVerifiedQuery = genuineCohortVerifiedQuery.eq("merchants.node", node);
  }

  // D164 — two sets, separated structurally rather than by index.
  //
  // `results` is its own array literal, so the claims-tracking read below
  // cannot end up inside the set `readFailed` scans — not by a slice, not by
  // an index that a later insertion would shift. A missing `app_config` row
  // is a legitimate state (the migration is not applied here) that
  // `claimsWindow()` reports honestly; blanking the whole console over it
  // would be the same false alarm as the confident zero this fix removed,
  // pointing the other way. `/founder` draws the same line — keep them
  // together, or the two consoles disagree about what counts as broken.
  //
  // Both arms are handed to one Promise.all, so the reads still run in
  // parallel; the nesting costs a tick of scheduling, not a round trip.
  const [results, claimsTrackingRes, runtimeConfigRes, auditRes] = await Promise.all([
    Promise.all([
      atNode(
        service.from("merchants").select("id", { count: "exact", head: true }).eq("status", "pending")
      ),
      atNode(
        service.from("merchants").select("id", { count: "exact", head: true }).eq("status", "active")
      ),
      shopperVisibleDealsQuery,
      byMerchant(
        // D164: `claimed_at`, not `created_at` — the latter never existed, so this
        // count errored and, with no read-failure guard on this page, collapsed
        // through `?? 0` into a convincing zero shown beside a real "Verified 1".
        // Pre-migration rows have a NULL claimed_at and are excluded on purpose.
        service.from("redemptions").select("id", { count: "exact", head: true }).gte("claimed_at", since7d)
      ),
      byMerchant(
        service
          .from("redemptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "success")
          .gte("redeemed_at", since7d)
      ),
      genuineClaimsQuery,
      genuineVerifiedQuery,
      genuineCohortVerifiedQuery,
      byMerchant(
        service.from("redemptions").select("id", { count: "exact", head: true }).eq("status", "flagged")
      ),
      byMerchant(
        service.from("agent_tasks").select("id", { count: "exact", head: true }).eq("is_complete", false)
      ),
      // Plan-limit refusals only. tier_flags also carries 'trial_expired' and
      // 'subscription_lapsed', which are lifecycle events, not a merchant
      // attempting to publish past its plan — counting those made the console
      // assert a plan-limit attempt that never happened (Codex P2 on #283).
      //
      // These two types only exist as rows at all because of this PR's
      // caller-side audit (lib/tier-refusal-audit, D194): the trigger writes
      // them immediately before it RAISEs, so its own INSERT is rolled back
      // with the exception. The count is therefore only as complete as that
      // audit — a refusal that never reached /api/deals or /api/deals/repost
      // (a direct DB write, say) is invisible here by construction.
      byMerchant(
        service
          .from("tier_flags")
          .select("id", { count: "exact", head: true })
          .in("flag_type", ["deal_limit_exceeded", "flash_not_allowed"])
          .gte("created_at", since7d)
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
    ]),
    // D164: when claim tracking started, so the Claims card can say whether its
    // window is fully covered. Deliberately NOT part of the readFailed check —
    // a missing row is a legitimate state (migration not applied) that
    // claimsWindow() reports honestly, not a read failure.
    service
      .from("app_config")
      .select("value")
      .eq("key", CLAIMS_TRACKING_CONFIG_KEY)
      .maybeSingle(),
    // Read-only, allow-listed operational flags. No browser write path.
    service
      .from("app_config")
      .select("key, value")
      .in("key", [
        "demo_mode_enabled",
        "fast_visit_enabled",
        "fast_visit_points",
        "success_fee_kes",
      ])
      .order("key"),
    service
      .from("admin_ops_log")
      .select("id, admin_user_id, action, target_type, target_id, created_at")
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  // D164 — a failed metric read must never look like a real number.
  //
  // These counts used to be destructured straight off `Promise.all`, discarding
  // every `error`. When the "Claims (7d)" query filtered a column that did not
  // exist, PostgREST returned an error, `count` came back null, and `?? 0`
  // rendered a confident **0** beside a genuine "Verified (7d) 1" — the console
  // asserting there had been no claims on a day there had been one. The founder
  // dashboard already refuses to do this (D149); this page now matches it.
  const readFailed = results.find((r) => (r as { error?: unknown }).error);
  if (readFailed) {
    return (
      <main className="min-h-dvh bg-stone px-4 pb-16 pt-6">
        <h1 className="text-xl font-bold text-ink">Operations</h1>
        <div className="mt-6">
          <LeadsReadError
            what="the operations dashboard"
            sub="This is a read error, not zeroed metrics. Reload the page; if it keeps failing, tell the Maanta team."
          />
        </div>
      </main>
    );
  }

  const [
    { count: pendingMerchants },
    { count: activeMerchants },
    { count: liveDeals },
    { count: claims7d },
    { count: verified7d },
    { count: genuineClaims7d },
    { count: genuineVerified7d },
    { count: genuineCohortVerified7d },
    { count: heldRedemptions },
    { count: openTasks },
    { count: tierRefusals7d },
    { data: fees7d },
    { data: arrearsRows },
    { data: recentPending },
  ] = results;

  const claims = claimsWindow(
    (claimsTrackingRes.data as { value?: string } | null)?.value ?? null
  );

  const revenue7d = (fees7d ?? []).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
  const arrearsTotal = (arrearsRows ?? []).reduce(
    (s, r) => s + Number(r.outstanding_arrears ?? 0),
    0
  );
  const targets = nodeSwitcherTargets();
  const genuineClaims = genuineClaims7d ?? 0;
  const genuineVerified = genuineVerified7d ?? 0;
  const mixedClaims = Math.max(0, (claims7d ?? 0) - genuineClaims);
  const mixedVerified = Math.max(0, (verified7d ?? 0) - genuineVerified);
  const attentionItems = buildAdminAttentionItems({
    pendingMerchants: pendingMerchants ?? 0,
    heldRedemptions: heldRedemptions ?? 0,
    openTasks: openTasks ?? 0,
    merchantsInArrears: (arrearsRows ?? []).length,
    tierRefusals7d: tierRefusals7d ?? 0,
    activeMerchants: activeMerchants ?? 0,
    liveDeals: demoMode.ok ? liveDeals ?? null : null,
    genuineClaims7d: claims.partial ? null : genuineClaims7d ?? null,
    genuineVerified7d: claims.partial ? null : genuineCohortVerified7d ?? null,
  });
  const runtimeConfig = new Map(
    (runtimeConfigRes.data ?? []).map((row) => [String(row.key), String(row.value)])
  );

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

      <h2 className="mt-7 text-base font-bold text-ink">Needs attention</h2>
      <p className="mt-1 text-xs text-muted">
        Deterministic rules only — every alert states why it fired.
      </p>
      <div className="mt-2 space-y-2">
        {attentionItems.length === 0 ? (
          <p className="rounded-card bg-white px-4 py-5 text-sm text-muted shadow-card">
            No deterministic operational alerts right now.
          </p>
        ) : (
          attentionItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "block rounded-card border bg-white px-4 py-3.5 shadow-card hover:bg-stone-soft",
                item.severity === "urgent" ? "border-flame/40" : "border-line"
              )}
            >
              <p className="text-sm font-bold text-ink">{item.label}</p>
              <p className="mt-1 text-xs text-muted">{item.reason}</p>
            </Link>
          ))
        )}
      </div>

      <h2 className="mt-7 text-base font-bold text-ink">Evidence split</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={`Genuine-tagged ${claims.label.toLowerCase()}`}
          value={genuineClaims.toLocaleString()}
          hint={claims.hint ?? "Redemption + merchant + deal are all non-demo."}
        />
        <KpiCard
          label={claims.partial ? "Demo/mixed claims since tracking began" : "Demo/mixed claims (7d)"}
          value={mixedClaims.toLocaleString()}
          hint="Anything not clean across redemption + merchant + deal."
        />
        <KpiCard
          label="Genuine-tagged verified (7d)"
          value={genuineVerified.toLocaleString()}
        />
        <KpiCard
          label="Demo/mixed verified (7d)"
          value={mixedVerified.toLocaleString()}
        />
      </div>
      <p className="mt-2 text-xs text-muted">
        D188 rule: genuine-tagged means redemption, merchant and deal are all non-demo.
        Internal E2E activity can still be included, so this is not external field validation.
      </p>

      <h2 className="mt-7 text-base font-bold text-ink">Operational totals (7 days)</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Success fees — all activity" value={formatKes(revenue7d)} />
        <KpiCard label="Arrears outstanding" value={formatKes(arrearsTotal)} />
      </div>

      <h2 className="mt-7 text-base font-bold text-ink">Supply</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Active merchants" value={(activeMerchants ?? 0).toLocaleString()} />
        <KpiCard
          label="Shopper-visible deals"
          value={
            demoMode.ok && liveDeals != null ? liveDeals.toLocaleString() : "—"
          }
        />
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
              <span className="text-xs text-muted">{relativeAgo(m.created_at)}</span>
              <StatusChip status="pending" />
            </Link>
          ))
        )}
      </div>

      <h2 className="mt-7 text-base font-bold text-ink">Runtime flags</h2>
      {runtimeConfigRes.error ? (
        <div className="mt-2">
          <AdminReadError what="runtime configuration" />
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["demo_mode_enabled", "Demo mode"],
            ["fast_visit_enabled", "Fast Visit"],
            ["fast_visit_points", "Fast Visit points"],
            ["success_fee_kes", "Success fee (KES)"],
          ].map(([key, label]) => (
            <div key={key} className="rounded-card bg-white p-4 shadow-card">
              <p className="text-xs text-muted">{label}</p>
              <p className="tnum mt-1 text-base font-bold text-ink">
                {runtimeConfig.get(key) ?? "Unavailable"}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted">Read-only visibility. No config write controls exist here.</p>

      <div className="mt-7 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-ink">
          Recent admin actions{scoped ? " — all nodes" : ""}
        </h2>
        <Link href="/admin/audit" className="text-sm font-semibold text-secondary hover:text-ink">
          Full audit
        </Link>
      </div>
      {scoped ? (
        <p className="mt-1 text-xs text-muted">
          Audit events are platform-wide; they are intentionally not presented as node-scoped.
        </p>
      ) : null}
      {auditRes.error ? (
        <div className="mt-2">
          <AdminReadError what="the admin audit trail" />
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {(auditRes.data ?? []).length === 0 ? (
            <p className="rounded-card bg-white px-4 py-5 text-sm text-muted shadow-card">
              No admin actions recorded yet.
            </p>
          ) : (
            (auditRes.data ?? []).map((entry) => (
              <div key={entry.id} className="rounded-card bg-white px-4 py-3 shadow-card">
                <p className="text-sm font-semibold text-ink">{entry.action}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {entry.target_type} · {String(entry.target_id).slice(0, 8)}… · {relativeAgo(entry.created_at)}
                </p>
              </div>
            ))
          )}
        </div>
      )}

      {scoped ? (
        <p className="mt-6 text-xs text-muted">
          Operational metrics are scoped to {nodeLabel(node)}. Redemptions, fees and tasks have
          no node of their own, so they are counted through that node&apos;s merchants. Runtime
          flags and the audit trail are platform-wide and are labelled separately.
        </p>
      ) : null}
    </main>
  );
}

/** A UUID no row can hold — filters an empty node to nothing rather than to everything. */
const NO_MATCH = "00000000-0000-0000-0000-000000000000";
