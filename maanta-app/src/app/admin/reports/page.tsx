import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { KpiCard } from "@/components/ui/cards";
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
  const [
    { count: verified },
    { data: fees },
    { count: activeShops },
    { count: liveDeals },
    { data: chartRows },
  ] = await Promise.all([
    service
      .from("redemptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "success")
      .gte("redeemed_at", since),
    service
      .from("merchant_transactions")
      .select("amount")
      .eq("transaction_type", "success_fee")
      .gte("created_at", since),
    service
      .from("merchants")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    service
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .gt("expires_at", new Date().toISOString()),
    service
      .from("redemptions")
      .select("redeemed_at")
      .eq("status", "success")
      .gte("redeemed_at", new Date(Date.now() - 14 * 24 * 3600_000).toISOString()),
  ]);

  const revenue = (fees ?? []).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  // Redemptions-per-day, last 14 days.
  const days: { label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({ label: d.toLocaleDateString("en-KE", { day: "numeric" }), count: 0 });
  }
  for (const r of chartRows ?? []) {
    const d = new Date(r.redeemed_at);
    const idx = 13 - Math.floor((Date.now() - d.setHours(0, 0, 0, 0)) / (24 * 3600_000));
    if (idx >= 0 && idx < 14) days[idx].count++;
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

      <div className="mt-6 rounded-card border border-line bg-white p-5">
        <p className="text-xs font-semibold text-muted">Redemptions per day — last 14 days</p>
        <div className="mt-4 flex h-40 items-end gap-1.5">
          {days.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
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
