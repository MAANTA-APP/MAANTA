import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { FraudChip } from "@/components/ui/chips";
import { RedemptionRow } from "@/components/ui/cards";
import { cn, formatCode } from "@/lib/ui";
import { FraudActions } from "./fraud-actions";

export const dynamic = "force-dynamic";

const REASONS = ["all", "geofence", "velocity", "collusion"] as const;

/**
 * 11d Redemption monitoring / fraud audit.
 *
 * The "All redemptions" rows link to /admin/redemptions/[id] (A3) for the full
 * ticket snapshot. Fraud release/reject still happens at the fraud-event grain
 * above — the detail route is read-only surfacing, not a second action surface.
 */
export default async function AdminRedemptionsPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  await requireAdminPage();

  const reason = (REASONS as readonly string[]).includes(searchParams.reason ?? "")
    ? (searchParams.reason as (typeof REASONS)[number])
    : "all";

  const service = createServiceClient();
  let eventsQuery = service
    .from("fraud_events")
    .select("id, event_type, severity, details, created_at, merchants(merchant_name)")
    .eq("resolved", false)
    .order("created_at", { ascending: false })
    .limit(50);
  if (reason !== "all") eventsQuery = eventsQuery.eq("event_type", reason);

  const [{ data: events }, { data: recent }] = await Promise.all([
    eventsQuery,
    service
      .from("redemptions")
      .select("id, status, redeemed_at, success_fee_charged, merchants(merchant_name)")
      .order("redeemed_at", { ascending: false })
      .limit(15),
  ]);

  const detailLabel = (type: string, details: Record<string, unknown> | null) => {
    if (!details) return "";
    if (type === "geofence" && details.distance_m != null) {
      const km = Number(details.distance_m) / 1000;
      return km >= 1 ? `${km.toFixed(1)}km off` : `${details.distance_m}m off`;
    }
    if (type === "velocity" && details.count_in_10min != null) {
      return `${details.count_in_10min}/10min`;
    }
    if (type === "collusion") return "shared device";
    return "";
  };

  return (
    <main className="max-w-4xl">
      <h1 className="text-2xl font-bold text-ink">Fraud events</h1>

      <div className="mt-5 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <Link
            key={r}
            href={`/admin/redemptions${r === "all" ? "" : `?reason=${r}`}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize",
              reason === r ? "bg-brand text-ink" : "bg-cream text-muted"
            )}
          >
            {r}
          </Link>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {(events ?? []).length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-8 text-center text-sm text-muted">
            No unresolved fraud events
          </p>
        ) : (
          (events ?? []).map((e) => {
            const details = e.details as Record<string, unknown> | null;
            const code = details?.code as string | undefined;
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-bold text-ink">
                    {code ? `Code ${formatCode(code)} · ` : ""}
                    <span className="font-sans">
                      {(e.merchants as unknown as { merchant_name: string } | null)
                        ?.merchant_name ?? "Unknown shop"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {detailLabel(e.event_type, details)}
                  </p>
                </div>
                <FraudChip reason={e.event_type} />
                <FraudActions eventId={e.id} />
              </div>
            );
          })
        )}
      </div>

      <h2 className="mt-8 text-base font-bold text-ink">All redemptions</h2>
      <div className="mt-2 max-w-2xl rounded-card border border-line bg-white px-4">
        {(recent ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No redemptions yet</p>
        ) : (
          (recent ?? []).map((r) => (
            <Link key={r.id} href={`/admin/redemptions/${r.id}`} className="block hover:bg-cream/50">
              <RedemptionRow
                when={r.redeemed_at}
                status={r.status as "success" | "failed" | "flagged" | "pending"}
                amount={r.success_fee_charged}
              />
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
