import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminPage } from "@/lib/admin";
import { StatusChip } from "@/components/ui/chips";
import { InlineAlert } from "@/components/ui/inline-alert";
import { formatCode, formatKes, formatKesSigned, friendlyTime } from "@/lib/ui";
import { ReverseFeeAction } from "./reverse-fee-action";

export const dynamic = "force-dynamic";

const TX_LABEL: Record<string, string> = {
  success_fee: "Success fee charged",
  success_fee_arrears: "Success fee (arrears)",
  fee_reversal: "Fee reversal credit",
  arrears_settlement: "Arrears settled",
};

/**
 * Admin redemption detail — enough to decide a fee reversal (code, amount, fee,
 * merchant, timestamps) and the single action to apply it. Resolves the
 * TODO(admin-redemption-detail) left on the redemptions list.
 *
 * Money discipline: every shilling value is ink + tabular (tnum), never
 * coloured. One amber primary action only (the reverse-fee button); it is
 * hidden once a reversal already exists.
 */
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
      "id, otp_code, status, success_fee_charged, redeemed_at, expires_at, review_required, fraud_flags, merchant_id, deal_id, merchants(merchant_name, account_balance, outstanding_arrears), deals(title)"
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!r) notFound();

  const merchant = r.merchants as unknown as {
    merchant_name: string;
    account_balance: number;
    outstanding_arrears: number;
  } | null;
  const deal = r.deals as unknown as { title: string } | null;

  const [{ data: ledger }, { data: reversal }] = await Promise.all([
    service
      .from("merchant_transactions")
      .select("id, amount, transaction_type, description, created_at")
      .eq("reference_id", r.id)
      .order("created_at", { ascending: true }),
    service
      .from("fee_reversals")
      .select("id, amount, created_at, incident_ref, note, users(full_name)")
      .eq("redemption_id", r.id)
      .maybeSingle(),
  ]);

  const approver = reversal
    ? ((reversal.users as unknown as { full_name: string | null } | null)
        ?.full_name ?? null)
    : null;

  const isSuccess = r.status === "success";
  const feeRows = (ledger ?? []).filter((t) =>
    ["success_fee", "success_fee_arrears"].includes(t.transaction_type)
  );
  const canReverse = isSuccess && feeRows.length > 0 && !reversal;

  return (
    <main className="max-w-2xl">
      <Link
        href="/admin/redemptions"
        className="text-xs font-semibold text-muted hover:text-ink"
      >
        ← Redemptions
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold text-ink">
          {formatCode(r.otp_code)}
        </h1>
        <StatusChip status={r.status} />
        {r.review_required ? (
          <StatusChip status="flagged" label="Review" />
        ) : null}
      </div>

      {/* Decision facts */}
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 rounded-card border border-line bg-white p-5">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Merchant
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">
            {merchant?.merchant_name ?? "Unknown shop"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Deal
          </dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">
            {deal?.title ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Success fee
          </dt>
          <dd className="tnum mt-0.5 text-sm font-bold text-ink">
            {formatKes(r.success_fee_charged)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Merchant wallet
          </dt>
          <dd className="tnum mt-0.5 text-sm font-bold text-ink">
            {merchant ? formatKes(merchant.account_balance) : "—"}
            {merchant && merchant.outstanding_arrears > 0 ? (
              <span className="ml-1 text-xs font-medium text-muted">
                · arrears {formatKes(merchant.outstanding_arrears)}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Redeemed
          </dt>
          <dd className="mt-0.5 text-sm text-ink">
            {r.redeemed_at ? friendlyTime(r.redeemed_at) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Expires
          </dt>
          <dd className="mt-0.5 text-sm text-ink">
            {r.expires_at ? friendlyTime(r.expires_at) : "—"}
          </dd>
        </div>
      </dl>

      {/* Fee ledger for this redemption */}
      <h2 className="mt-6 text-base font-bold text-ink">Fee ledger</h2>
      <div className="mt-2 rounded-card border border-line bg-white">
        {(ledger ?? []).length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            No fee ledger rows linked to this redemption.
          </p>
        ) : (
          (ledger ?? []).map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between border-b border-line px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">
                  {TX_LABEL[t.transaction_type] ?? t.transaction_type}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {t.description ?? ""} · {friendlyTime(t.created_at)}
                </p>
              </div>
              <span className="tnum ml-3 shrink-0 text-sm font-bold text-ink">
                {formatKesSigned(t.amount)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Reversal state / action */}
      {reversal ? (
        <InlineAlert title="Fee already reversed." className="mt-6">
          {formatKes(reversal.amount)} was credited to the merchant wallet
          {approver ? ` by ${approver}` : ""} on{" "}
          {friendlyTime(reversal.created_at)}
          {reversal.incident_ref ? ` · incident #${reversal.incident_ref}` : ""}.
          {reversal.note ? ` ${reversal.note}` : ""}
        </InlineAlert>
      ) : canReverse ? (
        <ReverseFeeAction
          redemptionId={r.id}
          merchantName={merchant?.merchant_name ?? "the merchant"}
          fee={Number(r.success_fee_charged)}
        />
      ) : (
        <p className="mt-6 text-sm text-muted">
          {isSuccess
            ? "No reversible success fee is linked to this redemption."
            : "Only a verified (success) redemption can have its fee reversed."}
        </p>
      )}
    </main>
  );
}
