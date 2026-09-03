/* MAANTA service worker.
 *
 * Two jobs, in this order of importance:
 *
 *  1. **Keep a claimed 6-digit code readable without a network.** Drift D235.
 *     A shopper standing at a counter inside a concrete-and-steel mall, on
 *     congested wifi, with a queue behind them, is the moment this product
 *     either works or does not. `/my-deals` is `force-dynamic`, so before this
 *     handler existed a dropped connection meant no code on screen — the whole
 *     promise failing at its only moment of truth.
 *  2. Push delivery (the original 38-line worker).
 *
 * ## What is deliberately NOT attempted
 *
 * **Offline claiming or redeeming.** `claim_deal` decrements a claim cap and
 * mints an OTP; `verify_redemption` moves money. Both are server RPCs and
 * neither can be faked client-side. Nothing here queues a write, and no copy
 * anywhere may imply it does.
 *
 * **Caching anything under `/api/`.** Those are reads and writes against live
 * state, and a stale wallet balance or queue position is worse than an error.
 *
 * ## Known limit, stated rather than discovered later
 *
 * Only **navigation** requests are served from cache. An in-app client-side
 * navigation to /my-deals fetches an RSC payload whose URL carries a build-
 * specific `_rsc` hash, so caching it by URL would miss on the next deploy and
 * risks serving a payload that does not match the running build. The realistic
 * counter scenario — the shopper opens or reloads the app with no signal — is a
 * navigation request and is covered. A client-side tab switch while already
 * offline may still fail; reloading recovers it.
 *
 * ## Freshness is the page's job, not the worker's
 *
 * A cached page can show a ticket that has since expired or been redeemed. Two
 * things make that safe: the ticket row derives its own state from a live clock
 * (D213), so an expired ticket reads EXPIRED even from cache; and staff
 * verification is authoritative, so a stale code is refused at the counter
 * rather than honoured. `TicketOfflineNotice` tells the shopper they are
 * looking at a saved copy.
 */

const VERSION = "v1";
const SHELL_CACHE = `maanta-shell-${VERSION}`;
const PAGE_CACHE = `maanta-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

/** Documents worth keeping for a shopper with no signal. Codes, and only codes. */
const CACHEABLE_PAGES = ["/my-deals"];

const isCacheablePage = (url) =>
  CACHEABLE_PAGES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll([OFFLINE_URL]))
      // A failed precache must not wedge the worker: push delivery and the
      // page cache still work without the fallback document.
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("maanta-") && k !== SHELL_CACHE && k !== PAGE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

/**
 * Sign-out purge.
 *
 * The cached /my-deals document contains someone's codes. Cache Storage is
 * scoped to the origin, not to the signed-in user, so on a shared handset the
 * next person could otherwise reload their way to the previous shopper's
 * tickets. `sign-out-button.tsx` posts this before signing out.
 */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "maanta-purge-pages") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Writes, cross-origin, and everything under /api/ are passed straight
  // through: no interception, no caching, no offline substitute.
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Immutable build output — hashed filenames, safe to serve from cache first.
  // This is also the single biggest latency win on mall wifi.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (req.mode !== "navigate") return;

  // The code screen: network first so it is fresh whenever it can be, cache
  // second so it is present when it cannot.
  if (isCacheablePage(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(req, { ignoreSearch: true })
            .then((hit) => hit || caches.match(OFFLINE_URL))
            .then((hit) => hit || Response.error())
        )
    );
    return;
  }

  // Every other page: try the network, fall back to the honest offline page.
  // Nothing else is cached — a stale feed would advertise deals that may be
  // gone, which is the promise D92 removed from the offline banner.
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(OFFLINE_URL).then((hit) => hit || Response.error())
    )
  );
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "MAANTA", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "MAANTA", {
      body: payload.body || "",
      icon: "/favicon.ico",
      data: { url: payload.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url === url && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});
