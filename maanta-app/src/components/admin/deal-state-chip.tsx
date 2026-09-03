import { cn } from "@/lib/ui";
import { ADMIN_DEAL_STATE_META, type AdminDealState } from "@/lib/admin-deal-state";

/** Icon + word, greyscale-safe. Live is the only filled chip; it is ink, never amber. */
export function DealStateChip({ state, className }: { state: AdminDealState; className?: string }) {
  const m = ADMIN_DEAL_STATE_META[state];
  return (
    <span
      title={m.hint}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        state === "live"
          ? "bg-ink text-white"
          : state === "fully_claimed" || state === "paused" || state === "in_grace"
            ? "border border-ink bg-white text-ink"
            : "bg-cream-dark text-muted",
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
