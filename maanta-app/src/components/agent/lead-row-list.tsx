import Link from "next/link";
import { LockedChip, StatusChip } from "@/components/ui/chips";
import { IconAlert } from "@/components/ui/icons";

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

/**
 * A read of the pipeline failed.
 *
 * Shared because both `/agent` and `/agent/leads` load leads and both would
 * otherwise render a null result as "No leads yet" — a failed query presented as
 * a fact about the business. Whoever is reading needs to know the difference:
 * for a co-founder it is the difference between "we have no pipeline" and "we
 * could not ask".
 */
export function LeadsReadError({
  what = "leads",
  sub = "This is a read error, not an empty pipeline. Reload the page; if it keeps failing, tell the Maanta team.",
}: {
  what?: string;
  /** Second line — overridable so non-pipeline surfaces (founder KPIs) can reuse this without borrowing pipeline copy. */
  sub?: string;
}) {
  return (
    <div role="alert" className="rounded-card bg-white shadow-card px-4 py-6">
      {/*
        Frozen UI rule 4: state is an icon **and** a word, readable in greyscale.
        Text alone made "could not load" indistinguishable from an ordinary
        paragraph once colour is gone. Colour stays on the icon and the border —
        body text is `text-ink` (#111), never the error red — and the icon is
        aria-hidden because it repeats what the sentence beside it already says.
      */}
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <IconAlert aria-hidden className="h-4 w-4 shrink-0 text-flame" />
        Could not load {what}.
      </p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
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
      <p className="rounded-card bg-white shadow-card px-4 py-6 text-center text-sm text-muted">
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
            className="flex items-center justify-between rounded-card bg-white shadow-card px-4 py-3.5 hover:bg-cream/50"
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
