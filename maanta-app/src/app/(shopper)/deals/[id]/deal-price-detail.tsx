"use client";

import { extrasLine, chargeAmount } from "@/lib/pricing";
import { isDealClaimable } from "@/lib/deal-expiry";
import { useShopperClock } from "@/lib/use-shopper-clock";

type Charge = { label: string; [k: string]: unknown };

/**
 * The YOU PAY figure and the itemised breakdown on `/deals/[id]` (D213
 * criterion 3).
 *
 * Direction A puts the figure in the anchored decision bar on a CLAIMABLE deal,
 * so this headline deliberately renders only when the deal cannot be claimed —
 * there is no bar then, and the shopper still has to see what it costs.
 *
 * That made the price disappear entirely once `ClaimGate` withdrew the bar on
 * an open page: the bar was gone and this block was still gated on the
 * SERVER's `claimable`, so an aged render showed no price at all while a fresh
 * render of the very same expired deal showed one. Two renders of one state
 * disagreeing is the same contradiction criterion 3 forbids between two
 * elements.
 *
 * So the headline is decided on the shared clock, exactly as the bar is, and
 * the two hand off: the bar leaves and the figure appears in the same tick.
 *
 * Only the TIME half is re-derived. `serverClaimable` still carries the
 * preconditions a client cannot know — an existing ticket, `is_active`,
 * `is_paused`, the claim cap — and a deal unclaimable for any of those reasons
 * shows its price immediately, as it always did.
 */
export function DealPriceDetail({
  pay,
  was,
  extras,
  charges,
  priceKes,
  serverClaimable,
  expiresAt,
}: {
  pay: number;
  was: number | null;
  extras: number;
  charges: Charge[];
  priceKes: number | null;
  serverClaimable: boolean;
  expiresAt: string | null;
}) {
  const now = useShopperClock();
  const claimable = serverClaimable && isDealClaimable(expiresAt, now);
  const showBreakdown = extras > 0 && priceKes != null;

  // Nothing to say: the bar carries the figure and there is no breakdown.
  if (claimable && !showBreakdown) return null;

  return (
    <div className="mt-5">
      {/* The itemised breakdown is detail-only either way (frozen rule 7). */}
      {!claimable ? (
        <>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            You pay
          </div>
          <div className="tnum text-2xl font-bold text-ink">
            KES {pay.toLocaleString("en-KE")}
          </div>
          {extras > 0 ? (
            <div className="tnum mt-0.5 text-sm text-secondary">{extrasLine(extras)}</div>
          ) : null}
          {was != null ? (
            <div className="tnum text-sm text-secondary line-through">
              Was KES {was.toLocaleString("en-KE")}
            </div>
          ) : null}
        </>
      ) : null}

      {showBreakdown ? (
        <div className="mt-3 flex flex-col gap-2 rounded-card bg-white shadow-card p-3.5">
          <div className="flex justify-between text-sm">
            <span className="text-secondary">Deal price</span>
            <span className="tnum font-medium">
              KES {Math.round(priceKes!).toLocaleString("en-KE")}
            </span>
          </div>
          {charges.map((c, i) => (
            <div key={i} className="flex justify-between text-sm">
              <span className="text-secondary">{c.label}</span>
              <span className="tnum font-medium">
                KES {chargeAmount(c as never, priceKes!).toLocaleString("en-KE")}
              </span>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t border-line pt-2">
            <span className="text-sm font-bold">Total you pay</span>
            <span className="tnum text-lg font-bold">
              KES {pay.toLocaleString("en-KE")}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
