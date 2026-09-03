/**
 * Drops every cached shopper page from this device (D235).
 *
 * ## Why sign-out has to do this
 *
 * The service worker caches the `/my-deals` document so a claimed 6-digit code
 * survives a dead network at the counter. That document contains someone's
 * codes, and **Cache Storage is scoped to the origin, not to the signed-in
 * user**. On a shared handset the next person could otherwise reload their way
 * to the previous shopper's tickets. Signing out must therefore clear the cache
 * as well as the session.
 *
 * ## Why it is done twice
 *
 * The `postMessage` path is the correct one: `sw.js` owns the cache names, so
 * asking it to purge keeps that knowledge in one file. But a page can have no
 * controller — the worker is still installing, registration was refused, the
 * browser does not support it — and then the message goes nowhere silently,
 * which is the worst outcome for a privacy purge.
 *
 * So the page also deletes the caches itself. The shared contract is the
 * **`maanta-pages-` prefix**, not the exact version string, which is what lets
 * `sw.js` bump `VERSION` without this file following it. Both paths are safe to
 * run together: deleting an already-deleted cache is a no-op.
 *
 * Never throws. A sign-out must complete even if the purge cannot.
 */
export const PAGE_CACHE_PREFIX = "maanta-pages-";

export async function purgeCachedPages(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "maanta-purge-pages" });
    }
  } catch {
    // best-effort — the direct deletion below is the one that must not be skipped
  }

  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith(PAGE_CACHE_PREFIX)).map((k) => caches.delete(k))
    );
  } catch {
    // A browser that refuses Cache Storage never cached anything to leak.
  }
}
