"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { relativeAgo } from "@/lib/ui";
import { QUEUE_POLL_MS, type QueueEntry } from "@/lib/queue";
import { subscribeRedemptionCompleted } from "@/lib/queue-code-handoff";
import { publishQueueCode } from "@/lib/queue-code-handoff";

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
  // Monotonic request version: only the newest-started queue read may commit
  // state. This prevents an older poll response from re-adding a shopper
  // after the redemption-completed refresh already removed them.
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      if (generation !== loadGeneration.current) return;
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      const body = await res.json();
      if (generation !== loadGeneration.current) return;
      if (Array.isArray(body?.entries)) {
        setEntries(body.entries);
        setLoadFailed(false);
      }
    } catch {
      // keep the last good list; remember that we have none yet
      if (generation === loadGeneration.current) setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), QUEUE_POLL_MS);
    // A completed verification drops the served shopper straight away; the
    // poll alone left them listed and tappable for up to QUEUE_POLL_MS, and
    // tapping that stale row showed staff a rejection screen for a customer
    // they had just served (D204).
    const unsubscribe = subscribeRedemptionCompleted(() => void load());
    return () => {
      clearInterval(t);
      unsubscribe();
    };
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

  // Never loaded AND the last attempt failed: an honest one-liner, not a
  // silent nothing. Once any load has succeeded, quiet degradation resumes.
  if (entries === null && loadFailed) {
    return (
      <p className="border-b border-line bg-stone px-4 py-2 text-xs text-muted">
        Couldn&apos;t load the shopper queue — retrying. The keypad works as
        usual.
      </p>
    );
  }

  if (!entries || entries.length === 0) return null;

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
                {e.fastVisitEligible ? " · Fast Visit" : ""}
              </p>
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
