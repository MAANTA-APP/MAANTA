/**
 * A minimal static origin for the service-worker offline spec (D235).
 *
 * It exists so the REAL `public/sw.js` can be exercised by a REAL browser
 * without a deployed app, a database or a session. The pages it serves are
 * stand-ins whose only job is to be distinguishable: the point under test is
 * the worker's fetch strategy, not Next.js rendering.
 *
 * Deliberately NOT a substitute for `e2e/golden-path.spec.ts`, which needs a
 * live env and proves something different — that the real `/my-deals` document
 * renders a usable code for a real signed-in shopper.
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SW_PATH = path.resolve(HERE, "..", "..", "public", "sw.js");
const PORT = Number(process.env.SW_HARNESS_PORT || 4321);

/** Registers the worker exactly as `ServiceWorkerRegistrar` does. */
const REGISTER = `<script>
  if ("serviceWorker" in navigator) { navigator.serviceWorker.register("/sw.js"); }
</script>`;

const page = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
  `<body>${body}${REGISTER}</body></html>`;

const ROUTES = {
  "/my-deals": () => page("My deals", "<h1>My deals</h1><p id=code>4 8 2 9 1 6</p>"),
  "/feed": () => page("Feed", "<h1>Feed</h1><p id=marker>LIVE FEED</p>"),
  "/offline": () => page("Offline", "<h1>You&rsquo;re offline</h1><p id=marker>OFFLINE PAGE</p>"),
};

createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/sw.js") {
    res.writeHead(200, {
      "Content-Type": "text/javascript",
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    });
    res.end(readFileSync(SW_PATH, "utf8"));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ live: true }));
    return;
  }

  const route = ROUTES[url.pathname];
  if (route) {
    res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
    res.end(route());
    return;
  }

  res.writeHead(404, { "Content-Type": "text/html" });
  res.end(page("Not found", "<h1>404</h1>"));
}).listen(PORT, () => console.log(`sw harness on http://localhost:${PORT}`));
