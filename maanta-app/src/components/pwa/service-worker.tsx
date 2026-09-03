"use client";

import { useEffect } from "react";

/**
 * Registers the service worker for the shopper app (D235).
 *
 * Before this existed the worker was registered in exactly two places: the
 * `/download` install panel, a marketing route most shoppers never open, and
 * the notification opt-in sheet — which D234 has now correctly gated off. So a
 * shopper who claimed a deal and walked to the counter had, in the common case,
 * **no service worker at all**, and the offline cache could never fill.
 *
 * Registering it on the shopper shell is what makes the code screen's offline
 * behaviour real rather than theoretical: the worker installs on the first
 * visit, and `/my-deals` is cached the first time it is opened online.
 *
 * Best-effort by design. A refused registration (private mode, an unsupported
 * browser, a blocked worker) must never break the page — it only means this
 * shopper has no offline copy, which is exactly where the product was before.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => null);
  }, []);
  return null;
}
