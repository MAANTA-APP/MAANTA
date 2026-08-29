import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { AdminReadError } from "@/components/admin/read-error";
import {
  FEE_FIGURE_LABELS,
  FeeBreakdownCell,
  feeFigure,
} from "@/components/admin/fee-figures";
import { KpiCard } from "@/components/ui/cards";
import { readDemoModeEnabled } from "@/lib/demo-mode";
import { NODE_0, nodeLabel } from "@/lib/nodes";
import {
  GENUINE_JOIN_SELECT,
  genuineTagged,
  readLedgerFeeTotals,
} from "@/lib/evidence-scope";
import { withPublicMerchant } from "@/lib/data";
import { activeDealLimit, normaliseTier } from "@/lib/plan-limits";
import {
  classifyMerchant,
  cohortPosition,
  externalCohort,
  externalCohortSize,
  evidenceClassLabel,
  type EvidenceClass,
} from "@/lib/pilot-cohort";
import {
  pilotMerchantStatus,
  merchantConversion,
  cohortTotals,
  totalsByEvidence,
  buildPilotAlerts,
  MIN_CLAIMS_FOR_MERCHANT_RATIO,
  type PilotMerchantRow,
} from "@/lib/pilot-command-centre";

export const dynamic = "force-dynamic";

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
  // No `node` param: this page is fixed to Node 0. See the comment below.
  searchParams: { window?: string };
}) {
  await requireAdminPage();

  // This surface is Node 0's, and only Node 0's. It is not a node-generic
  // analytics page and must not offer a switcher that makes it look like one.
  //
  // It used to take `?node=`, but the cohort KPIs beside the table are read
  // from NODE0_COHORT_MANIFEST, which is the Node 0 enrolment allow-list and
  // carries no node column because there is nothing else for it to be. So
  // selecting CBD Galleria filtered the merchant rows and the activity totals
  // to CBD while the evidence cards above them still showed the Node 0
  // manifest count — two populations, one page, presented as one. With
  // Merchant 01 enrolled that renders BBS Mall's enrolment as though it were
  // CBD's, on the surface whose entire job is to say what the pilot has
  // actually proved.
  //
  // Fixing the KPI to follow a selector would have meant giving the manifest a
  // node of its own: a hand-maintained second copy of `merchants.node`, free to
  // disagree with it silently. Removing the selector removes the mismatch
  // instead, and costs nothing real — the ladder is measured at one mall.
  const node = NODE_0;
  const days = searchParams.window === "30" ? 30 : 7;
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();

  const service = createServiceClient();

  // Demo mode decides whether synthetic deals count as shopper-visible supply,
  // so a failed read of the flag makes that column unknowable rather than zero.
  const demoMode = await readDemoModeEnabled();

  // The cohort: every non-demo merchant. Demo shops are not pilot subjects.
  //
  // `is_shadow_banned` rides along because the canonical public-merchant rule
  // needs all three of status/is_visible/is_shadow_banned. Selecting two of
  // them is what let a shadow-banned merchant be diagnosed on its supply.
  //
  // Bounded, with an EXACT count. An unbounded select here would be capped by
  // PostgREST's server row limit with no error, so `allCohort.length` would be
  // the page size rather than the cohort size — the "showing 50 of N" line and
  // the omitted count would both quietly understate, while fetching far more
  // rows than the 50 actually rendered. `count: "exact"` comes back in
  // Content-Range and is unaffected by the limit, so the total stays true.
  const {
    data: merchants,
    error: merchantsError,
    count: cohortTotal,
  } = await service
    .from("merchants")
    .select(
      "id, merchant_name, status, tier, node, is_visible, is_shadow_banned, created_at",
      { count: "exact" }
    )
    .eq("is_demo", false)
    // Always scoped, never conditional: the cohort must describe the same
    // population as the manifest KPIs above it.
    .eq("node", node)
    .order("created_at", { ascending: true })
    .limit(MAX_COHORT_ROWS);

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

  // The query already returns at most MAX_COHORT_ROWS, so there is nothing to
  // slice. How many exist beyond them comes from the exact count, never from
  // the length of a page.
  const cohort = merchants ?? [];
  const omitted =
    cohortTotal === null ? null : Math.max(0, cohortTotal - cohort.length);
  // Per-merchant counts. Each is its own query so one failure marks one cell
  // unknown rather than blanking the page.
  const rows: PilotMerchantRow[] = await Promise.all(
    cohort.map(async (m) => {
      const tier = normaliseTier(m.tier);
      const nowIso = new Date().toISOString();

      const [
        activeDealsRes,
        visibleDealsRes,
        genuineVisibleDealsRes,
        claimsRes,
        arrivalsRes,
        verifiedRes,
        verifiedCohortRes,
        fastVisitsRes,
        fees,
      ] = await Promise.all([
        service
          .from("deals")
          .select("id", { count: "exact", head: true })
          .eq("merchant_id", m.id)
          .eq("is_active", true),
        // Shopper-visible must mean what the FEED means, not a shorter version
        // of it. The deal-side conditions (active, not paused, unexpired) are
        // only half the rule: a deal on a suspended, hidden or shadow-banned
        // merchant reaches nobody, and counting it would report supply that no
        // shopper can see. withPublicMerchant() is the same helper the shopper
        // surfaces use, so this count cannot drift from the feed — including
        // its demo handling. A failed demo-flag read resolves the column to
        // null below rather than silently shrinking it.
        withPublicMerchant(
          service
            .from("deals")
            .select("id, merchants!inner(status,is_visible,is_shadow_banned,is_demo)", {
              count: "exact",
              head: true,
            })
            .eq("merchant_id", m.id)
            .eq("is_active", true)
            .eq("is_paused", false)
            .gt("expires_at", nowIso),
          { includeDemo: demoMode.enabled }
        ),
        // The same supply count with demo ALWAYS excluded.
        //
        // Two numbers, deliberately, because two different questions are being
        // asked. The row diagnosis asks "can a shopper see anything from this
        // merchant right now" — and with demo mode ON a synthetic deal really
        // is visible, so counting it is correct there or the no-supply alert
        // fires against a merchant whose deals are on screen. The EVIDENCE
        // card asks "how much genuine supply do enrolled pilot merchants
        // have" — and a synthetic deal is never field evidence, whatever a
        // shopper can see. Collapsing them would make one of the two wrong.
        withPublicMerchant(
          service
            .from("deals")
            .select("id, merchants!inner(status,is_visible,is_shadow_banned,is_demo)", {
              count: "exact",
              head: true,
            })
            .eq("merchant_id", m.id)
            .eq("is_active", true)
            .eq("is_paused", false)
            .gt("expires_at", nowIso),
          { includeDemo: false }
        ),
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
            // Arrivals are windowed by arrived_at, the event's OWN timestamp.
            // Windowing by claimed_at counted an arrival only if the CLAIM fell
            // in the period, so someone who claimed last week and walked in
            // yesterday was invisible — a throughput column that silently
            // under-reports the thing it is named after.
            .gte("arrived_at", since)
        ),
        // Throughput: verified AT the counter during the window, whenever the
        // claim was made.
        genuineTagged(
          service
            .from("redemptions")
            .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
            .eq("merchant_id", m.id)
            .eq("status", "success")
            .gte("redeemed_at", since)
        ),
        // Cohort: verified OUT OF the claims made in this window. Every funnel
        // figure uses this one; mixing it with throughput can exceed 100% and
        // can hide a merchant whose window claims all went cold.
        genuineTagged(
          service
            .from("redemptions")
            .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
            .eq("merchant_id", m.id)
            .eq("status", "success")
            .gte("claimed_at", since)
        ),
        genuineTagged(
          service
            .from("redemptions")
            .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
            .eq("merchant_id", m.id)
            // Same rule: Fast Visits are windowed by the persisted arrival
            // verdict's own timestamp, not by when the claim happened.
            .gte("fast_visit_qualified_at", since)
        ),
        // Fees, on the SAME evidence scope as every count beside them, and
        // read through the one shared fee reader.
        //
        // This page used to build the fee query itself: a genuine-tagged
        // redemption read, then a `merchant_transactions` read filtered
        // `.in("transaction_type", FEE_LEDGER_TYPES)`. That type filter was a
        // correctness rule living in the caller — it decided what counted as a
        // fee, in three separate places, and none of them had any opinion about
        // a reversal. `readLedgerFeeTotals` owns both decisions now: which rows
        // are genuine-tagged (the D188 parent chain) and what each transaction
        // type means (the ledger contract). There is no type filter here to get
        // wrong, because there is no type filter.
        //
        // The window follows each ledger movement's own `created_at`, so a
        // reversal posted inside the window against an older redemption lands
        // in this window's reversals — which is the point of reporting them.
        readLedgerFeeTotals(service, {
          merchantIds: [m.id],
          window: { since },
        }),
      ]);

      const count = (r: { count: number | null; error: unknown }) =>
        r.error ? null : r.count ?? 0;

      return {
        merchantId: m.id,
        name: m.merchant_name ?? "Unnamed merchant",
        position: cohortPosition(m.id),
        evidence: classifyMerchant(m.id) as EvidenceClass,
        tier,
        status: m.status ?? "unknown",
        isVisible: m.is_visible !== false,
        isShadowBanned: m.is_shadow_banned === true,
        activeDeals: count(activeDealsRes),
        dealCap: activeDealLimit(tier),
        shopperVisibleDeals: demoMode.ok ? count(visibleDealsRes) : null,
        genuineVisibleDeals: count(genuineVisibleDealsRes),
        claims: count(claimsRes),
        arrivals: count(arrivalsRes),
        verified: count(verifiedRes),
        verifiedCohort: count(verifiedCohortRes),
        fastVisits: count(fastVisitsRes),
        fees,
      } satisfies PilotMerchantRow;
    })
  );

  // The ladder itself: CUMULATIVE genuine verified redemptions by enrolled
  // external merchants, since the pilot began.
  //
  // Not the enrolment count, and not the windowed Verified card. CLAUDE.md is
  // explicit — "Ladder: 1 -> 5 -> 10 genuine verified redemptions", and
  // "External field validation: 0 genuine merchant successes ... starts at
  // zero until a real merchant serves a real shopper". Enrolling Merchant 01
  // must NOT move this number; only a real success may. And the rungs are
  // cumulative, so a 7-day window would silently walk the ladder backwards
  // once a success ages out.
  const externalIds = externalCohort().map((e) => e.merchantId);
  const ladderRes =
    externalIds.length === 0
      ? null
      : await genuineTagged(
          service
            .from("redemptions")
            .select(GENUINE_JOIN_SELECT, { count: "exact", head: true })
            .in("merchant_id", externalIds)
            .eq("status", "success")
        );
  // Nobody enrolled is a true zero, not an unread one.
  const ladderSuccesses =
    ladderRes === null ? 0 : ladderRes.error ? null : ladderRes.count ?? 0;

  const totals = cohortTotals(rows);
  // Split before rendering: an undifferentiated sum beside the ladder counters
  // lets an internal row increment the ladder (D174).
  const byClass = totalsByEvidence(rows);
  const alerts = buildPilotAlerts(rows);
  const externalEnrolled = externalCohortSize();

  return (
    <main className="max-w-6xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Pilot command centre</h1>
        <p className="text-xs text-muted">
          Node 0 · {nodeLabel(node)} · last {days} days · read-only
        </p>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Every non-demo merchant, and what has actually happened at each one.
        Counts are genuine-tagged (D188: redemption, merchant and deal all
        non-demo). Genuine-tagged is a property of the data — it does not make a
        merchant external field validation.
      </p>
      <p className="mt-2 max-w-3xl text-xs text-muted">
        Fixed to Node 0 ({nodeLabel(node)}). There is no node switcher here on
        purpose: the evidence cards below are read from the Node 0 cohort
        manifest, so a page that could be filtered to another mall would show
        one node&rsquo;s enrolment beside another node&rsquo;s activity. Use{" "}
        <Link href="/admin" className="underline">
          the admin dashboard
        </Link>{" "}
        for a multi-node view.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {[7, 30].map((d) => (
          <Link
            key={d}
            href={`/admin/pilot?window=${d}`}
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
      <h2 className="mt-6 text-sm font-semibold text-ink">
        Evidence · not windowed
      </h2>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">
        The ladder is cumulative since the pilot began; the three cohort counts
        are current. None of these move with the {days}-day selector.
      </p>
      <section className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ladder — genuine verified redemptions"
          value={fmt(ladderSuccesses)}
          hint="Cumulative successes by enrolled external merchants, all time. THIS is the 1 → 5 → 10 ladder. Enrolling a merchant does not move it; only a real merchant serving a real shopper does."
        />
        <KpiCard
          label="External merchants enrolled"
          value={externalEnrolled.toLocaleString()}
          hint="Cohort size: merchants explicitly enrolled in the Node 0 manifest. A prerequisite for the ladder, never a rung on it."
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
            External field validation is 0 — no enrolled merchant, and no
            genuine verified redemption.
          </strong>{" "}
          No merchant has been enrolled in the Node 0 cohort manifest yet. Any
          activity below is internal or unclassified, and none of it tests the
          pull hypothesis. Merchant 01 becomes external the moment it is added
          to <code className="text-xs">lib/pilot-cohort.ts</code>.
        </p>
      ) : null}

      {/* The ladder's own counters: EXTERNAL rows only.
          Summing every row here would put production's internal E2E success in
          the headline "Verified" card while External field validation reads 0
          — an internal row incrementing the 1 → 5 → 10 ladder, which is the
          counting error D174 exists to stop. */}
      {/* Supply is CURRENT STATE. The query has no window at all and compares
          expiry against page-load time, so a deal published or expired this
          minute moves it — while everything under the windowed heading below
          is fixed to the selected period. Separate headings, because a reader
          scans headings. */}
      <h2 className="mt-6 text-sm font-semibold text-ink">
        External field validation · supply right now
      </h2>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">
        A snapshot taken as this page loaded, not a figure for the last {days}{" "}
        days. Genuine deals only — synthetic supply is never field validation,
        even while demo mode makes it visible to shoppers.
      </p>
      <section className="mt-2 grid gap-3 sm:grid-cols-2">
        <KpiCard
          label="Shopper-visible deals (genuine)"
          value={fmt(byClass.external.genuineVisibleDeals)}
        />
      </section>

      <h2 className="mt-6 text-sm font-semibold text-ink">
        External field validation · last {days} days
      </h2>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">
        Enrolled pilot merchants only. This is the row the 1 → 5 → 10 ladder
        counts. Internal and unclassified activity is reported separately below
        and never added to these figures.
      </p>
      <section className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={`Claims (${days}d)`} value={fmt(byClass.external.claims)} />
        <KpiCard label={`Arrivals (${days}d)`} value={fmt(byClass.external.arrivals)} />
        <KpiCard label={`Verified (${days}d)`} value={fmt(byClass.external.verified)} />
        <KpiCard
          label={`${FEE_FIGURE_LABELS.net} (${days}d)`}
          value={feeFigure(byClass.external.fees.netKes)}
        />
      </section>

      {/* The audit trail behind the headline, never folded into it. */}
      <section className="mt-3 grid gap-3 sm:grid-cols-2">
        <KpiCard
          label={`${FEE_FIGURE_LABELS.gross} (${days}d)`}
          value={feeFigure(byClass.external.fees.grossKes)}
        />
        <KpiCard
          label={`${FEE_FIGURE_LABELS.reversals} (${days}d)`}
          value={feeFigure(byClass.external.fees.reversalsKes)}
        />
      </section>
      <p className="mt-1.5 max-w-3xl text-xs text-muted">
        Gross is what the money path billed — charged, plus recorded as arrears.
        Reversals are admin-gated credits against a billed fee. Net is gross less
        reversals, and is the figure to act on. Each is windowed by the ledger
        movement&rsquo;s own timestamp, so a reversal posted in the last {days}{" "}
        days counts here even when the redemption it corrects is older.
      </p>

      {/* Kept, labelled, and never added to the row above. */}
      <h2 className="mt-6 text-sm font-semibold text-ink">
        Internal and unclassified · last {days} days
      </h2>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">
        Activity columns cover the selected window; the visible-deals column is
        a snapshot taken now, marked <em>(now)</em>, because supply has no
        window.
      </p>
      <p className="mt-0.5 max-w-3xl text-xs text-muted">
        MAANTA testing itself, plus non-demo merchants the manifest does not
        name. Technical evidence — real rows, and not a test of whether anyone
        wants this (D174 / D184).
      </p>
      <div className="mt-2 overflow-x-auto rounded-card bg-white shadow-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 font-semibold">Class</th>
              <th className="px-3 py-2 font-semibold">Merchants</th>
              <th className="px-3 py-2 font-semibold">
                Visible deals<span className="font-normal"> (now)</span>
              </th>
              <th className="px-3 py-2 font-semibold">Claims</th>
              <th className="px-3 py-2 font-semibold">Arrivals</th>
              <th className="px-3 py-2 font-semibold">Verified</th>
              <th className="px-3 py-2 font-semibold">
                {FEE_FIGURE_LABELS.net}
              </th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Internal", byClass.internal],
                ["Unclassified", byClass.unclassified],
              ] as const
            ).map(([label, t]) => (
              <tr key={label} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-semibold text-ink">{label}</td>
                <td className="px-3 py-2">{t.merchants}</td>
                <td className="px-3 py-2">{fmt(t.genuineVisibleDeals)}</td>
                <td className="px-3 py-2">{fmt(t.claims)}</td>
                <td className="px-3 py-2">{fmt(t.arrivals)}</td>
                <td className="px-3 py-2">{fmt(t.verified)}</td>
                <td className="px-3 py-2">
                  <FeeBreakdownCell totals={t.fees} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
        {omitted === null && cohort.length >= MAX_COHORT_ROWS ? (
          <p className="mt-2 rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
            Showing the first {MAX_COHORT_ROWS} non-demo merchants at Node 0.
            The cohort total could not be established, so it is unknown whether
            more exist — the totals above cover only the merchants shown.
          </p>
        ) : null}
        {omitted !== null && omitted > 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-3 text-xs text-muted shadow-card">
            Showing the {MAX_COHORT_ROWS} oldest of {cohortTotal} non-demo
            merchants at Node 0. {omitted} more{" "}
            {omitted === 1 ? "is" : "are"} not listed here, and the totals above
            cover only the merchants shown.
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="mt-2 rounded-card bg-white px-4 py-6 text-sm text-muted shadow-card">
            No non-demo merchants at Node 0 yet.
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
                  <th className="px-3 py-2 font-semibold">Arrivals*</th>
                  <th className="px-3 py-2 font-semibold">Verified*</th>
                  <th className="px-3 py-2 font-semibold">Fast Visits*</th>
                  <th className="px-3 py-2 font-semibold">
                    {FEE_FIGURE_LABELS.net}
                  </th>
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
                        <FeeBreakdownCell totals={r.fees} />
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
        claims or more; below that a ratio would describe noise, and it is
        computed from the claim cohort — verifications OF the claims in this
        window — never from throughput. * marks a THROUGHPUT count, windowed by
        the event&apos;s own timestamp (verified by <code>redeemed_at</code>, arrivals
        by <code>arrived_at</code>, Fast Visits by
        <code>fast_visit_qualified_at</code>): what happened in the period,
        whenever the claim was made. Throughput and cohort figures answer
        different questions and are never mixed. The success fee is unchanged at
        KES 30 per verified redemption.
      </p>
    </main>
  );
}

/** Render a nullable count: a dash means unknown, never zero. */
function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString();
}
