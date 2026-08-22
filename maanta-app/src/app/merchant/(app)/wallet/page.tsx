import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { getSuccessFee } from "@/lib/data";
import { ButtonLink } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { WalletBalance } from "@/components/ui/wallet-balance";
import { ReferenceId } from "@/components/ui/reference-id";
import {
  formatMerchantLedgerLabel,
  formatOpeningCreditNotice,
  hasUnspentOpeningCredit,
  openingCreditAmount,
} from "@/lib/merchant-ledger-copy";
import { cn, formatKes, formatKesSigned, friendlyTime } from "@/lib/ui";

export const dynamic = "force-dynamic";

const FILTERS = [
  { value: "all", label: "All", types: null },
  { value: "topups", label: "Top-ups", types: ["topup", "refund"] },
  { value: "fees", label: "Fees", types: ["success_fee", "success_fee_arrears"] },
  { value: "boosts", label: "Boosts", types: ["boost_fee", "subscription"] },
] as const;

type Row = {
  id: string;
  amount: number | string;
  transaction_type: string;
  description: string | null;
  reference_id: string | null;
  /** Selected for label purposes only — it is how the opening credit is
      recognised (D104), never rendered on this screen. */
  provider_reference: string | null;
  created_at: string;
};

/** M6 wallet — balance (always ink) → alert → Top up (one amber) → self-explaining ledger. */
export default async function WalletPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const res = await getMerchantContext();
  if (res.status !== "ok") return null;
  const { merchant, permissions } = res.ctx;
  const fee = await getSuccessFee();
  const balance = merchant.account_balance;
  const arrears = merchant.outstanding_arrears;
  const canTopup = permissions.can_topup;

  const filter = FILTERS.find((f) => f.value === searchParams.filter) ?? FILTERS[0];

  // Fetch the FULL ordered ledger so each row's running balance-after is exact
  // regardless of the display filter — and so the top row proves the ledger
  // sums to the current balance.
  const service = createServiceClient();
  const { data: allRows } = await service
    .from("merchant_transactions")
    .select(
      "id, amount, transaction_type, description, reference_id, provider_reference, created_at"
    )
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false })
    .limit(200);

  let running = balance;
  const withBalance = ((allRows ?? []) as Row[]).map((r) => {
    const balanceAfter = running;
    running = running - Number(r.amount);
    return { ...r, balanceAfter };
  });
  const filterTypes = filter.types as readonly string[] | null;
  const rows = filterTypes
    ? withBalance.filter((r) => filterTypes.includes(r.transaction_type))
    : withBalance;

  const weekStart = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
  const weekFees = withBalance.filter(
    (r) => r.transaction_type === "success_fee" && r.created_at >= weekStart
  );
  const weekTotal = weekFees.reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  const remaining = fee > 0 ? Math.floor(balance / fee) : 0;
  const low = arrears <= 0 && balance > 0 && balance <= fee * 3;

  // New-merchant opening credit (D105). The count comes from the granted amount
  // over the app_config success fee, never a literal — see merchant-ledger-copy.
  const credit = hasUnspentOpeningCredit(withBalance)
    ? openingCreditAmount(withBalance)
    : null;
  const openingCredit =
    credit === null ? null : formatOpeningCreditNotice(credit, fee, formatKes);

  // Row titles come from lib/merchant-ledger-copy so this screen and the detail
  // screen speak one vocabulary, and so the stored description is not trusted
  // blindly — the opening credit's is written for operators (D104).
  const rateContext = (t: string) =>
    t === "success_fee" || t === "success_fee_arrears"
      ? `MAANTA success fee · flat ${formatKes(fee)}`
      : null;

  return (
    <main className="mx-auto max-w-xl px-4 pt-5">
      <h1 className="text-2xl font-bold text-ink">Wallet</h1>

      {/* Balance — always --text-money ink, top of the hierarchy. */}
      <div className="mt-4">
        <WalletBalance balance={balance} />
      </div>

      {/* State — persistent InlineAlert, never a toast. Verify-anyway (G1):
          wallet state never pauses redemption; it only gates new-deal creation.
          Money states are rust, never red (no red screaming). */}
      {arrears > 0 ? (
        <InlineAlert variant="warning" title={`You owe ${formatKes(arrears)} in arrears.`} className="mt-4">
          It clears automatically from your next top-up. Redemptions keep working —
          only creating new deals is paused until your balance is positive.
        </InlineAlert>
      ) : balance <= 0 ? (
        <InlineAlert variant="warning" title="Your wallet is empty." className="mt-4">
          Redemptions still work — each fee is recorded as arrears until you top up.
          You can&apos;t create new deals while your balance is empty.
        </InlineAlert>
      ) : low ? (
        <InlineAlert variant="warning" title="Low balance." className="mt-4">
          Enough for about {remaining} more redemption{remaining === 1 ? "" : "s"}. Top up
          to avoid interruption.
        </InlineAlert>
      ) : openingCredit ? (
        /* Last in the chain so a merchant never sees two states at once, and so a
           real warning always wins. Neutral, not rust: the credit is good news and
           needs no action. */
        <InlineAlert variant="info" className="mt-4">
          {openingCredit}
        </InlineAlert>
      ) : null}

      {/* The one amber action — owners always; staff only with can_topup. */}
      {canTopup ? (
        <div className="mt-4">
          <ButtonLink href="/merchant/topup" full>
            Top up wallet
          </ButtonLink>
        </div>
      ) : (
        <p className="mt-4 text-center text-xs text-muted">
          Ask the shop owner if you need to top up the wallet.
        </p>
      )}

      <div className="mt-6 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/merchant/wallet${f.value === "all" ? "" : `?filter=${f.value}`}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold",
              filter.value === f.value ? "bg-ink text-white" : "bg-cream text-muted"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* Self-explaining ledger: what · what rate · amount · reference · balance after. */}
      <div className="mt-4 space-y-2.5">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No transactions yet</p>
        ) : (
          rows.map((t) => {
            const rate = rateContext(t.transaction_type);
            return (
              <div key={t.id} className="rounded-card bg-white shadow-card p-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold text-ink">
                    {formatMerchantLedgerLabel(t)}
                  </span>
                  <span className="tnum text-sm font-bold text-ink">
                    {formatKesSigned(Number(t.amount))}
                  </span>
                </div>
                {rate ? <p className="mt-0.5 text-xs text-secondary">{rate}</p> : null}
                <p className="mt-0.5 text-xs text-muted">{friendlyTime(t.created_at)}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  {/* Prefer reference_id: on fee rows it is the redemption id, so
                      this matches the ReferenceId on the redeem success takeover.
                      Legacy rows (reference_id NULL) fall back to the txn id. */}
                  {(() => {
                    const ref = t.reference_id ?? t.id;
                    return (
                      <ReferenceId
                        value={ref}
                        display={ref.slice(0, 8).toUpperCase()}
                        label="Ref"
                      />
                    );
                  })()}
                  <span className="tnum text-xs text-secondary">
                    Bal {formatKes(t.balanceAfter)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {weekFees.length > 0 ? (
        <p className="tnum mt-4 text-center text-xs text-faint">
          This week: {weekFees.length} success fees · {formatKes(weekTotal)}
        </p>
      ) : null}
    </main>
  );
}
