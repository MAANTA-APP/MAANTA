import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { formatCode, formatKesSigned, friendlyTime } from "@/lib/ui";
import {
  formatMerchantLedgerDescription,
  formatMerchantLedgerType,
  showsProviderReference,
} from "@/lib/merchant-ledger-copy";
import { IconArrowLeft } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/** 10v Transaction detail. */
export default async function TransactionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant } = res.ctx;

  const service = createServiceClient();
  const { data: txn } = await service
    .from("merchant_transactions")
    .select("id, amount, transaction_type, description, reference_id, provider_reference, created_at")
    .eq("id", params.id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();
  if (!txn) notFound();

  // Type line, description and reference visibility all come from
  // lib/merchant-ledger-copy — the local map here listed five of the eight
  // ledger types and printed the raw enum for the rest, and the description was
  // rendered verbatim, which is how the opening credit's operator string
  // reached a merchant (D104).
  const description = formatMerchantLedgerDescription(txn);

  // For success fees, look up the redemption's deal + code.
  let deal: string | null = null;
  let code: string | null = null;
  if (txn.transaction_type === "success_fee" && txn.reference_id) {
    const { data: redemption } = await service
      .from("redemptions")
      .select("otp_code, deals(title)")
      .eq("id", txn.reference_id)
      .maybeSingle();
    if (redemption) {
      code = redemption.otp_code;
      deal = (redemption.deals as unknown as { title: string } | null)?.title ?? null;
    }
  }

  return (
    <main className="px-4 pt-5">
      <div className="flex items-center gap-3">
        <Link href="/merchant/wallet" aria-label="Back" className="p-1">
          <IconArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="flex-1 text-center text-lg font-bold text-ink">Transaction</h1>
        <span className="w-7" />
      </div>

      <p className="mt-8 text-center text-4xl font-bold text-ink">
        {formatKesSigned(Number(txn.amount))}
      </p>
      <p className="mt-1 text-center text-sm text-muted">
        {formatMerchantLedgerType(txn.transaction_type)} · {friendlyTime(txn.created_at)}
      </p>

      <div className="mt-8 space-y-3">
        {deal ? (
          <div className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
            <span className="text-xs text-muted">Deal</span>
            <span className="text-sm font-semibold text-ink">{deal}</span>
          </div>
        ) : null}
        {code ? (
          <div className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
            <span className="text-xs text-muted">Code</span>
            <span className="font-code text-sm font-bold text-ink">{formatCode(code)}</span>
          </div>
        ) : null}
        {txn.provider_reference && showsProviderReference(txn) ? (
          <div className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
            <span className="text-xs text-muted">Reference</span>
            <span className="font-code text-sm text-ink">{txn.provider_reference}</span>
          </div>
        ) : null}
        {description ? (
          <div className="flex items-center justify-between gap-4 rounded-card border border-line bg-white px-4 py-3.5">
            <span className="text-xs text-muted">Description</span>
            <span className="text-right text-sm text-ink">{description}</span>
          </div>
        ) : null}
      </div>

      {txn.transaction_type === "success_fee" ? (
        <p className="mt-4 text-xs text-faint">
          No fee is charged for rejected redemptions.
        </p>
      ) : null}
    </main>
  );
}
