import { test, expect, type Page } from "@playwright/test";

/**
 * D235 in a real browser — the claimed-code screen with the network cut.
 *
 * ## Why this exists on top of the unit suites
 *
 * `service-worker-behaviour.test.ts` executes `sw.js` in Node against a fake
 * Cache Storage. That proves the strategy's logic. It cannot prove the things
 * only a browser has: worker install/activate/claim, real navigation requests,
 * real Cache Storage, and a real offline condition. Those are exactly where a
 * service worker usually goes wrong, so they are what this covers.
 *
 * The origin is a tiny static harness serving the REAL `public/sw.js` with
 * stand-in pages. That keeps the suite credential-free and runnable anywhere —
 * and it means what is under test is the shipped worker, not a copy.
 *
 * ## What this still does NOT prove
 *
 * That the real Next.js `/my-deals` document renders a usable code offline for
 * a signed-in shopper. That needs a deployed app and a session and belongs to
 * `e2e/golden-path.spec.ts`, which self-skips without them. Do not cite this
 * suite as counter-level proof.
 */

/** The worker must be installed AND controlling the page before anything else. */
async function activateWorker(page: Page) {
  await page.goto("/my-deals");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // `clients.claim()` can land after the first load; a reload guarantees the
  // document itself was served through the worker.
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

test.describe("the worker keeps a claimed code readable with no network", () => {
  test("serves the cached code screen after the network drops", async ({ page, context }) => {
    await activateWorker(page);
    await expect(page.locator("#code")).toHaveText("4 8 2 9 1 6");

    await context.setOffline(true);
    await page.reload();

    // The counter scenario, end to end: signal gone, code still on screen.
    await expect(
      page.locator("#code"),
      "the code screen was not served from cache with the network down — this is\n" +
        "the failure D235 exists to prevent, and the reason the unit suites are\n" +
        "not sufficient on their own"
    ).toHaveText("4 8 2 9 1 6");
  });

  test("shows the offline page for the feed rather than a stale one", async ({ page, context }) => {
    await activateWorker(page);
    await page.goto("/feed");
    await expect(page.locator("#marker")).toHaveText("LIVE FEED");

    await context.setOffline(true);
    await page.goto("/feed");

    await expect(
      page.locator("#marker"),
      "the feed was served from cache. A stale feed advertises deals that may be\n" +
        "gone — the promise D92 removed from the offline banner."
    ).toHaveText("OFFLINE PAGE");
  });

  test("prefers the live page whenever the network is up", async ({ page, context }) => {
    await activateWorker(page);
    await context.setOffline(true);
    await page.reload();
    await context.setOffline(false);
    await page.reload();

    // Cache-first would strand a shopper who HAS signal on a stale ticket.
    const served = await page.evaluate(async () => {
      const res = await fetch("/my-deals", { cache: "no-store" });
      return res.headers.get("cache-control");
    });
    expect(served, "the live document was not fetched from the network").toBe("no-store");
  });
});

test.describe("the worker stays out of the way of live state", () => {
  test("never serves /api/ from cache", async ({ page, context }) => {
    await activateWorker(page);
    // Prime: if /api/ were cacheable, this is where it would land.
    await page.evaluate(() => fetch("/api/healthz").then((r) => r.json()));

    await context.setOffline(true);
    const failed = await page.evaluate(() =>
      fetch("/api/healthz")
        .then(() => "resolved")
        .catch(() => "rejected")
    );

    expect(
      failed,
      "an /api/ request resolved with the network down, so it was served from\n" +
        "cache. A stale wallet balance or queue position is worse than an error."
    ).toBe("rejected");
  });
});

test.describe("sign-out clears the cached codes", () => {
  test("purges the page cache on the message the sign-out button posts", async ({
    page,
    context,
  }) => {
    await activateWorker(page);
    await expect(page.locator("#code")).toHaveText("4 8 2 9 1 6");

    const cachedBefore = await page.evaluate(async () => {
      const keys = await caches.keys();
      return keys.filter((k) => k.startsWith("maanta-pages-"));
    });
    expect(cachedBefore.length, "the page cache was never created").toBeGreaterThan(0);

    // Exactly what `purgeCachedPages()` posts.
    await page.evaluate(async () => {
      navigator.serviceWorker.controller?.postMessage({ type: "maanta-purge-pages" });
      // Give the worker a turn to run caches.delete before we assert.
      await new Promise((r) => setTimeout(r, 300));
    });

    const cachedAfter = await page.evaluate(async () => {
      const keys = await caches.keys();
      return keys.filter((k) => k.startsWith("maanta-pages-"));
    });
    expect(
      cachedAfter,
      "the cached codes survived the purge. Cache Storage is scoped to the origin,\n" +
        "not the user, so on a shared handset the next person could reload into the\n" +
        "previous shopper's tickets."
    ).toEqual([]);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#marker")).toHaveText("OFFLINE PAGE");
  });
});
