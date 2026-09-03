"use client";

import { useEffect, useState } from "react";

/**
 * Says, on the code screen, that what is on screen is a saved copy (D235).
 *
 * The service worker serves `/my-deals` from cache when the network is gone, so
 * the codes below are real and usable — but the *page* may be minutes or hours
 * old, and a ticket could since have been redeemed or cancelled server-side.
 * Two things already stop that being dangerous: the row derives its own state
 * from a live clock (D213), so an expired ticket reads EXPIRED even from cache,
 * and staff verification is authoritative, so a stale code is refused at the
 * counter rather than honoured.
 *
 * What is left is an honesty problem, and this is the fix: never let a shopper
 * believe a saved page is a live one.
 *
 * Distinct from the shell's `OfflineBanner`, which states the connection is
 * gone. This states what that means *for the thing you came here for*, which is
 * the opposite of the feed's answer — hence a page-level component rather than
 * another context in `OFFLINE_MESSAGE`.
 */
export function TicketOfflineNotice() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="mx-4 mb-3 rounded-card bg-white px-4 py-3 shadow-card">
      <p className="text-xs font-semibold text-ink">Saved copy — you&apos;re offline</p>
      <p className="mt-1 text-xs leading-relaxed text-secondary">
        Your codes are shown from this device and can still be scanned at the counter.
        Reconnect to check for changes.
      </p>
    </div>
  );
}
