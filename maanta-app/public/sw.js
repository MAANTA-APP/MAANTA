/* MAANTA push-only service worker.
 * Version: 2026-07-25 — bump this comment when changing SW behaviour so
 * browsers treat the script as updated. Do NOT add Cache Storage / offline
 * app-shell caching here without an explicit product decision; a caching SW
 * can pin an old build after deploy.
 */
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
