import Link from "next/link";
import { cn, formatKes } from "@/lib/ui";

/**
 * 5d Merchant top bar — shop name + wallet balance chip.
 * Balance chip goes red-tinted when the wallet is low (10l).
 */
export function MerchantTopBar({
  merchantName,
  balance,
  lowThreshold = 90,
}: {
  merchantName: string;
  balance: number;
  lowThreshold?: number;
}) {
  const low = balance <= lowThreshold;
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
      <span className="truncate text-base font-bold text-ink">{merchantName}</span>
      <Link
        href="/merchant/wallet"
        className={cn(
          "shrink-0 rounded-full px-3 py-1 text-sm font-bold",
          low ? "bg-flame text-white" : "bg-cream text-ink"
        )}
      >
        {formatKes(balance)}
      </Link>
    </header>
  );
}
