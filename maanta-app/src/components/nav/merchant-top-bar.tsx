import Link from "next/link";
import { formatKes } from "@/lib/ui";

/**
 * 5d Merchant top bar — shop name + wallet balance chip.
 * The balance is ALWAYS ink (M6/L11): money is typography, not colour — a
 * low/empty state is carried by the persistent InlineAlert on redeem/wallet
 * and the word, never by tinting the number red.
 */
export function MerchantTopBar({
  merchantName,
  balance,
}: {
  merchantName: string;
  balance: number;
  /** @deprecated low state is signalled by InlineAlert, not by tinting money */
  lowThreshold?: number;
}) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/95 px-4 py-3 backdrop-blur">
      <span className="truncate text-base font-bold text-ink">{merchantName}</span>
      {/*
        The chip was cream (#FAFAF8) on a white bar — a one-step tonal difference
        that all but disappeared, leaving the balance looking like loose text
        rather than the tappable route to /merchant/wallet that it is. A border
        and a lift do that work without colour, which keeps rule M6/L11 intact:
        the number itself is still plain ink whatever the balance is.
      */}
      <Link
        href="/merchant/wallet"
        className="tnum shrink-0 rounded-full border border-line bg-white px-3.5 py-1.5 text-sm font-bold text-ink shadow-card transition hover:border-ink active:translate-y-px"
      >
        {formatKes(balance)}
      </Link>
    </header>
  );
}
