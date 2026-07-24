import Link from "next/link";
import { formatKes } from "@/lib/ui";
import { IconChevronRight } from "@/components/ui/icons";

/**
 * Persistent wallet affordance for the merchant redeem header. Shows the
 * balance in ink (money is typography, not colour — frozen rule) and a chevron
 * that taps through to the existing wallet page. It is a read-only summary
 * affordance: it introduces NO top-up/withdraw flow of its own — tapping simply
 * navigates to /merchant/wallet, which owns those existing flows.
 */
export function WalletHeader({
  balance,
  href = "/merchant/wallet",
}: {
  balance: number;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`Wallet balance ${formatKes(balance)} — view wallet`}
      className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-2.5 hover:bg-cream/50"
    >
      <span className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          Wallet
        </span>
        <span className="tnum text-base font-bold text-ink">{formatKes(balance)}</span>
      </span>
      <IconChevronRight className="h-4 w-4 text-faint" />
    </Link>
  );
}
