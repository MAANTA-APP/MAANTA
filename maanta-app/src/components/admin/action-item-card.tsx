import Link from "next/link";
import { cn, relativeAgo } from "@/lib/ui";
import { IconAlert, IconChevronRight } from "@/components/ui/icons";
import { ACTION_CATEGORY_LABELS, type ActionItem } from "@/lib/admin-action-queue";

/**
 * One Action Queue item, rendered the same way on Home and on the queue.
 *
 * The whole card is the link, so the admin lands on the record with the
 * action — not on a list. Severity is carried by an icon and a word beside
 * the category, never by colour alone (frozen rule 4); the urgent border is
 * an addition, not the signal. A read-failure item renders as an alert, with
 * the same shape, so an unreadable category cannot look like a quiet one.
 */
export function ActionItemCard({ item, now }: { item: ActionItem; now?: Date }) {
  const meta = (
    <p className="mt-1 text-[11px] text-muted">
      <span className="font-semibold uppercase tracking-wide">
        {ACTION_CATEGORY_LABELS[item.category]}
      </span>
      {item.since ? ` · since ${relativeAgo(item.since, now)}` : null}
      {item.action ? ` · ${item.action}` : null}
    </p>
  );

  if (item.unavailable) {
    return (
      <div
        role="alert"
        className="flex items-start gap-3 rounded-card border border-flame bg-white px-4 py-3.5 shadow-card"
      >
        <IconAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-flame" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink">{item.title}</p>
          <p className="mt-0.5 text-xs text-muted">{item.reason}</p>
          {meta}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-start gap-3 rounded-card border bg-white px-4 py-3.5 shadow-card hover:bg-stone-soft",
        item.severity === "urgent" ? "border-flame/50" : "border-line"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold",
          item.severity === "urgent" ? "border-flame text-flame" : "border-ink text-ink"
        )}
      >
        {item.severity === "urgent" ? "!" : "·"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">
          {item.title}
          <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {item.severity === "urgent" ? "Urgent" : "Attention"}
          </span>
        </p>
        <p className="mt-0.5 text-xs text-muted">{item.reason}</p>
        {meta}
      </div>
      <IconChevronRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-faint" />
    </Link>
  );
}
