"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { relativeAgo } from "@/lib/ui";
import { QUEUE_POLL_MS, type QueueEntry } from "@/lib/queue";

/**
 * The shopper queue at the till — checked-in shoppers, oldest first.
 *
 * Deliberately thin: tapping a row only NAVIGATES with the claim code, which
 * seeds the existing keypad and its resolve → fee disclosure → Confirm flow.
 * No verification, no money, no second path lives here (§25). Dismissing an
 * entry drops the shopper off the list and touches nothing else — their
 * claim still resolves on the keypad as usual.
 *
 * Polls (§31): plain fetch on an 8s interval — a counter on mall wifi must
 * not depend on a websocket staying up, and a missed poll just means the
 * next one catches up. Errors keep the last good list rather than blanking
 * a screen staff are actively working from.
 */
export function QueuePanel() {
  const router = useRouter();
  const [entries, setEntries] = useState<QueueEntry[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      if (!res.ok) return;
      const body = await res.json();
      if (Array.isArray(body?.entries)) setEntries(body.entries);
    } catch {
      // keep the last good list
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
              onClick={() =>
                router.replace(`/merchant/redeem?code=${e.code}`)
              }
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
