import Link from "next/link";
import { LockedChip, StatusChip } from "@/components/ui/chips";

/**
 * The acquisition pipeline's lead rows, in one place.
 *
 * There were three copies of this — `/agent` for a field rep, `/agent` for a
 * co-founder, and `/agent/leads` — each recomputing `hoursLeft` and each
 * choosing between `LockedChip` and `StatusChip` the same way. Copies of a
 * display rule drift: a lead's lock is live only while `locked_until` is in the
 * future (`capture_lead` says so too, `l.locked_until > NOW()`), and `status`
 * stays `'locked'` after that because nothing rewrites it. Get that wrong in one
 * copy and the same screen tells you two different things about the same lead.
 *
 * {@link isLockLive} is exported so a count of "open leads" can be filtered on
 * exactly the condition these rows display, rather than on `status` alone.
 */

export type LeadRow = {
  id: string;
  shop_name: string;
  status: string;
  locked_until: string;
};

/** A lock is live only until `locked_until` passes; `status` never changes. */
export function isLockLive(lead: Pick<LeadRow, "status" | "locked_until">): boolean {
  return lead.status === "locked" && new Date(lead.locked_until).getTime() > Date.now();
}

export function LeadRowList({
  leads,
  emptyLabel,
}: {
  leads: LeadRow[];
  emptyLabel: string;
}) {
  if (leads.length === 0) {
    return (
      <p className="rounded-card border border-line bg-white px-4 py-6 text-center text-sm text-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <>
      {leads.map((l) => {
        const hoursLeft = Math.max(
          0,
          Math.round((new Date(l.locked_until).getTime() - Date.now()) / 3600_000)
        );
        return (
          <Link
            key={l.id}
            href={`/agent/leads/${l.id}`}
            className="flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5 hover:bg-cream/50"
          >
            <span className="text-sm font-bold text-ink">{l.shop_name}</span>
            {isLockLive(l) ? (
              <LockedChip hoursLeft={hoursLeft} />
            ) : (
              <StatusChip status={l.status} />
            )}
          </Link>
        );
      })}
    </>
  );
}
