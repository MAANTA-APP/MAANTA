import { cn, formatKes } from "@/lib/ui";
import { InlineAlert } from "@/components/ui/inline-alert";

/**
 * FeeDisclosure (registry §3) — L10: the exact fee, shown BEFORE it is charged,
 * in the same view as the Confirm action that triggers the charge. Money-safe:
 * ink text, tabular figures, no shadow, no colour-coding of the amount.
 *
 * MAANTA's success fee is a flat KES amount (frozen), so there is no percentage
 * line — the exact shilling amount and the resulting wallet balance are shown.
 */
export function FeeDisclosure({
  fee,
  balance,
  className,
}: {
  fee: number;
  balance: number;
  className?: string;
}) {
  const balanceAfter = balance - fee;
  const insufficient = balanceAfter < 0;

  return (
    <div
      className={cn("rounded-card border border-line bg-white p-4", className)}
    >
      <div className="text-sm font-bold text-ink">
        This redemption costs {formatKes(fee)}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-secondary">MAANTA success fee</span>
          <span className="tnum font-semibold text-ink">−{formatKes(fee)}</span>
        </div>
        <div className="flex items-baseline justify-between border-t border-line pt-2 text-sm">
          <span className="text-secondary">Wallet balance after</span>
          <span className="tnum font-bold text-ink">
            {insufficient ? formatKes(balance) : formatKes(balanceAfter)}
          </span>
        </div>
      </div>
      {insufficient ? (
        <InlineAlert variant="error" title="Balance too low." className="mt-3">
          Top up at least {formatKes(fee - balance)} to confirm this redemption.
        </InlineAlert>
      ) : null}
    </div>
  );
}
