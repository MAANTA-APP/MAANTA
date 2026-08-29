"use client";

import { EmptyState } from "@/components/ui/states";
import { NotificationRow } from "@/components/ui/cards";
import { isUnexpiredAt } from "@/lib/live-deals";
import { useShopperClock } from "@/lib/use-shopper-clock";

export type NotificationItem = {
  title: string;
  body: string;
  at: string;
  unread: boolean;
  /** When the row starts being true. Absent means "already". */
  visibleFrom?: string | null;
  /** When the row stops being true. Absent means "never". */
  expiresAt?: string | null;
};

/**
 * The `/notifications` list, with time-derived rows withdrawn on the shared
 * clock (D213 criterion 3).
 *
 * Most rows here are records of a **past event** — "New deal from a saved shop"
 * — which stay true however long the page is open, and this was originally
 * excluded from the discovery audit for exactly that reason. That reasoning was
 * right about those rows and wrong about the page: the code reminder is built
 * from `expires_at > now` and then discarded its own timestamp, so "Your
 * claimed code expires soon" persisted after the code had expired, indefinitely
 * and on the surface whose whole job is telling a shopper their code still has
 * time. An inbox row that stays false is worse than a stale card, because a
 * shopper acts on it by walking to a shop.
 *
 * An item therefore carries the edges of its own truth — `visibleFrom` and
 * `expiresAt` — and the list applies both. Note the second miss this closes:
 * the saved-shop alert IS a timeless event, but the query that produces it is
 * scoped to 24 hours, so an open page must drop it at the same boundary a
 * fresh render would or the two disagree. The row's own truth and the
 * collection's membership rule are different things.
 *
 * The
 * empty state moves with the rows for the same reason it does elsewhere: it is
 * a claim about the current contents.
 */
export function NotificationList({ items }: { items: NotificationItem[] }) {
  const now = useShopperClock();
  // Both edges. A collection that can only ever SHRINK is still stale: a claim
  // with three hours left when the page opened enters the "expires soon"
  // window an hour later, and the row has to appear then, not on reload.
  const shown = items.filter(
    (n) =>
      isUnexpiredAt(n.expiresAt ?? null, now) &&
      (!n.visibleFrom || new Date(n.visibleFrom).getTime() <= now.getTime())
  );

  if (shown.length === 0) {
    return (
      <EmptyState title="Nothing yet" sub="Deal alerts and code reminders land here" />
    );
  }

  return (
    <div className="space-y-3">
      {shown.map((n) => (
        <NotificationRow
          key={`${n.title}-${n.at}-${n.body}`}
          title={n.title}
          body={n.body}
          at={n.at}
          unread={n.unread}
          now={now}
        />
      ))}
    </div>
  );
}
