import { formatKes } from "@/lib/ui";
import type { LedgerFeeTotals } from "@/lib/evidence-scope";

/**
 * The three fee labels, written once.
 *
 * D211's defect was a KPI called "Success fees" that measured gross linked fee
 * entries and said so nowhere, so a reader took a reversed fee as revenue. The
 * fix is only real if the words match the arithmetic, and words repeated at
 * four call sites are four chances for them to stop matching. Every surface
 * that prints one of these figures takes its label from here, so a label and
 * its number cannot be separated by an edit to one page.
 *
 * "Net" is the headline everywhere: it is the figure a reader should act on.
 * Gross and reversals stay visible beside it rather than being folded away,
 * because silently subtracting rows behind a single number destroys the audit
 * trail — which is the alternative the D211 ruling explicitly rejected.
 */
export const FEE_FIGURE_LABELS = {
  gross: "Gross success fees",
  reversals: "Fee reversals",
  net: "Net success fees",
} as const;

/** One figure, or an em dash when the read did not establish it. */
export function feeFigure(value: number | null): string {
  return value === null ? "—" : formatKes(value);
}

/**
 * A table cell: net on top, its two components beneath.
 *
 * Net leads because it is the answer; gross and reversals follow because a net
 * figure with no visible components is the same opaque number D211 opened
 * against. The sub-line is muted, never coloured — money carries no state
 * colour on any MAANTA surface.
 */
export function FeeBreakdownCell({ totals }: { totals: LedgerFeeTotals }) {
  return (
    <>
      <span className="tabular-nums">{feeFigure(totals.netKes)}</span>
      <span className="mt-0.5 block text-[11px] tabular-nums text-muted">
        {FEE_FIGURE_LABELS.gross.toLowerCase()} {feeFigure(totals.grossKes)} ·{" "}
        {FEE_FIGURE_LABELS.reversals.toLowerCase()} {feeFigure(totals.reversalsKes)}
      </span>
    </>
  );
}
