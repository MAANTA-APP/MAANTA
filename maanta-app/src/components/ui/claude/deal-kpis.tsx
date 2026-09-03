import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/ui";

/**
 * The facts a shopper weighs before claiming, on one line.
 *
 * Founder request 2026-08-22: a deal card was too thin to decide from — it
 * showed a price and a verified count, so "is this worth walking to?" needed a
 * tap. These are the three things that answer it without one, in decision
 * order: how much better than usual, how likely it is to still be there, and
 * whether anyone has actually redeemed at this shop.
 *
 * Honesty rules, because a KPI is a claim:
 *  - **Nothing is invented.** Each fact renders only when its input exists —
 *    no discount without a compare-at price, no scarcity without a claim cap.
 *    A deal with none of them renders nothing at all rather than a padded row.
 *  - **Discount is arithmetic on the same `lib/pricing` figures the card shows**,
 *    so it can never disagree with YOU PAY.
 *  - **Scarcity counts down, not up.** `left` is what decides a walk; `claimed`
 *    is what the merchant cares about. Deal detail keeps the claimed framing.
 *  - Greyscale-safe: every fact is ink or muted text plus, for verified, the
 *    same check icon the rest of the app uses. No colour carries meaning, and
 *    no money figure is coloured (frozen rule 3).
 */
export function DealKpis({
  pay,
  was,
  claimsReserved,
  maxClaims,
  verifiedCount,
  className,
}: {
  pay?: number | null;
  was?: number | null;
  claimsReserved?: number | null;
  maxClaims?: number | null;
  verifiedCount?: number | null;
  className?: string;
}) {
  const facts: React.ReactNode[] = [];

  // Discount — only when a genuine compare-at price sits above what you pay.
  if (pay != null && was != null && was > pay) {
    const pct = Math.round(((was - pay) / was) * 100);
    if (pct > 0) facts.push(<span key="off">{pct}% off</span>);
  }

  // Scarcity — only when the merchant actually capped the deal.
  //
  // D236: `claimsReserved` is claims HANDED OUT, not redemptions. Fed from
  // `deals.claims_count` until 2026-09-03, this line told a shopper "9 left"
  // on a deal whose ten codes were all already issued — the counter only moved
  // when someone redeemed. `left` is now the number of codes the database will
  // actually still hand out, so the card and `claim_deal` agree.
  if (maxClaims != null && claimsReserved != null) {
    const left = Math.max(maxClaims - claimsReserved, 0);
    facts.push(
      <span key="left" className="tnum">
        {left > 0 ? `${left} left` : "Fully claimed"}
      </span>
    );
  }

  // Social proof — and it is the SHOP's, not this deal's.
  //
  // `verifiedCount` is fed from `getVerifiedCounts`, which is
  // `verified_counts_by_merchant`: a merchant's all-time successful redemptions
  // across every deal they have ever run. That is the right input to rail 3's
  // order (`lockedStandardOrder`, D1), where it is explicitly a MERCHANT
  // ranking. Rendered as a bare "12 verified" beside a deal title it read as
  // this deal's count, which is a materially different and much smaller number
  // — drift D227 (PR #317), renumbered D229 on integration.
  //
  // Founder ruling R4 (2026-09-02) settles the labels: a merchant all-time
  // total must never be presented as a deal-level count, and deal-level counts
  // are not shown at all until a correct deal-level aggregation backs them.
  // So the scope goes in the string. The number did not change; what it claims
  // did.
  if (verifiedCount != null) {
    facts.push(
      <span key="verified" className="inline-flex items-center gap-1">
        <IconCheck className="h-3 w-3 text-verified" aria-hidden="true" />
        <span className="tnum">{verifiedCount} verified at this shop</span>
      </span>
    );
  }

  if (facts.length === 0) return null;

  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted", className)}>
      {facts.map((f, i) => (
        <span key={i} className="inline-flex items-center gap-2">
          {i > 0 ? (
            <span aria-hidden="true" className="text-line">
              ·
            </span>
          ) : null}
          {f}
        </span>
      ))}
    </p>
  );
}
