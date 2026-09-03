import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stripComments } from "./helpers/comment-stripping";

/**
 * Drift **D235** — a claimed 6-digit code must be readable with no network.
 *
 * ## The failure this prevents
 *
 * `/my-deals` is `force-dynamic`, and before D235 `public/sw.js` was 38 lines
 * of push plumbing with no `fetch` handler. So displaying a claimed code
 * required a live round trip, at a counter, inside a mall, on congested wifi,
 * with a queue behind — the product's only moment of truth, and the place its
 * network is worst.
 *
 * ## What is asserted, and why each one
 *
 * The worker is plain JS with no test harness around it, so these are source
 * assertions rather than behavioural ones. That is a real limit and is stated
 * rather than hidden: **this suite proves the strategy is written, not that a
 * browser executes it.** Verifying the latter needs the Playwright golden path
 * with the network cut, which is `docs/ops/e2e-golden-path.md` work and is
 * recorded as still owed.
 *
 * The assertions below are chosen so that each one fails on a specific
 * regression someone could plausibly introduce, not to restate the file.
 */

const APP = path.resolve(__dirname, "..", "..");
const REPO = path.resolve(APP, "..");
const sw = () => stripComments(readFileSync(path.join(REPO, "public", "sw.js"), "utf8"));
const read = (...p: string[]) => stripComments(readFileSync(path.join(APP, ...p), "utf8"));
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("D235 — the worker can serve the code screen offline", () => {
  it("has a fetch handler at all", () => {
    expect(
      /addEventListener\(\s*["']fetch["']/.test(sw()),
      "public/sw.js has no fetch handler, so nothing can be served offline. This\n" +
        "is the exact state D235 recorded."
    ).toBe(true);
  });

  it("caches the code screen and nothing else that could go stale", () => {
    const src = flat(sw());
    expect(/CACHEABLE_PAGES\s*=\s*\[\s*["']\/my-deals["']/.test(src), "the /my-deals page is no longer the cached document").toBe(true);
    // A cached feed would advertise deals that may be gone — the promise D92
    // removed from the offline banner, reintroduced one layer down.
    expect(
      /CACHEABLE_PAGES\s*=\s*\[[^\]]*["']\/feed["']/.test(src),
      "the feed is being cached. A stale feed advertises deals that may be gone."
    ).toBe(false);
  });

  it("serves the code screen network-first, so a live page always wins", () => {
    // Cache-first here would show a stale ticket to a shopper who has signal,
    // which is strictly worse than the pre-D235 behaviour.
    const src = flat(sw());
    expect(
      /isCacheablePage\(url\)\s*\)\s*\{\s*event\.respondWith\(\s*fetch\(req\)/.test(src),
      "the code screen is no longer network-first. Cache-first would show a\n" +
        "stale ticket to a shopper who has a working connection."
    ).toBe(true);
    expect(/\.catch\(\s*\(\)\s*=>\s*caches/.test(src), "no cache fallback on network failure").toBe(true);
  });

  it("never touches /api/ or non-GET requests", () => {
    const src = flat(sw());
    expect(
      /req\.method\s*!==\s*["']GET["']\s*\)\s*return/.test(src),
      "the worker no longer bails out of non-GET requests — a claim or a\n" +
        "redemption POST must never be intercepted."
    ).toBe(true);
    expect(
      /url\.pathname\.startsWith\(\s*["']\/api\/["']\s*\)\s*\)\s*return/.test(src),
      "the worker no longer passes /api/ straight through. A stale wallet\n" +
        "balance or queue position is worse than an error."
    ).toBe(true);
  });

  it("keeps an offline fallback document that exists as a route", () => {
    expect(/OFFLINE_URL\s*=\s*["']\/offline["']/.test(sw())).toBe(true);
    const page = read("app", "offline", "page.tsx");
    expect(page.length).toBeGreaterThan(0);
    // Precached at install, so it must not depend on a request or a session.
    expect(
      /force-dynamic/.test(page),
      "/offline became dynamic. It is precached at worker install and cannot\n" +
        "depend on a request, a session or the database."
    ).toBe(false);
  });

  it("promises nothing offline that the product cannot do", () => {
    // claim_deal decrements a cap and mints an OTP; verify_redemption moves
    // money. Neither can be faked client-side, and no copy may imply otherwise.
    const page = flat(read("app", "offline", "page.tsx"));
    const notice = flat(read("components", "shopper", "ticket-offline-notice.tsx"));
    for (const [name, src] of [["/offline", page], ["TicketOfflineNotice", notice]] as const) {
      expect(
        /claim .{0,20}offline|will be retried|retry when|queued|saved deals|browse offline/i.test(src),
        `${name} implies MAANTA can claim, retry or browse offline. It cannot.`
      ).toBe(false);
    }
  });
});

describe("D235 — the cache can actually fill, and can be cleared", () => {
  it("registers the worker on the shopper shell", () => {
    // Registration used to live only in /download's install panel (a marketing
    // route most shoppers never open) and in the push opt-in sheet, which D234
    // gated off. Without this the cache never fills and the rest is theatre.
    expect(
      /ServiceWorkerRegistrar/.test(read("app", "(shopper)", "layout.tsx")),
      "the shopper shell no longer registers the service worker, so /my-deals\n" +
        "is never cached and the offline path is dead code."
    ).toBe(true);
    expect(
      /serviceWorker.*register\(\s*["']\/sw\.js["']/.test(
        flat(read("components", "pwa", "service-worker.tsx"))
      )
    ).toBe(true);
  });

  it("tells the shopper the code screen is a saved copy", () => {
    expect(
      /TicketOfflineNotice/.test(read("app", "(shopper)", "my-deals", "page.tsx")),
      "the code screen no longer says it is showing a saved copy when offline.\n" +
        "A cached page passing as a live one is the honesty half of D235."
    ).toBe(true);
  });

  it("purges the cached codes on sign-out, in BOTH auth strategies", () => {
    // The cached document holds someone's codes and Cache Storage is scoped to
    // the origin, not the user. Purging in only one branch would make the
    // protection depend on which auth mode happens to be running.
    const out = read("app", "sign-out-button.tsx");
    expect(
      (out.match(/purgeCachedPages\(\)/g) ?? []).length,
      "sign-out does not purge the page cache in both the Clerk and Supabase\n" +
        "branches — on a shared handset the next person could reload into the\n" +
        "previous shopper's tickets."
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps the purge contract between the page and the worker on a prefix", () => {
    // sw.js owns the cache NAME; the app knows only the prefix, so bumping
    // VERSION in the worker cannot silently orphan the sign-out purge.
    const purge = read("lib", "pwa", "purge-cached-pages.ts");
    expect(/PAGE_CACHE_PREFIX\s*=\s*["']maanta-pages-["']/.test(purge)).toBe(true);
    expect(
      /PAGE_CACHE\s*=\s*`maanta-pages-\$\{VERSION\}`/.test(sw()),
      "the worker's page-cache name no longer starts with the prefix the\n" +
        "sign-out purge deletes by."
    ).toBe(true);
    expect(
      /maanta-purge-pages/.test(sw()) && /maanta-purge-pages/.test(purge),
      "the purge message name no longer matches between page and worker."
    ).toBe(true);
  });
});

describe("D235 — the offline copy map stays honest", () => {
  it("still refuses to claim the feed is available offline", () => {
    const states = read("components", "ui", "states.tsx");
    expect(
      /shopper:\s*"You're offline\. Reconnect to load live deals\."/.test(states),
      "the shopper offline line changed. The feed is deliberately NOT cached, so\n" +
        "any wording implying saved deals is the D92 defect returning."
    ).toBe(true);
  });

  it("no longer asserts MAANTA has no offline capability", () => {
    // It had one from 2026-09-03. A docblock that contradicts the worker is how
    // the next author reintroduces the gap believing it is still true.
    expect(
      /MAANTA has \*\*no offline capability\*\*/.test(
        readFileSync(path.join(APP, "components", "ui", "states.tsx"), "utf8")
      ),
      "states.tsx still says MAANTA has no offline capability. sw.js now has a\n" +
        "fetch handler and caches the code screen."
    ).toBe(false);
  });
});
