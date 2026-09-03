import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * D235 — the service worker's offline strategy, **executed** rather than read.
 *
 * `offline-code-screen.test.ts` asserts the strategy is written. This file runs
 * it: `public/sw.js` is loaded into a fake worker global with a fake Cache
 * Storage and a controllable `fetch`, then driven through the scenarios that
 * matter at a counter.
 *
 * That closes most of the gap a source-only guard leaves — a regression that
 * keeps the right words but breaks the behaviour (a swapped fallback order, a
 * cache write that never happens, a `/api/` request that gets intercepted after
 * all) fails here and would pass there.
 *
 * **Still not covered, and stated so nobody reads more into a green run than is
 * there**: real browser worker lifecycle, real navigation, and whether the
 * cached document renders a usable code. That is the Playwright golden path
 * with the network cut (`docs/ops/e2e-golden-path.md`), and it is still owed.
 */

const SW_SOURCE = readFileSync(
  path.resolve(__dirname, "..", "..", "..", "public", "sw.js"),
  "utf8"
);

const ORIGIN = "https://maanta.app";

class FakeCache {
  store = new Map<string, Response>();
  async put(req: Request | string, res: Response) {
    this.store.set(typeof req === "string" ? req : req.url, res);
  }
  async match(req: Request | string, opts?: { ignoreSearch?: boolean }) {
    const url = typeof req === "string" ? new URL(req, ORIGIN).toString() : req.url;
    const hit = this.store.get(url);
    if (hit || !opts?.ignoreSearch) return hit;
    const bare = url.split("?")[0];
    for (const [k, v] of Array.from(this.store.entries())) {
      if (k.split("?")[0] === bare) return v;
    }
    return undefined;
  }
  async addAll(urls: string[]) {
    for (const u of urls) {
      this.store.set(new URL(u, ORIGIN).toString(), new Response(`cached:${u}`));
    }
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>();
  async open(name: string) {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
    return this.caches.get(name)!;
  }
  async keys() {
    return Array.from(this.caches.keys());
  }
  async delete(name: string) {
    return this.caches.delete(name);
  }
  async match(req: Request | string, opts?: { ignoreSearch?: boolean }) {
    for (const c of Array.from(this.caches.values())) {
      const hit = await c.match(req, opts);
      if (hit) return hit;
    }
    return undefined;
  }
}

type Listener = (event: Record<string, unknown>) => void;

function loadWorker(networkFetch: (req: Request) => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const cacheStorage = new FakeCacheStorage();
  const self = {
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    location: { origin: ORIGIN },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined, matchAll: async () => [], openWindow: async () => undefined },
    registration: { showNotification: async () => undefined },
  };

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("self", "caches", "fetch", "Response", "URL", SW_SOURCE)(
    self,
    cacheStorage,
    networkFetch,
    Response,
    URL
  );

  /** Fire a lifecycle event and await whatever it passed to waitUntil. */
  async function lifecycle(type: "install" | "activate" | "message", data?: unknown) {
    const fn = listeners.get(type);
    if (!fn) throw new Error(`no ${type} listener`);
    const waits: Promise<unknown>[] = [];
    fn({ waitUntil: (p: Promise<unknown>) => waits.push(p), data });
    await Promise.all(waits);
  }

  /** Fire a fetch event; returns the Response, or null if the worker passed it through. */
  async function request(url: string, init: { method?: string; mode?: string } = {}) {
    const fn = listeners.get("fetch");
    if (!fn) throw new Error("no fetch listener");
    const req = new Request(new URL(url, ORIGIN).toString(), { method: init.method ?? "GET" });
    Object.defineProperty(req, "mode", { value: init.mode ?? "navigate" });
    const captured: Promise<Response>[] = [];
    fn({ request: req, respondWith: (p: Promise<Response>) => captured.push(p) });
    return captured.length > 0 ? await captured[0] : null;
  }

  return { lifecycle, request, cacheStorage };
}

/** A network that works, then stops — the counter scenario. */
function switchableNetwork() {
  const state = { online: true };
  const fetchImpl = async (req: Request) => {
    if (!state.online) throw new TypeError("Failed to fetch");
    return new Response(`live:${new URL(req.url).pathname}`, { status: 200 });
  };
  return { state, fetchImpl };
}

describe("the worker keeps a claimed code readable with no network", () => {
  let net: ReturnType<typeof switchableNetwork>;
  let sw: ReturnType<typeof loadWorker>;

  beforeEach(async () => {
    net = switchableNetwork();
    sw = loadWorker(net.fetchImpl);
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
  });

  it("serves the live page and caches it while online", async () => {
    const res = await sw.request("/my-deals");
    expect(await res!.text()).toBe("live:/my-deals");

    net.state.online = false;
    const offline = await sw.request("/my-deals");
    expect(
      await offline!.text(),
      "the code screen was not served from cache with the network down — this is\n" +
        "the exact failure D235 exists to prevent"
    ).toBe("live:/my-deals");
  });

  it("prefers the network over the cache when both are available", async () => {
    await sw.request("/my-deals");
    // A stale ticket shown to a shopper who HAS signal is worse than pre-D235.
    const res = await sw.request("/my-deals");
    expect(await res!.text()).toBe("live:/my-deals");
  });

  it("falls back to the offline page when nothing was ever cached", async () => {
    net.state.online = false;
    const res = await sw.request("/my-deals");
    expect(await res!.text()).toBe("cached:/offline");
  });

  it("shows the offline page for any other route rather than a browser error", async () => {
    await sw.request("/feed");
    net.state.online = false;
    const res = await sw.request("/feed");
    expect(
      await res!.text(),
      "the feed was served from cache. A stale feed advertises deals that may be\n" +
        "gone — the promise D92 removed from the offline banner."
    ).toBe("cached:/offline");
  });
});

describe("the worker stays out of the way of live state", () => {
  let sw: ReturnType<typeof loadWorker>;
  beforeEach(async () => {
    sw = loadWorker(switchableNetwork().fetchImpl);
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
  });

  it("does not intercept /api/ at all", async () => {
    expect(await sw.request("/api/push/subscribe")).toBeNull();
    expect(await sw.request("/api/healthz")).toBeNull();
  });

  it("does not intercept writes", async () => {
    expect(await sw.request("/my-deals", { method: "POST" })).toBeNull();
  });

  it("does not intercept cross-origin requests", async () => {
    expect(await sw.request("https://example.com/tracker.js")).toBeNull();
  });

  it("does not intercept in-app RSC fetches — the documented limit", async () => {
    // Non-navigate requests are passed through deliberately: an RSC payload
    // carries a build-specific hash and caching it by URL risks serving a
    // payload that does not match the running build.
    expect(await sw.request("/my-deals?_rsc=abc123", { mode: "cors" })).toBeNull();
  });
});

describe("sign-out can clear the cached codes", () => {
  it("drops the page cache on the purge message but keeps the shell", async () => {
    const net = switchableNetwork();
    const sw = loadWorker(net.fetchImpl);
    await sw.lifecycle("install");
    await sw.lifecycle("activate");
    await sw.request("/my-deals");

    const pageCache = (await sw.cacheStorage.keys()).find((k) => k.startsWith("maanta-pages-"));
    expect(pageCache, "the page cache was never created").toBeTruthy();

    await sw.lifecycle("message", { type: "maanta-purge-pages" });

    expect(
      (await sw.cacheStorage.keys()).some((k) => k.startsWith("maanta-pages-")),
      "the cached codes survived sign-out. Cache Storage is scoped to the origin,\n" +
        "not the user, so on a shared handset the next person could reload into\n" +
        "the previous shopper's tickets."
    ).toBe(false);

    net.state.online = false;
    const after = await sw.request("/my-deals");
    expect(await after!.text()).toBe("cached:/offline");
  });
});
