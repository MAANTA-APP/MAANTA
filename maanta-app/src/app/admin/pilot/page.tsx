import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminReadError } from "@/components/admin/read-error";
import { KpiCard } from "@/components/ui/cards";
import { readDemoModeEnabled } from "@/lib/demo-mode";
import { resolveNodeParam, isNodeScoped, nodeSwitcherTargets } from "@/lib/admin-dashboard";
import { GENUINE_JOIN_SELECT, genuineTagged } from "@/lib/evidence-scope";
import { activeDealLimit, normaliseTier } from "@/lib/plan-limits";
import {
  classifyMerchant,
  cohortPosition,
  externalCohortSize,
  evidenceClassLabel,
  type EvidenceClass,
} from "@/lib/pilot-cohort";
import {
  pilotMerchantStatus,
  merchantConversion,
  cohortTotals,
  buildPilotAlerts,
  MIN_CLAIMS_FOR_MERCHANT_RATIO,
  type PilotMerchantRow,
} from "@/lib/pilot-command-centre";
import { formatKes } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * Bound on fee rows pulled per merchant.
 *
 * If a merchant somehow has this many success-fee rows inside the window, the
 * sum is reported unavailable rather than truncated — a low-but-plausible money
 * figure is worse than an honest blank (D149).
 */
const FEE_ROW_CAP = 500;

/**
 * Most merchants rendered in one pass.
 *
 * Each row costs seven small counting queries, so an unbounded cohort would
 * fan out linearly — fine at Node 0 (a handful of non-demo merchants) and not
 * fine if this page is ever pointed at a grown marketplace. The cap is stated
 * on the page when it bites rather than silently truncating the table, because
 * a cohort table that quietly omits merchants is worse than one that says it
 * did.
 */
const MAX_COHORT_ROWS = 50;

/**
 * Node 0 Pilot Command Centre — Merchant 01 → Merchant 10, made legible.
 *
 * A derived, read-only view. It creates no commercial behaviour, writes
 * nothing, and every number on it is a count of rows that already existed.
 *
 * ## The three evidence classes, kept apart on purpose
 *
 * - **genuine-tagged** — the D188 parent join (redemption + merchant + deal all
 *   non-demo). A data property, computed in SQL.
 * - **internal** — MAANTA testing itself. Named in the cohort manifest.
 * - **external field validation** — a real merchant explicitly enrolled in the
 *   pilot. Named in the manifest, and **0 today**.
 *
 * Genuine-tagged does not imply external: production's only genuine-tagged
 * `success` belongs to an internal E2E shop. This page therefore never adds
 * those numbers together, and a merchant the manifest does not name renders as
 * *unclassified* rather than quietly counting as field evidence.
 *
 * ## Read failures are not zeros
 *
 * Every count that can fail is nullable all the way to the cell, which renders
 * "—". A merchant whose counts failed is reported as *Unavailable* and is not
 * diagnosed; the alert list says the read failed rather than inventing a
 * finding from an error (D164 / D185).
 *
 * Deterministic throughout: no score, no ranking, no prediction. Every status
 * and alert states the condition that fired, and no ratio is computed below the
 * minimum sample.
 */
export default async function PilotCommandCentrePage({
  searchParams,
}: {
  searchParams: { node?: string; window?: string };
}) {
  await requireAdminPage();

  const node = resolveNodeParam(searchParams.node);
  const scoped = isNodeScoped(node);
  const days = searchParams.window === "30" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  const service = createServiceClient();

  // Demo mode decides whether synthetic deals count as shopper-visible supply,
  // so a failed read of the flag makes that column unknowable rather than zero.
  const demoMode = await readDemoModeEnabled();

  // The cohort: every non-demo merchant. Demo shops are not pilot subjects.
  let merchantsQuery = service
    .from("merchants")
    .select("id, merchant_name, status, tier, node, is_visible, created_at")
    .eq("is_demo", false)
    .order("created_at", { ascending: true });
  if (scoped) merchantsQuery = merchantsQuery.eq("node", node);

  const { data: merchants, error: merchantsError } = await merchantsQuery;

  if (merchantsError) {
    return (
      <main className="max-w-6xl">
        <h1 className="text-2xl font-bold text-ink">Pilot command centre</h1>
        <div className="mt-5">
          <AdminReadError
            what="the pilot cohort"
            sub="This is a read error, not an empty cohort. Reload; if it keeps failing, do not conclude there are no pilot merchants."
          />
        </div>
      </main>
    );
  }

  const allCohort = merchants ?? [];
  const cohort = allCohort.slice(0, MAX_COHORT_ROWS);
  const omitted = allCohort.length - cohort.length;
  // Per-merchant counts. Each is its own query so one failure marks one cell
  // unknown rather than blanking the page.
  const rows: PilotMerchantRow[] = await Promise.all(
    cohort.map(async (m) => {
      const tier = normaliseTier(m.tier);
      const nowIso = new Date().toISOString();

      const [
        activeDealsRes,
        visibleDealsRes,
        claimsRes,
        arrivalsRes,
        verifiedRes,
        fastVisitsRes,
        feesRes,
      ] = await Promise.all([
        service
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("merchant_id", m.id)
          .eq("is_active", true),
        // Shopper-visible = active, not paused, inside its window. When demo
        // mode is off, synthetic deals are not visible either — but a failed
        // flag read must not silently shrink this count, so it is resolved to
        // null below instead.
        (() => {
          let q = service
            .from("deals")
            .select("id", { count: "exact", head: true })
            .eq("merchant_id", m.id)
            .eq("is_active", true)
            .eq("is_paused", false)
            .gt("expires_at", nowIso);
          if (demoMode.ok && !demoMode.enabled) q = q.eq("is_demo", false);
          return q;
        })(),
        genuineTagged(
          service
            .from("redemptions")
            .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
            .eq("merchant_id", m.id)
            .gte("claimed_at", since)
        ),
        genuineTagged(
          service
            .from("redemptions")
            .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
            .eq("merchant_id", m.id)
            .not("arrived_at", "is", null)
            .gte("claimed_at", since)
        ),
        genuineTagged(
          service
            .from("redemptions")
            .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
            .eq("merchant_id", m.id)
            .eq("status", "success")
            .gte("redeemed_at", since)
        ),
        genuineTagged(
          service
            .from("redemptions")
            .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
            .eq("merchant_id", m.id)
            .not("fast_visit_qualified_at", "is", null)
            .gte("claimed_at", since)
        ),
        // Per-merchant fee sums cannot use admin_success_fee_revenue (it is
        // global). PostgREST caps rows, and a silently truncated SUM is the
        // D149 failure, so the read is bounded and reports UNAVAILABLE rather
        // than a plausible low number if it ever hits the cap.
        service
          .from("merchant_transactions")
          .select("amount")
          .eq("merchant_id", m.id)
          .eq("transaction_type", "success_fee")
          .gte("created_at", since)
          .limit(FEE_ROW_CAP),
      ]);

      const count = (r: { count: number | null; error: unknown }) =>
        r.error ? null : r.count ?? 0;

      const feeRows = feesRes.error ? null : feesRes.data ?? [];
      const successFeesKes =
        feeRows === null || feeRows.length >= FEE_ROW_CAP
          ? null
          : feeRows.reduce((s, r) => s + Math.abs(Number(r.amount ?? 0)), 0);

      return {
        merchantId: m.id,
        name: m.merchant_name ?? "Unnamed merchant",
        position: cohortPosition(m.id),
        evidence: classifyMerchant(m.id) as EvidenceClass,
        tier,
        status: m.status ?? "unknown",
        isVisible: m.is_visible !== false,
        activeDeals: count(activeDealsRes),
        dealCap: activeDealLimit(tier),
        shopperVisibleDeals: demoMode.ok ? count(visibleDealsRes) : null,
        claims: count(claimsRes),
        arrivals: count(arrivalsRes),
        verified: count(verifiedRes),
        fastVisits: count(fastVisitsRes),
        successFeesKes,
      } satisfies PilotMerchantRow;
    })
  );

  const totals = cohortTotals(rows);
  const alerts = buildPilotAlerts(rows);
  const targets = nodeSwitcherTargets();
  const externalEnrolled = externalCohortSize();

  return (
    <main className="max-w-6xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Pilot command centre</h1>
        <p className="text-xs text-muted">
          Node 0 · last {days} days · read-only
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Every non-demo merchant, and what has actually happened at each one.
        Counts are genuine-tagged (D188: redemption, merchant and deal all
        non-demo). Genuine-tagged is a property of the data — it does not make a
        merchant external field validation.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {targets.map((t) => (
          <Link
            key={t.id}
            href={`/admin/pilot?node=${encodeURIComponent(t.id)}&window=${days}`}
            className={
              t.id === node
                ? "rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full bg-cream-dark px-3 py-1 text-xs font-semibold text-muted"
            }
          >
            {t.label}
          </Link>
        ))}
        <span className="mx-1 text-faint">·</span>
        {[7, 30].map((d) => (
          <Link
            key={d}
            href={`/admin/pilot?node=${encodeURIComponent(node)}&window=${d}`}
            className={
              d === days
                ? "rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white"
                : "rounded-full bg-cream-dark px-3 py-1 text-xs font-semibold text-muted"
            }
          >
            {d}d
          </Link>
        ))}
      </div>

      {/* The evidence split, stated before any activity number, because it is
          what tells the reader how to read the rest of the page. */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="External field validation"
          value={externalEnrolled.toLocaleString()}
          hint="Merchants explicitly enrolled in the Node 0 cohort manifest. This is the number the 1 → 5 → 10 ladder counts."
        />
        <KpiCard
          label="Internal / E2E merchants"
          value={totals.internal.toLocaleString()}
          hint="MAANTA testing itself. Kept as technical evidence; never field evidence (D184)."
        />
        <KpiCard
          label="Unclassified non-demo"
          value={totals.unclassified.toLocaleString()}
          hint="Non-demo merchants the manifest does not name. Not counted as external until explicitly enrolled."
        />
      </section>

      {externalEnrolled === 0 ? (
        <p className="mt-3 rounded-card bg-white px-4 py-3 text-sm text-ink shadow-card">
          <strong className="font-semibold">
            External field validation is 0.
          </strong>{" "}
          No merchant has been enrolled in the Node 0 cohort manifest yet. Any
          activity below is internal or unclassified, and none of it tests the
          pull hypothesis. Merchant 01 becomes external the moment it is added
          to <code className="text-xs">lib/pilot-cohort.ts</code>.
        </p>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Shopper-visible deals"
          value={fmt(totals.shopperVisibleDeals)}
          hint={
            demoMode.ok
              ? undefined
              : "Demo-mode flag unreadable, so visible supply cannot be established."
          }
        />
        <KpiCard label={`Claims (${days}d)`} value={fmt(totals.claims)} />
        <KpiCard label={`Arrivals (${days}d)`} value={fmt(totals.arrivals)} />
        <KpiCard label={`Verified (${days}d)`} value={fmt(totals.verified)} />
        <KpiCard
          label={`Success fees (${days}d)`}
          value={totals.successFeesKes === null ? "—" : formatKes(totals.successFeesKes)}
        />
      </section>

      {alerts.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-ink">Needs attention</h2>
          <ul className="mt-2 space-y-2">
            {alerts.map((a) => (
              <li
                key={a.id}
                className="rounded-card bg-white px-4 py-3 shadow-card"
              >
                <p className="text-sm font-semibold text-ink">{a.label}</p>
                <p className="mt-0.5 text-xs text-muted">{a.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-ink">Cohort</h2>
        {omitted > 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
            Showing the {MAX_COHORT_ROWS} oldest of {allCohort.length} non-demo
            merchants. {omitted} more {omitted === 1 ? "is" : "are"} not listed
            here, and the totals above cover only the merchants shown — scope to
            a node to narrow the cohort.
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-6 text-sm text-muted shadow-card">
            No non-demo merchants at this node yet.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto rounded-card bg-white shadow-card">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="px-3 py-2 font-semibold">Merchant</th>
                  <th className="px-3 py-2 font-semibold">Evidence</th>
                  <th className="px-3 py-2 font-semibold">Plan</th>
                  <th className="px-3 py-2 font-semibold">Slots</th>
                  <th className="px-3 py-2 font-semibold">Visible</th>
                  <th className="px-3 py-2 font-semibold">Claims</th>
                  <th className="px-3 py-2 font-semibold">Arrivals</th>
                  <th className="px-3 py-2 font-semibold">Verified</th>
                  <th className="px-3 py-2 font-semibold">Fast Visits</th>
                  <th className="px-3 py-2 font-semibold">Fees</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const status = pilotMerchantStatus(r);
                  const conv = merchantConversion(r);
                  return (
                    <tr key={r.merchantId} className="border-b border-line/60 align-top">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/merchants/${r.merchantId}`}
                          className="font-semibold text-ink underline-offset-2 hover:underline"
                        >
                          {r.name}
                        </Link>
                        <span className="block text-[11px] text-muted">
                          {r.position !== null
                            ? `Merchant ${String(r.position).padStart(2, "0")}`
                            : "no cohort position"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted">
                        {evidenceClassLabel(r.evidence)}
                      </td>
                      <td className="px-3 py-2 text-xs capitalize text-muted">{r.tier}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.activeDeals === null ? "—" : `${r.activeDeals}/${r.dealCap}`}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{fmt(r.shopperVisibleDeals)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {fmt(r.claims)}
                        {conv !== null ? (
                          <span className="block text-[11px] text-muted">
                            {Math.round(conv * 100)}% verified
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{fmt(r.arrivals)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(r.verified)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmt(r.fastVisits)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {r.successFeesKes === null ? "—" : formatKes(r.successFeesKes)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs font-semibold text-ink">{status.label}</span>
                        <span className="mt-0.5 block max-w-[22rem] text-[11px] text-muted">
                          {status.reason}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 max-w-3xl text-[11px] leading-relaxed text-muted">
        Counts are genuine-tagged per D188 — a redemption only counts when it,
        its merchant and its deal are all non-demo. A dash means the figure could
        not be read, never zero. Conversion is shown only at {MIN_CLAIMS_FOR_MERCHANT_RATIO}{" "}
        claims or more; below that a ratio would describe noise. The success fee
        is unchanged at KES 30 per verified redemption.
      </p>
    </main>
  );
}

/** Render a nullable count: a dash means unknown, never zero. */
function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}
