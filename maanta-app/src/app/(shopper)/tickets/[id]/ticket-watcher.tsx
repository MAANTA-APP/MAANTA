"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a ticket is pending, refresh the page every 8s so the shopper's
 * screen flips to "Code verified" (8z) the moment the merchant verifies.
 */
export function TicketWatcher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 8000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
