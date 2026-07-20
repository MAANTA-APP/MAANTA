import { formatKes } from "@/lib/ui";

/**
 * WalletBalance (registry §3) — M6. The balance is the top of the wallet
 * hierarchy and is ALWAYS --text-money ink: money is typography, not colour.
 * A low/empty/arrears state is carried by the word and the InlineAlert beneath
 * it, never by tinting this number red or rust (L11 / §9).
 */
export function WalletBalance({ balance }: { balance: number }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Wallet balance
      </div>
      <div className="tnum text-4xl font-bold text-ink">{formatKes(balance)}</div>
    </div>
  );
}
