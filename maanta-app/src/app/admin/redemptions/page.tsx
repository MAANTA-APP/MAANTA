import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { FraudChip, GuardianChip } from "@/components/ui/chips";
import { RedemptionRow } from "@/components/ui/cards";
import { IconChevronRight } from "@/components/ui/icons";
import { cn, formatCode, friendlyTime } from "@/lib/ui";
import { FraudActions } from "./fraud-actions";
import { AdminReadError } from "@/components/admin/read-error";

export const dynamic = "force-dynamic";

const REASONS = ["all", "geofence", "velocity", "collusion"] as const;

/**
 * 11d Redemption monitoring / fraud audit.
 *
 * The "All redemptions" rows link to /admin/redemptions/[id] — the per-redemption
 * ticket snapshot (A3), Guardian recommendation/held-release, and the fee-reversal
 * surface (frozen reversal policy, Decisions Log 2026-07-22). The held queue below
 * is the actionable Guardian list; fraud release/reject stays at the fraud-event
 * grain above.
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

  const [eventsRes, recentRes, heldRes] = await Promise.all([
    eventsQuery,
    service
      .from("redemptions")
      .select("id, status, redeemed_at, success_fee_charged, merchants(merchant_name)")
      .order("redeemed_at", { ascending: false })
      .limit(15),
    // Guardian v1 soft-blocks: held redemptions awaiting an admin release
    // (docs/maanta-guardian-v1.md §3). No fee has moved on these yet.
    service
      .from("redemptions")
      .select("id, redeemed_at, distance_from_shop, fraud_flags, merchants(merchant_name), deals(title)")
      .eq("status", "flagged")
      .order("redeemed_at", { ascending: false })
      .limit(25),
  ]);

  if (eventsRes.error || recentRes.error || heldRes.error) {
    return (
      <main className="max-w-4xl">
        <h1 className="text-2xl font-bold text-ink">Redemption monitoring</h1>
        <div className="mt-5"><AdminReadError what="redemption monitoring" /></div>
      </main>
    );
  }

  const events = eventsRes.data;
  const recent = recentRes.data;
  const held = heldRes.data;

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
      <h1 className="text-2xl font-bold text-ink">Redemption monitoring</h1>

      {/* Guardian held queue — the actionable list: soft-blocked redemptions
          waiting on an admin release. No fee has moved on these. */}
      <section className="mt-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-ink">Held for review</h2>
          <GuardianChip recommendation="soft_block" />
        </div>
        <div className="mt-2 space-y-2">
          {(held ?? []).length === 0 ? (
            <p className="rounded-card bg-white shadow-card px-4 py-6 text-center text-sm text-muted">
              Nothing held. Guardian releases the counter unless a check blocks.
            </p>
          ) : (
            (held ?? []).map((h) => {
              const dist = h.distance_from_shop as number | null;
              const flags = (h.fraud_flags ?? []) as string[];
              return (
                <Link
                  key={h.id}
                  href={`/admin/redemptions/${h.id}`}
                  className="flex items-center gap-3 rounded-card bg-white shadow-card px-4 py-3.5 hover:bg-cream"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">
                      {(h.merchants as unknown as { merchant_name: string } | null)
                        ?.merchant_name ?? "Unknown shop"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {(h.deals as unknown as { title: string } | null)?.title ?? "Deal"}
                      {" · "}
                      {friendlyTime(h.redeemed_at)}
                      {flags.length > 0 ? ` · ${flags.join(", ")}` : ""}
                      {dist != null ? ` · ${Math.round(dist)}m` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-muted">Review</span>
                  <IconChevronRight className="h-4 w-4 text-faint" />
                </Link>
              );
            })
          )}
        </div>
      </section>

      <h2 className="mt-8 text-base font-bold text-ink">Fraud events</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <Link
            key={r}
            href={`/admin/redemptions${r === "all" ? "" : `?reason=${r}`}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold capitalize",
              // A6 — active filter pill is neutral ink, not amber; amber is
              // reserved for the one primary action (the row Approve).
              reason === r ? "bg-ink text-white" : "bg-cream text-muted"
            )}
          >
            {r}
          </Link>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {(events ?? []).length === 0 ? (
          <p className="rounded-card bg-white shadow-card px-4 py-8 text-center text-sm text-muted">
            No unresolved fraud events
          </p>
        ) : (
          (events ?? []).map((e) => {
            const details = e.details as Record<string, unknown> | null;
            const code = details?.code as string | undefined;
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-card bg-white shadow-card px-4 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-code text-sm font-bold text-ink">
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
      <div className="mt-2 max-w-2xl rounded-card bg-white shadow-card px-4">
        {(recent ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No redemptions yet</p>
        ) : (
          (recent ?? []).map((r) => (
            <Link
              key={r.id}
              href={`/admin/redemptions/${r.id}`}
              className="block -mx-4 px-4 hover:bg-cream"
            >
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
