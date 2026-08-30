"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/** D213 criterion 4: server-owned claim counts are refreshed at this bound. */
export const SHOPPER_INVENTORY_REFRESH_MS = 30_000;

/** Only surfaces that advertise deal availability need inventory polling. */
export function needsInventoryRefresh(pathname: string): boolean {
  return (
    pathname === "/feed" ||
    pathname === "/browse" ||
    pathname === "/map" ||
    pathname === "/search" ||
    pathname.startsWith("/shops/") ||
    pathname.startsWith("/deals/")
  );
}

/** Feed/Browse/Map read the tagged getLiveDeals cache; the other pages do not. */
export function needsDealCacheInvalidation(pathname: string): boolean {
  return pathname === "/feed" || pathname === "/browse" || pathname === "/map";
}

/**
 * Refreshes server-owned inventory without remounting client state.
 *
 * Time-derived state remains on the single shopper clock. Claim counts cannot:
 * another shopper changes them on the server, so a bounded router refresh is
 * the only way an already-open discovery surface can stop advertising the
 * final claimed slot. Returning to a backgrounded tab refreshes immediately.
 */
export function ShopperInventoryRefresh() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!needsInventoryRefresh(pathname)) return;

    let inFlight = false;
    const refresh = async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        if (needsDealCacheInvalidation(pathname)) {
          // Await a short-lived, server-issued cache-bypass marker before the
          // RSC read. Otherwise Next's stale-while-revalidate path can make the
          // first 30-second refresh stale and leave exhausted inventory up for
          // 60s. A per-shopper bypass avoids globally evicting a hot node cache.
          await fetch("/api/shopper/inventory-refresh", {
            method: "POST",
            cache: "no-store",
          });
        }
      } finally {
        router.refresh();
        inFlight = false;
      }
    };
    const timer = window.setInterval(
      () => void refresh(),
      SHOPPER_INVENTORY_REFRESH_MS
    );
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const onPageShow = () => void refresh();
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [pathname, router]);

  return null;
}
