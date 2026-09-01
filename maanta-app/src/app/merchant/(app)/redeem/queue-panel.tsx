"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { relativeAgo } from "@/lib/ui";
import { QUEUE_POLL_MS, type QueueEntry } from "@/lib/queue";
import { subscribeRedemptionCompleted } from "@/lib/queue-code-handoff";
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [callingId, setCallingId] = useState<string | null>(null);

  // Polls are serialized. A slow mall-Wi-Fi response must be allowed to
  // finish even if it takes longer than QUEUE_POLL_MS; otherwise a timer can
  // supersede every request forever and the queue never becomes visible.
  //
  // Priority refreshes (verification completed / dismiss) are different: if
  // one arrives while a poll is in flight, that older response is no longer
  // allowed to commit because it may contain the just-served shopper. We mark
  // it stale and immediately run one fresh read after it settles.
  const loadInFlight = useRef(false);
  const priorityRefreshRequested = useRef(false);
  const refreshEpoch = useRef(0);

  const load = useCallback(async (priority = false) => {
    if (priority) refreshEpoch.current += 1;

    if (loadInFlight.current) {
      if (priority) priorityRefreshRequested.current = true;
      return;
    }

    loadInFlight.current = true;
    try {
      let runAgain = true;
      while (runAgain) {
        priorityRefreshRequested.current = false;
        const epoch = refreshEpoch.current;

        try {
          const res = await fetch("/api/queue", { cache: "no-store" });

          // A priority event that happened while this request was pending has
          // made its snapshot stale. Skip both success and failure state from
          // that request; the loop below will perform the requested fresh read.
          if (epoch === refreshEpoch.current) {
            if (!res.ok) {
              setLoadFailed(true);
            } else {
              const body = await res.json();
              // A priority event may arrive after fetch() resolves but while the
              // response body is still being read. Re-check the epoch after
              // awaiting res.json() before committing this snapshot.
              if (
                epoch === refreshEpoch.current &&
                Array.isArray(body?.entries)
              ) {
                setEntries(body.entries);
                setLoadFailed(false);
              }
            }
          }
        } catch {
          // Keep the last good list. Only the current epoch may report a read
          // failure; an invalidated request is followed by the priority read.
          if (epoch === refreshEpoch.current) setLoadFailed(true);
        }

        runAgain = priorityRefreshRequested.current;
      }
    } finally {
      loadInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), QUEUE_POLL_MS);
    // A completed verification drops the served shopper straight away; the
    // poll alone left them listed and tappable for up to QUEUE_POLL_MS, and
    // tapping that stale row showed staff a rejection screen for a customer
    // they had just served (D204). This is a priority read: an in-flight poll
    // may not overwrite it with a pre-verification snapshot.
    const unsubscribe = subscribeRedemptionCompleted(() => void load(true));
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
      void load(true);
    },
    [load]
  );

  const callForward = useCallback(
    async (entry: QueueEntry) => {
      setCallingId(entry.id);
      setActionError(null);
      try {
        const res = await fetch("/api/queue/call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presentationId: entry.id }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || body?.called !== true) {
          setActionError(body?.error ?? "Could not call the shopper.");
          return;
        }
        setEntries((current) =>
          current?.map((item) =>
            item.id === entry.id
              ? { ...item, status: "called", calledAt: body.calledAt ?? item.calledAt }
              : item
          ) ?? current
        );
      } catch {
        setActionError("Could not call the shopper.");
      } finally {
        setCallingId(null);
        void load(true);
      }
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
  //    look like a real zero).
  if (entries === null && loadFailed) {
    return (
      <p className="border-b border-line bg-stone px-4 py-2 text-xs text-muted">
        Couldn&apos;t load the shopper queue — retrying. The keypad works as
        usual.
      </p>
    );
  }

  // 2. LOADING — first fetch still in flight.
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

  // 3. EMPTY — a successful read with nobody waiting.
  if (entries.length === 0) return null;

  // 4. POPULATED — below.

  return (
    <section className="border-b border-line bg-stone px-4 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          Shopper queue
        </h2>
        <span className="tnum text-xs text-secondary">
          {entries.filter((entry) => entry.status === "waiting").length} waiting
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {actionError ? (
          <p role="alert" className="text-xs font-medium text-ink">
            {actionError} Try again.
          </p>
        ) : null}
        {entries.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2 rounded-card bg-white px-3 py-2.5 shadow-card"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {e.name}
              </p>
              <p className="truncate text-xs text-secondary">
                {e.dealTitle} · arrived {relativeAgo(e.arrivedAt)}
              </p>
              {e.fastVisitEligible ? (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-line bg-stone px-2 py-0.5 text-[11px] font-semibold text-ink">
                  <IconBolt className="h-3 w-3" aria-hidden="true" />
                  Fast Visit
                </span>
              ) : null}
              {e.status === "called" ? (
                <p className="mt-1 text-xs font-semibold text-verified">Called to counter</p>
              ) : null}
            </div>
            {e.status === "waiting" ? (
              <button
                type="button"
                className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                disabled={callingId === e.id}
                onClick={() => void callForward(e)}
              >
                {callingId === e.id ? "Calling…" : "Call"}
              </button>
            ) : null}
            <button
              type="button"
              className="shrink-0 rounded-full border border-line px-2 py-1 text-xs font-semibold text-ink"
              onClick={() => publishQueueCode(e.code)}
            >
              Verify
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
