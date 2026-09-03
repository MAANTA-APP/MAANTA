import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { cn } from "@/lib/ui";
import { loadActionQueue } from "@/lib/admin-action-queue-data";
import {
  ACTION_CATEGORY_LABELS,
  countByCategory,
  isActionCategory,
  summariseQueue,
  type ActionCategory,
} from "@/lib/admin-action-queue";
import { ActionItemCard } from "@/components/admin/action-item-card";
import { AdminReadError } from "@/components/admin/read-error";

export const dynamic = "force-dynamic";

/**
 * Action Queue — every operational exception MAANTA can prove from its own
 * state, as a list an admin works top to bottom.
 *
 * A view, not a task manager. Nothing here is created, assigned or ticked
 * off: an item exists while its condition holds and disappears when the
 * record changes. The rules are `lib/admin-action-queue.ts` (pure, tested);
 * the reads are `lib/admin-action-queue-data.ts` (bounded); this page filters
 * and renders. The Home page shows the top of this same list.
 */
export default async function AdminActionQueuePage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  await requireAdminPage();

  const filter: ActionCategory | "all" = isActionCategory(searchParams.category)
    ? searchParams.category
    : "all";

  const { items, demoMode } = await loadActionQueue();
  const now = new Date();
  const counts = countByCategory(items);
  const shown = filter === "all" ? items : items.filter((i) => i.category === filter);
  const unavailable = items.filter((i) => i.unavailable);

  return (
    <main className="max-w-4xl">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Action queue</h1>
        <p className="text-xs text-muted">{summariseQueue(items)} · live now</p>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Everything that needs a human, from the records themselves. Each item
        names what happened, why it needs attention, how long it has stood, and
        opens the record where the action is. Deterministic rules only.
      </p>

      {unavailable.length > 0 ? (
        <div className="mt-4">
          <AdminReadError
            // Reads, not categories: a category carries up to two reads and both
            // can fail together, so an item count is a count of failed reads —
            // the same correction D249 made inside `summariseQueue` (D253).
            what={`${unavailable.length} of the queue's reads`}
            sub="Each failed read shows an alert row below instead of items. Unreadable is not clear — do not treat the rest of the list as the whole list."
          />
        </div>
      ) : null}

      <nav aria-label="Filter by category" className="mt-5 flex flex-wrap gap-2">
        <FilterChip href="/admin/queue" active={filter === "all"}>
          All · {items.length}
        </FilterChip>
        {(Object.keys(ACTION_CATEGORY_LABELS) as ActionCategory[])
          .filter((c) => counts[c] > 0)
          .map((c) => (
            <FilterChip
              key={c}
              href={`/admin/queue?category=${c}`}
              active={filter === c}
            >
              {ACTION_CATEGORY_LABELS[c]} · {counts[c]}
            </FilterChip>
          ))}
      </nav>

      <div className="mt-4 space-y-2">
        {shown.length === 0 ? (
          <p className="rounded-card bg-white px-4 py-8 text-center text-sm text-muted shadow-card">
            {filter === "all"
              ? "Nothing needs a human right now. Every category was read and came back clear."
              : `Nothing in ${ACTION_CATEGORY_LABELS[filter].toLowerCase()} right now.`}
          </p>
        ) : (
          shown.map((item) => <ActionItemCard key={item.id} item={item} now={now} />)
        )}
      </div>

      <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-muted">
        Ordered urgent first, then oldest first. Demo mode is{" "}
        {demoMode.ok ? (demoMode.enabled ? "ON" : "OFF") : "unreadable"}; synthetic
        merchants and deals never appear here. Support tasks and fraud events have
        no page of their own, so they open the surface that carries their action.
        Items are conditions, not tickets — there is nothing to close here; change
        the record and the item goes.
      </p>
    </main>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-xs font-semibold",
        active ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink"
      )}
    >
      {children}
    </Link>
  );
}
