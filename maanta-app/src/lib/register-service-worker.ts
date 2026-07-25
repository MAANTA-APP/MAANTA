/**
 * Register the push-only service worker (`public/sw.js`).
 *
 * `updateViaCache: "none"` forces the browser to bypass HTTP cache when
 * checking for a new worker script, so a deploy cannot leave clients on a
 * stale `sw.js` byte-for-byte. The worker itself does not cache the app
 * shell — this only protects the worker registration path.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  return navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .catch(() => null);
}
