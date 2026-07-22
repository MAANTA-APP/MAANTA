import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import {
  StatusChip,
  FraudChip,
  GuardianChip,
  GuardianSeverityChip,
} from "@/components/ui/chips";
import { InlineAlert } from "@/components/ui/inline-alert";
import { IconArrowLeft, IconChevronRight } from "@/components/ui/icons";
import { formatKes, formatCode, friendlyTime, maskPhone } from "@/lib/ui";
import { ReleaseActions } from "./release-actions";

export const dynamic = "force-dynamic";

/**
 * Admin redemption detail (`/admin/redemptions/[id]`).
 *
 * A3 read-only snapshot (the amounts the money path already wrote —
 * amount_kes = YOU PAY, success_fee_charged = KES 30) plus the Guardian v1
 * recommendation, audit timeline, and — for a held (soft-blocked) redemption —
 * the admin release/reject override (docs/maanta-guardian-v1.md §5).
 *
 * The snapshot comes from the `redemptions` row directly (no ad-hoc money
 * maths); the Guardian recommendation + events come from the
 * `admin_redemption_detail` RPC. No writes happen here — the release/reject
 * override is a separate admin-gated route.
 */

const STATUS_LABEL: Record<string, string> = {
  success: "Verified",
  pending: "Pending",
  failed: "Rejected",
  flagged: "Flagged",
};

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
  guardian_recommendation: string | null;
  guardian_events: GuardianEvent[] | null;
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

/** One money row — tabular numerals, ink colour (never muted, never amber). */
function MoneyRow({
  label,
  amount,
  strong = false,
}: {
  label: string;
  amount: number | string | null;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={strong ? "text-sm font-semibold text-ink" : "text-sm text-muted"}>
        {label}
      </span>
      <span
        className={
          "tnum text-ink " + (strong ? "text-lg font-bold" : "text-sm font-semibold")
        }
      >
        {formatKes(amount)}
      </span>
    </div>
  );
}

export default async function AdminRedemptionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdminPage();

  const service = createServiceClient();

  // Snapshot (authoritative for the money figures + linkage) and the Guardian
  // recommendation/events run together — the RPC is best-effort so a redemption
  // that predates Guardian still renders its full A3 snapshot.
  const [{ data: r }, { data: guardian }] = await Promise.all([
    service
      .from("redemptions")
      .select(
        "id, otp_code, status, amount_kes, success_fee_charged, fraud_flags, review_required, distance_from_shop, redeemed_at, expires_at, merchant_id, user_id, merchants(merchant_name, floor), deals(title), users(full_name, email, phone)"
      )
      .eq("id", params.id)
      .maybeSingle(),
    service
      .rpc("admin_redemption_detail", { p_redemption_id: params.id })
      .maybeSingle<RedemptionDetail>(),
  ]);
  if (!r) notFound();

  const merchant = r.merchants as unknown as { merchant_name: string; floor: string | null } | null;
  const deal = r.deals as unknown as { title: string } | null;
  const customer = r.users as unknown as {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  const flags = (r.fraud_flags ?? []) as string[];

  const recommendation = guardian?.guardian_recommendation ?? null;
  const checks = (guardian?.guardian_events ?? []).filter((e) => e.check_type !== "overall");
  // Held = soft-blocked by Guardian: no fee has moved and an admin decides.
  const held = r.status === "flagged";

  return (
    <main className="max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/redemptions" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold text-ink">
          <span className="font-code tracking-[0.12em]">{formatCode(r.otp_code)}</span>
          <StatusChip status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
          {recommendation ? <GuardianChip recommendation={recommendation} /> : null}
        </h1>
      </div>

      {held ? (
        // Guardian held this redemption before any fee moved — the admin override.
        <div className="mt-4 rounded-card border border-flame bg-white p-4">
          <p className="text-sm font-bold text-ink">Held for review</p>
          <p className="mt-1 text-sm text-secondary">
            Guardian held this redemption before any fee moved. Release to complete it and charge
            the KES {r.success_fee_charged != null ? Math.round(Number(r.success_fee_charged)) : 30}{" "}
            success fee, or reject to fail it with no fee.
          </p>
          <div className="mt-3">
            <ReleaseActions redemptionId={r.id} />
          </div>
        </div>
      ) : r.review_required ? (
        <InlineAlert variant="warning" title="Under fraud review" className="mt-4">
          Release or reject this redemption from the fraud queue.
        </InlineAlert>
      ) : null}

      {/* Money snapshot — the exact amounts the ticket carried at verification. */}
      <section className="mt-5 rounded-card border border-line bg-white px-4 py-2">
        <MoneyRow label="Shopper paid (YOU PAY)" amount={r.amount_kes} strong />
        <div className="border-t border-line" />
        <MoneyRow label="Maanta success fee" amount={r.success_fee_charged} />
      </section>
      <p className="mt-2 text-xs text-faint">
        The KES {Math.round(Number(r.success_fee_charged))} success fee is debited from the
        merchant wallet at verification. The shopper amount is the deal&apos;s snapshotted
        YOU PAY.
      </p>

      {/* Linkage: deal, merchant, customer. */}
      <h2 className="mt-6 text-base font-bold text-ink">Linked records</h2>
      <div className="mt-2 space-y-2.5">
        <div className="rounded-card border border-line bg-white px-4 py-3">
          <p className="text-xs text-muted">Deal</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">{deal?.title ?? "—"}</p>
        </div>

        <Link
          href={`/admin/merchants/${r.merchant_id}`}
          className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3 hover:bg-cream/50"
        >
          <div className="min-w-0">
            <p className="text-xs text-muted">Merchant</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink">
              {merchant?.merchant_name ?? "Unknown shop"}
              {merchant?.floor ? ` — ${merchant.floor}` : ""}
            </p>
          </div>
          <IconChevronRight className="h-4 w-4 shrink-0 text-faint" />
        </Link>

        <div className="rounded-card border border-line bg-white px-4 py-3">
          <p className="text-xs text-muted">Customer</p>
          <p className="mt-0.5 text-sm font-semibold text-ink">
            {customer?.full_name ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {customer?.email ?? maskPhone(customer?.phone) ?? "No contact on file"}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-faint">{r.user_id.slice(0, 8)}</p>
        </div>
      </div>

      {/* Timestamps + fraud detail. */}
      <h2 className="mt-6 text-base font-bold text-ink">Timeline</h2>
      <div className="mt-2 rounded-card border border-line bg-white px-4 py-2 text-sm">
        <div className="flex items-center justify-between py-2">
          <span className="text-muted">Redeemed</span>
          <span className="text-ink">{friendlyTime(r.redeemed_at)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-line py-2">
          <span className="text-muted">Code expiry</span>
          <span className="text-ink">{friendlyTime(r.expires_at)}</span>
        </div>
        {r.distance_from_shop != null ? (
          <div className="flex items-center justify-between border-t border-line py-2">
            <span className="text-muted">Distance from shop</span>
            <span className="tnum text-ink">{Math.round(Number(r.distance_from_shop))} m</span>
          </div>
        ) : null}
      </div>

      {flags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {flags.map((f) => (
            <FraudChip key={f} reason={f} />
          ))}
        </div>
      ) : null}

      {/* Guardian audit timeline — why Guardian recommended what it did. */}
      <h2 className="mt-6 text-base font-bold text-ink">Guardian checks</h2>
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
