"use client";

import { EmptyState } from "@/components/ui/states";
import { TicketRow } from "@/components/shopper/ticket-row";
import { useShopperClock } from "@/lib/use-shopper-clock";

export type MyDealsSort = "newest" | "ending" | "redeemed";
export type MyDealsWhen = "active" | "past";

export type MyDealsTicket = {
  id: string;
  href: string;
  code: string;
  status: string;
  expiresAt: string;
  redeemedAt: string | null;
  claimedAt: string | null;
  arrivedAt: string | null;
  qualifiedAt: string | null;
  countdownExpiresAt: string | null;
  merchantName: string | null;
  dealTitle: string | null;
};

/**
 * A ticket is "active" purely as a function of the clock: pending, and not yet
 * past its own expiry. Nothing else about the row changes over time.
 */
export function isTicketActive(ticket: MyDealsTicket, now: Date): boolean {
  return ticket.status === "pending" && new Date(ticket.expiresAt) > now;
}

function sortTickets(tickets: MyDealsTicket[], sort: MyDealsSort): MyDealsTicket[] {
  const copy = [...tickets];
  if (sort === "ending") {
    return copy.sort(
      (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
    );
  }
  if (sort === "redeemed") {
    return copy.sort((a, b) => {
      const ar = a.redeemedAt ? new Date(a.redeemedAt).getTime() : 0;
      const br = b.redeemedAt ? new Date(b.redeemedAt).getTime() : 0;
      return br - ar;
    });
  }
  return copy.sort(
    (a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime()
  );
}

/** Which tickets the requested segment holds at `now`, in the requested order. */
export function selectMyDealsTickets(
  tickets: MyDealsTicket[],
  when: MyDealsWhen,
  sort: MyDealsSort,
  now: Date
): MyDealsTicket[] {
  return sortTickets(
    tickets.filter((t) => (when === "active" ? isTicketActive(t, now) : !isTicketActive(t, now))),
    sort
  );
}

/**
 * The Active / Past collection on `/my-deals` (D213 criterion 3 — "section
 * membership").
 *
 * The page used to partition these rows during its server render. Fixing the
 * ROW made an expired ticket flip its own chip to EXPIRED while the tab holding
 * it still called it active, and a Past tab opened before the boundary never
 * admitted it — the same contradiction, one containment level out. Membership
 * is therefore decided here, on the shared clock, and the instant is handed
 * down to each row so the collection and its members cannot disagree.
 *
 * The whole already-authorised ticket set is passed in and partitioned on the
 * client. Nothing is refetched: the rows were read once, for this user, by the
 * server; only which segment holds them changes with time. The empty state is
 * inside this component for the same reason — it is a statement about the
 * current membership, so it would freeze if it were decided upstream.
 */
export function MyDealsList({
  tickets,
  when,
  sort,
  featureEnabled,
  windowMinutes,
}: {
  tickets: MyDealsTicket[];
  when: MyDealsWhen;
  sort: MyDealsSort;
  featureEnabled: boolean;
  windowMinutes: number;
}) {
  const now = useShopperClock();
  const shown = selectMyDealsTickets(tickets, when, sort, now);

  if (shown.length === 0) {
    // Neither segment may claim the shopper has never claimed while the OTHER
    // one holds their tickets. "No claimed deals yet" is true only of someone
    // with no tickets at all — and D213 made the false case reachable without
    // navigating: when the last active ticket expires on an open Active tab it
    // moves to Past, and copy saying they have never claimed would contradict
    // the history one tap away.
    const hasAny = tickets.length > 0;
    const copy =
      when === "past"
        ? {
            title: "No past deals",
            sub: "Redeemed and expired deals will show here.",
          }
        : hasAny
          ? {
              title: "No active deals",
              sub: "Redeemed and expired deals are under Past.",
            }
          : { title: "No claimed deals yet", sub: undefined };
    return (
      <EmptyState
        title={copy.title}
        sub={copy.sub}
        actionLabel="Browse deals"
        actionHref="/feed"
      />
    );
  }

  return (
    <div className="space-y-3">
      {shown.map((t) => (
        <TicketRow
          key={t.id}
          href={t.href}
          merchantName={t.merchantName}
          dealTitle={t.dealTitle}
          code={t.code}
          featureEnabled={featureEnabled}
          ticketStatus={t.status}
          ticketExpiresAt={t.expiresAt}
          claimedAt={t.claimedAt}
          arrivedAt={t.arrivedAt}
          qualifiedAt={t.qualifiedAt}
          windowMinutes={windowMinutes}
          countdownExpiresAt={t.countdownExpiresAt}
          now={now}
        />
      ))}
    </div>
  );
}
