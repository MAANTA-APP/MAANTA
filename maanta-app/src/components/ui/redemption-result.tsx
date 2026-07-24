import { IconCheck } from "@/components/ui/icons";
import { ReferenceId } from "@/components/ui/reference-id";
import { formatKes } from "@/lib/ui";

/**
 * RedemptionResult (registry §3) — M4 success takeover. A flat solid
 * --status-success-solid fill (a dark green), white check, money in white
 * (ink-on-dark), a copyable ReferenceId for the movement, and a plain fade —
 * no confetti, no bounce, no shadow (L9). Money moved; it is not a party.
 */
export function RedemptionResult({
  feeAmount,
  newBalance,
  feeChargeStatus = "charged",
  collectAmount = null,
  referenceId,
  disputed,
  countdown,
}: {
  feeAmount: number;
  newBalance: number | null;
  /**
   * Verify-anyway (G1): when the wallet couldn't cover the fee it is recorded
   * as arrears rather than charged — the redemption still succeeded. "unknown"
   * (rare RPC edge) is treated as charged for display.
   */
  feeChargeStatus?: "charged" | "owed" | "unknown";
  /**
   * The shopper's YOU PAY amount, snapshotted at claim, for the merchant to
   * collect in person. This is NOT an in-app charge and is wholly distinct from
   * the KES 30 success fee below — the shopper pays the merchant directly.
   * Null (legacy rows without a snapshot) omits the line entirely.
   */
  collectAmount?: number | null;
  referenceId: string;
  disputed: boolean;
  countdown: number;
}) {
  const owed = feeChargeStatus === "owed";
  const showCollect =
    typeof collectAmount === "number" && Number.isFinite(collectAmount) && collectAmount > 0;
  return (
    <main className="flex min-h-[70dvh] animate-fade-in flex-col items-center justify-center bg-verified px-6 py-20 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border-[1.5px] border-white/50">
        <IconCheck className="h-8 w-8 text-white" />
      </span>
      <h1 className="mt-5 text-3xl font-bold text-white">Verified</h1>

      {/* Counter action — how much cash to take from the shopper. The primary
          money line on this surface (the merchant's next step), kept visually
          separate from the platform's KES 30 success fee so the two are never
          conflated. White on the dark success fill (money is never coloured,
          Rule 3). Omitted when no snapshot exists. */}
      {showCollect ? (
        <div className="mt-4 rounded-card border border-white/30 px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-white/70">
            Collect from shopper
          </p>
          <p className="tnum mt-0.5 text-2xl font-bold text-white">
            {formatKes(collectAmount)}
          </p>
        </div>
      ) : null}

      {owed ? (
        <>
          <p className="tnum mt-2 text-sm text-white/80">
            {formatKes(feeAmount)} success fee recorded as arrears
          </p>
          <p className="mt-1 text-sm text-white/80">
            Settled from your next top-up.
          </p>
        </>
      ) : (
        <>
          <p className="tnum mt-2 text-sm text-white/80">
            {formatKes(feeAmount)} success fee charged
          </p>
          {newBalance != null ? (
            <p className="tnum mt-1 text-base font-semibold text-white">
              Wallet balance {formatKes(newBalance)}
            </p>
          ) : null}
        </>
      )}

      <ReferenceId value={referenceId} tone="inverse" className="mt-5" />

      {disputed ? (
        <div className="mt-4 max-w-xs rounded-card border border-white/40 px-4 py-2 text-xs text-white/90">
          Flagged and sent to MAANTA for review — nothing needed from you.
        </div>
      ) : null}

      <p className="mt-6 text-xs text-white/70">Resetting in {countdown}…</p>
    </main>
  );
}
