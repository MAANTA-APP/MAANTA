"use client";

import { useCallback, useEffect, useState } from "react";
import { relativeAgo } from "@/lib/ui";
import { QUEUE_POLL_MS, type QueueEntry } from "@/lib/queue";
import { publishQueueCode } from "@/lib/queue-code-handoff";
import { IconBolt } from "@/components/ui/icons";

/**
 * The shopper queue at the till — checked-in shoppers, oldest first.
 *
 * Deliberately thin: tapping a row only hands the claim code to the keypad
 * ON THIS SAME PAGE, in memory (lib/queue-code-handoff — never via the URL,
 * where a live OTP would persist in shared-till history, logs and PostHog's
 * $current_url; D193), and the keypad runs its existing resolve → fee
 * disclosure → Confirm flow. No verification, no money, no second path
 * lives here (§25). Dismissing an
 * entry drops the shopper off the list and touches nothing else — their
 * claim still resolves on the keypad as usual.
 *
 * Polls (§31): plain fetch on an 8s interval — a counter on mall wifi must
 * not depend on a websocket staying up, and a missed poll just means the
 * next one catches up. AFTER a successful load, errors keep the last good
 * list rather than blanking a screen staff are actively working from. But
 * until the FIRST load succeeds, a failure is not "empty" — rendering
 * nothing would tell staff nobody is queued while checked-in shoppers wait
 * (the D164/D185 rule: a failed read must never look like a real zero), so
 * that state says so in one muted line and keeps retrying on the same poll.
 */
export function QueuePanel() {
  const [entries, setEntries] = useState<QueueEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      const body = await res.json();
      if (Array.isArray(body?.entries)) {
        setEntries(body.entries);
        setLoadFailed(false);
      }
    } catch {
      // keep the last good list; remember that we have none yet
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), QUEUE_POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const dismiss = useCallback(
    async (id: string) => {
      setEntries((prev) => prev?.filter((e) => e.id !== id) ?? prev);
      await fetch("/api/queue/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presentationId: id }),
      }).catch(() => null);
      void load();
    },
    [load]
  );

  // Four distinct states, deliberately (G6). Before this, a first load in
  // progress rendered exactly like "nobody is waiting" — so staff glancing
  // down mid-fetch were told the queue was empty by a screen that simply did
  // not know yet.
  //
  // 1. FAILED FIRST LOAD — never loaded and the last attempt failed. An
  //    honest line, not a silent nothing (D164/D185: a failed read must never
  //    look like a real zero). Unchanged from PR C.
  if (entries === null && loadFailed) {
    return (
      <p className="border-b border-line bg-stone px-4 py-2 text-xs text-muted">
        Couldn&apos;t load the shopper queue — retrying. The keypad works as
        usual.
      </p>
    );
  }

  // 2. LOADING — first fetch still in flight. One muted line in the same slot
  //    the header occupies, so the keypad below does not jump when the real
  //    list arrives.
  if (entries === null) {
    return (
      <p
        role="status"
        className="border-b border-line bg-stone px-4 py-2 text-xs text-muted"
      >
        Checking for waiting shoppers…
      </p>
    );
  }

  // 3. EMPTY — a load succeeded and nobody is waiting. Renders nothing: the
  //    till belongs to the keypad, and an empty-state card would push it down
  //    the screen for no information.
  if (entries.length === 0) return null;

  // 4. POPULATED — below.

  return (
    <section className="border-b border-line bg-stone px-4 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Shopper queue
        </h2>
        <span className="tnum text-xs text-secondary">
          {entries.length} waiting
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {entries.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2 rounded-card bg-white px-3 py-2.5 shadow-card"
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => publishQueueCode(e.code)}
            >
              <p className="truncate text-sm font-semibold text-ink">
                {e.name}
              </p>
              <p className="truncate text-xs text-secondary">
                {e.dealTitle} · arrived {relativeAgo(e.arrivedAt)}
              </p>
              {/* G2: Fast Visit is a STATE, so it renders as icon + word and
                  survives greyscale — it was previously appended to the line
                  above as plain text, indistinguishable at a glance from the
                  deal title. The flag is the server's persisted arrival-time
                  verdict (redemptions.fast_visit_qualified_at, D191) carried
                  through the queue row; nothing here recomputes eligibility,
                  and no reward is promised at the till. */}
              {e.fastVisitEligible ? (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-line bg-stone px-2 py-0.5 text-[11px] font-semibold text-ink">
                  <IconBolt className="h-3 w-3" aria-hidden="true" />
                  Fast Visit
                </span>
              ) : null}
            </button>
            <button
              type="button"
              aria-label={`Dismiss ${e.name} from the queue`}
              className="shrink-0 rounded-full px-2 py-1 text-xs text-muted"
              onClick={() => void dismiss(e.id)}
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
