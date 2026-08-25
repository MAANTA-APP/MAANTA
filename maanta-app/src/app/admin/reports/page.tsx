import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { KpiCard } from "@/components/ui/cards";
import { LeadsReadError } from "@/components/agent/lead-row-list";
import { cn, formatKes } from "@/lib/ui";

export const dynamic = "force-dynamic";

const RANGES = [
  { value: "today", label: "Today", days: 1 },
  { value: "7d", label: "7d", days: 7 },
  { value: "30d", label: "30d", days: 30 },
] as const;

/** 11g Platform reporting — KPIs + redemptions-per-day chart. */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireAdminPage();

  const range = RANGES.find((r) => r.value === searchParams.range) ?? RANGES[1];
  const since = new Date(Date.now() - range.days * 24 * 3600_000).toISOString();

  const service = createServiceClient();
  const results = await Promise.all([
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "success")
      .gte("redeemed_at", since),
    // SQL SUM — never pull fee rows into JS (PostgREST 1000-row cap under-reports).
    service.rpc("admin_success_fee_revenue", { p_since: since }),
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

  // D164 (extended 2026-08-25) — a failed read must never render as a real
  // figure. Every value on this page used to be destructured straight off
  // `Promise.all`, discarding each `error`, so one failed query rendered
  // "Verified redemptions 0" and **"Success-fee revenue KES 0"** as confident
  // statements about the business. That is the same defect D149 fixed on
  // /founder and D164 fixed on /admin; this page was simply never covered, and
  // it is the one that puts a zero next to money.
  //
  // Every read here is a metric, so unlike /admin there is nothing to exclude —
  // the guarded set is the whole array.
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
    { data: feeRevenue },
    { count: activeShops },
    { count: liveDeals },
    { data: chartRows },
  ] = results;

  const revenue = Number(feeRevenue ?? 0) || 0;

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
          {RANGES.map((r) => (
            <Link
              key={r.value}
              href={`/admin/reports${r.value === "7d" ? "" : `?range=${r.value}`}`}
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

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Verified redemptions" value={(verified ?? 0).toLocaleString()} />
        <KpiCard label="Success-fee revenue" value={formatKes(revenue)} />
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
                className="w-full rounded-t-md bg-brand"
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
