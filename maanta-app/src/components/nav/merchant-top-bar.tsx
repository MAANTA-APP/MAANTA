import Link from "next/link";
import { formatKes } from "@/lib/ui";

/**
 * 5d Merchant top bar — shop name + wallet balance chip.
 * The balance is ALWAYS ink (M6/L11): money is typography, not colour — a
 * low/empty state is carried by the persistent InlineAlert on redeem/wallet
 * and the word, never by tinting the number red.
 *
 * The balance stays VISIBLE to every merchant user (a cashier needs the
 * arrears context at the till), but it only links into the wallet section for
 * users who can act there — see `canUseMerchantSurface("wallet", …)`.
 */
export function MerchantTopBar({
  merchantName,
  balance,
  canOpenWallet = true,
}: {
  merchantName: string;
  balance: number;
  /** Staff without `can_topup` get the number, not a link into the wallet. */
  canOpenWallet?: boolean;
  /** @deprecated low state is signalled by InlineAlert, not by tinting money */
  lowThreshold?: number;
}) {
  const chipClass =
    "tnum shrink-0 rounded-full bg-cream px-3 py-1 text-sm font-bold text-ink";
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
      <span className="truncate text-base font-bold text-ink">{merchantName}</span>
      {canOpenWallet ? (
        <Link href="/merchant/wallet" className={chipClass}>
          {formatKes(balance)}
        </Link>
      ) : (
        <span className={chipClass}>{formatKes(balance)}</span>
      )}
    </header>
  );
}
