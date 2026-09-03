import { cn } from "@/lib/ui";
import { VISIT_STAGE_META, type VisitStage } from "@/lib/visit-funnel";

/**
 * Icon + word for a funnel stage (frozen rule 4: readable in greyscale). The
 * redeemed chip is the only filled one, because it is the only stage at
 * which money moved — and it is ink, never amber and never celebrated.
 */
export function VisitStageChip({ stage, className }: { stage: VisitStage; className?: string }) {
  const m = VISIT_STAGE_META[stage];
  return (
    <span
      title={m.hint}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        stage === "redeemed"
          ? "bg-ink text-white"
          : stage === "held" || stage === "rejected"
            ? "border border-flame bg-white text-ink"
            : stage === "expired"
              ? "bg-cream-dark text-muted"
              : "border border-ink bg-white text-ink",
        className
      )}
    >
      <span aria-hidden className="text-[10px]">
        {m.icon}
      </span>
      {m.label}
    </span>
  );
}
