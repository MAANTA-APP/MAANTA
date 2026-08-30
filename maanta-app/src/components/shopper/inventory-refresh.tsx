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

    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, SHOPPER_INVENTORY_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", refresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", refresh);
    };
  }, [pathname, router]);

  return null;
}
