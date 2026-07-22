import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { GuardianChip, GuardianSeverityChip, StatusChip } from "@/components/ui/chips";
import { IconArrowLeft } from "@/components/ui/icons";
import { friendlyTime } from "@/lib/ui";
import { ReleaseActions } from "./release-actions";

export const dynamic = "force-dynamic";

type GuardianEvent = {
  id: string;
  check_type: string;
  severity: string;
  recommendation: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type RedemptionDetail = {
  redemption_id: string;
  status: string;
  merchant_id: string | null;
  user_id: string | null;
  deal_id: string | null;
  success_fee_charged: number | null;
  distance_from_shop: number | null;
  fraud_flags: string[] | null;
  review_required: boolean;
  redeemed_at: string;
  guardian_recommendation: string | null;
  guardian_events: GuardianEvent[];
};

function metres(d: number) {
  return d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`;
}

/** Plain-English description of a Guardian check row for the audit timeline. */
function describeCheck(e: GuardianEvent): string {
  const m = e.metadata ?? {};
  const n = (k: string) => (m[k] == null ? "?" : String(m[k]));
  switch (e.check_type) {
    case "velocity_shopper":
      return `Shopper velocity — ${n("count")} redemptions in ${n("window_minutes")} min`;
    case "velocity_merchant":
      return `Merchant velocity — ${n("count")} redemptions in ${n("window_minutes")} min`;
    case "velocity_deal":
      return `Same deal repeated — ${n("count")} redemptions in ${n("window_minutes")} min`;
    case "geofence":
      return m.distance_m != null
        ? `Geofence — ${metres(Number(m.distance_m))} from the shop`
        : "Geofence";
    case "collusion":
      return `Collusion — ${n("total")} redemptions by ${n("distinct_users")} shoppers in ${n("window_minutes")} min`;
    default:
      return e.check_type;
  }
}

/** Guardian v1 admin redemption detail (docs/maanta-guardian-v1.md §5). */
export default async function AdminRedemptionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminPage();
  const service = createServiceClient();

  const { data: detail } = await service
    .rpc("admin_redemption_detail", { p_redemption_id: params.id })
    .maybeSingle<RedemptionDetail>();

  if (!detail) notFound();

  const [{ data: merchant }, { data: deal }] = await Promise.all([
    detail.merchant_id
      ? service.from("merchants").select("merchant_name").eq("id", detail.merchant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    detail.deal_id
      ? service.from("deals").select("title").eq("id", detail.deal_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const checks = (detail.guardian_events ?? []).filter((e) => e.check_type !== "overall");
  const held = detail.status === "flagged";
  const flags = detail.fraud_flags ?? [];
  const fee = detail.success_fee_charged;

  return (
    <main className="max-w-2xl">
      <Link
        href="/admin/redemptions"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink"
      >
        <IconArrowLeft className="h-4 w-4" />
        Redemptions
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">
          {(merchant as { merchant_name?: string } | null)?.merchant_name ?? "Unknown shop"}
        </h1>
        {detail.guardian_recommendation ? (
          <GuardianChip recommendation={detail.guardian_recommendation} />
        ) : (
          <GuardianChip recommendation="none" />
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        {(deal as { title?: string } | null)?.title ?? "Deal"} · {friendlyTime(detail.redeemed_at)}
      </p>

      {/* Held → the admin override path (Release charges the fee; Reject fails it). */}
      {held ? (
        <div className="mt-5 rounded-card border border-flame bg-white p-4">
          <p className="text-sm font-bold text-ink">Held for review</p>
          <p className="mt-1 text-sm text-secondary">
            Guardian held this redemption before any fee moved. Release to complete it and charge
            the KES {fee != null ? Math.round(fee) : 30} success fee, or reject to fail it with no
            fee.
          </p>
          <div className="mt-3">
            <ReleaseActions redemptionId={detail.redemption_id} />
          </div>
        </div>
      ) : null}

      {/* Summary */}
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 rounded-card border border-line bg-white p-4 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Redemption</dt>
          <dd className="mt-1">
            <StatusChip status={detail.status} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Success fee</dt>
          <dd className="mt-1 tnum font-semibold text-ink">
            {fee != null ? `KES ${Math.round(fee)}` : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            Distance from shop
          </dt>
          <dd className="mt-1 tnum text-ink">
            {detail.distance_from_shop != null ? metres(Number(detail.distance_from_shop)) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Flags</dt>
          <dd className="mt-1 text-ink">{flags.length > 0 ? flags.join(", ") : "—"}</dd>
        </div>
      </dl>

      {/* Guardian audit timeline */}
      <h2 className="mt-8 text-base font-bold text-ink">Guardian checks</h2>
      <div className="mt-2 space-y-2">
        {checks.length === 0 ? (
          <p className="rounded-card border border-line bg-white px-4 py-6 text-center text-sm text-muted">
            No Guardian signals fired on this redemption.
          </p>
        ) : (
          checks.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{describeCheck(e)}</p>
                <p className="mt-0.5 text-xs text-muted">{friendlyTime(e.created_at)}</p>
              </div>
              <GuardianSeverityChip severity={e.severity} />
            </div>
          ))
        )}
      </div>
    </main>
  );
}
