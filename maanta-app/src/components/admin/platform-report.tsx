import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { KpiCard } from "@/components/ui/cards";
import { LeadsReadError } from "@/components/agent/lead-row-list";
import { cn } from "@/lib/ui";
import { readLedgerFeeTotals } from "@/lib/evidence-scope";
import { FEE_FIGURE_LABELS, feeFigure } from "@/components/admin/fee-figures";

export const REPORT_RANGES = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "7d", days: 7 },
  { value: "30d", label: "30d", days: 30 },
] as const;

export type ReportRange = (typeof REPORT_RANGES)[number];

export function resolveReportRange(param: string | undefined): ReportRange {
  return REPORT_RANGES.find((r) => r.value === param) ?? REPORT_RANGES[1];
}

/**
 * Platform reporting — KPIs + redemptions-per-day chart.
 *
 * One component, two shells: `/admin/reports` (admin-gated) and
 * `/founder/reports` (founder-gated). Until 2026-09-03 the founder route was
 * a redirect into the admin route, which bounced a co-founder off the product
 * because `requireFounderPage` admits a role `requireAdminPage` refuses. The
 * report is read-only, so it belongs to both; the guard belongs to the page.
 *
 * D164 (extended 2026-08-25) — a failed read must never render as a real
 * figure. Every value here used to be destructured straight off
 * `Promise.all`, discarding each `error`, so one failed query rendered
 * "Verified redemptions 0" and "Success-fee revenue KES 0" as confident
 * statements about the business. Every read here is a metric, so the guarded
 * set is the whole array.
 */
export async function PlatformReport({
  range,
  basePath,
}: {
  range: ReportRange;
  /** Where the range pills link — the shell's own route. */
  basePath: string;
}) {
  const since = new Date(Date.now() - range.days * 24 * 3600_000).toISOString();

  const service = createServiceClient();
  const results = await Promise.all([
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "success")
      .gte("redeemed_at", since),
    readLedgerFeeTotals(service, { window: { since } }),
    service
      .from("merchants")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    service
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString()),
    service.rpc("admin_redemptions_per_day", { p_days: 14 }),
  ]);

  const readFailed = results.find((r) => (r as { error?: unknown }).error);
  if (readFailed) {
    return (
      <main className="max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">Reports</h1>
        <div className="mt-6">
          <LeadsReadError
            what="the reports dashboard"
            sub="This is a read error, not zeroed metrics. Reload the page; if it keeps failing, tell the Maanta team."
          />
        </div>
      </main>
    );
  }

  const [
    { count: verified },
    feeTotals,
    { count: activeShops },
    { count: liveDeals },
    { data: chartRows },
  ] = results;

  // Redemptions-per-day, last 14 days (SQL GROUP BY via RPC).
  const days: { label: string; count: number }[] = [];
  const countByDay = new Map<string, number>();
  for (const row of chartRows ?? []) {
    const key = String(row.day);
    countByDay.set(key, Number(row.cnt) || 0);
  }
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({
      label: d.toLocaleDateString("en-KE", { day: "numeric", timeZone: "UTC" }),
      count: countByDay.get(key) ?? 0,
    });
  }
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <main className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Platform reporting</h1>
        <div className="flex gap-2">
          {REPORT_RANGES.map((r) => (
            <Link
              key={r.value}
              href={`${basePath}${r.value === "7d" ? "" : `?range=${r.value}`}`}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold",
                // A6 — active range pill is neutral ink, not amber.
                range.value === r.value ? "bg-ink text-white" : "bg-cream text-muted"
              )}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        All merchants, all evidence classes — an operational view. Verified counts every
        `success` row, internal and synthetic included; the pilot ladder is read on the
        founder command centre, never here.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* Two populations sit side by side here and the labels have to say so
            (Codex P2 on PR #319): the verified count is every `success` row,
            synthetic included, while the ledger reader's contract (D188 / D211)
            is genuine-tagged rows only. Neither number is changed — the scope
            each one covers is stated on the card. */}
        <KpiCard
          label="Verified redemptions"
          value={(verified ?? 0).toLocaleString()}
          hint="Every success row — internal and synthetic included"
        />
        <KpiCard
          label={FEE_FIGURE_LABELS.net}
          value={feeFigure(feeTotals.netKes)}
          hint="Genuine-tagged rows only (ledger contract)"
        />
        <KpiCard
          label={FEE_FIGURE_LABELS.gross}
          value={feeFigure(feeTotals.grossKes)}
          hint="Genuine-tagged rows only (ledger contract)"
        />
        <KpiCard
          label={FEE_FIGURE_LABELS.reversals}
          value={feeFigure(feeTotals.reversalsKes)}
          hint="Genuine-tagged rows only (ledger contract)"
        />
        <KpiCard label="Active shops" value={activeShops ?? 0} />
        <KpiCard label="Live deals" value={liveDeals ?? 0} />
      </div>

      <div className="mt-6 rounded-card bg-white shadow-card p-5">
        <p className="text-xs font-semibold text-muted">Redemptions per day — last 14 days</p>
        {/* Bar heights carried the values via hover title only — the aria-label
            is the non-visual reading of the same series. */}
        <div
          className="mt-4 flex h-40 items-end gap-1.5"
          role="img"
          aria-label={`Redemptions per day, last 14 days: ${days
            .map((d) => `${d.label}: ${d.count}`)
            .join(", ")}`}
        >
          {days.map((d, i) => (
            <div key={i} aria-hidden className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-ink"
                style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }}
                title={`${d.count}`}
              />
              <span className="text-[9px] text-faint">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
