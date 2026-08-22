import { cn, formatKes } from "@/lib/ui";
import { InlineAlert } from "@/components/ui/inline-alert";

/**
 * FeeDisclosure (registry §3) — L10: the exact fee, shown BEFORE it is charged,
 * in the same view as the Confirm action that triggers the charge. Money-safe:
 * ink text, tabular figures, no shadow, no colour-coding of the amount.
 *
 * MAANTA's success fee is a flat KES amount (frozen), so there is no percentage
 * line — the exact shilling amount and the resulting wallet balance are shown.
 *
 * Verify-anyway (frozen rule, G1): an underfunded wallet NEVER blocks the
 * redemption. When the balance can't cover the fee, deduct_success_fee_or_
 * record_arrears leaves the balance untouched and records the full fee as
 * arrears (settled at the next top-up). This component discloses that outcome
 * instead of demanding a top-up first.
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
  const toArrears = balanceAfter < 0;

  return (
    <div
      className={cn("rounded-card bg-white shadow-card p-4", className)}
    >
      <div className="text-sm font-bold text-ink">
        This redemption costs {formatKes(fee)}
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-secondary">MAANTA success fee</span>
          <span className="tnum font-semibold text-ink">−{formatKes(fee)}</span>
        </div>
        {toArrears ? (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-secondary">Recorded as arrears</span>
            <span className="tnum font-semibold text-ink">+{formatKes(fee)}</span>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between border-t border-line pt-2 text-sm">
          <span className="text-secondary">Wallet balance after</span>
          <span className="tnum font-bold text-ink">
            {toArrears ? formatKes(balance) : formatKes(balanceAfter)}
          </span>
        </div>
      </div>
      {toArrears ? (
        <InlineAlert variant="warning" title="Fee goes to arrears." className="mt-3">
          Your balance can&apos;t cover the fee, so the full {formatKes(fee)} is
          recorded as arrears and settled from your next top-up. The redemption
          still completes now.
        </InlineAlert>
      ) : null}
    </div>
  );
}
