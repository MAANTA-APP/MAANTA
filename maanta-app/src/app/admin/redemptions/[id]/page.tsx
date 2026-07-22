import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { StatusChip, FraudChip } from "@/components/ui/chips";
import { InlineAlert } from "@/components/ui/inline-alert";
import { IconArrowLeft, IconChevronRight } from "@/components/ui/icons";
import { formatKes, formatCode, friendlyTime, maskPhone } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * A3 — Admin redemption detail (`/admin/redemptions/[id]`).
 *
 * Read-only single-ticket view. Fetches the snapshot the money path already
 * wrote (amount_kes = YOU PAY, success_fee_charged = KES 30) via the service
 * client — no ad-hoc money maths, no writes. Fraud release/reject stays at the
 * fraud-event grain on the list page; this surfaces the record and its links.
 */

const STATUS_LABEL: Record<string, string> = {
  success: "Verified",
  pending: "Pending",
  failed: "Rejected",
  flagged: "Flagged",
};

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
  const { data: r } = await service
    .from("redemptions")
    .select(
      "id, otp_code, status, amount_kes, success_fee_charged, fraud_flags, review_required, distance_from_shop, redeemed_at, expires_at, merchant_id, user_id, merchants(merchant_name, floor), deals(title), users(full_name, email, phone)"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!r) notFound();

  const merchant = r.merchants as unknown as { merchant_name: string; floor: string | null } | null;
  const deal = r.deals as unknown as { title: string } | null;
  const customer = r.users as unknown as {
    full_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  const flags = (r.fraud_flags ?? []) as string[];

  return (
    <main className="max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/redemptions" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-ink">
          <span className="font-code tracking-[0.12em]">{formatCode(r.otp_code)}</span>
          <StatusChip status={r.status} label={STATUS_LABEL[r.status] ?? r.status} />
        </h1>
      </div>

      {r.review_required || r.status === "flagged" ? (
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
    </main>
  );
}
