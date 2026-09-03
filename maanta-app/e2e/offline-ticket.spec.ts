import { test, expect } from "@playwright/test";

/**
 * D235's closing proof — the founder's condition, stated 2026-09-03:
 *
 *   Against a real deployed Next.js build, an authenticated shopper session and
 *   a genuine established claim, `/my-deals` must render enough persisted
 *   ticket information after connectivity loss to allow the shopper to present
 *   the six-digit code at the counter.
 *
 * Nothing else closes the row. Two suites already exist and neither is this:
 * `src/lib/__tests__/service-worker-behaviour.test.ts` runs `sw.js` in Node,
 * and `e2e-sw/service-worker-offline.spec.ts` runs it in Chromium against a
 * static harness serving stand-in HTML. Both prove the worker's fetch
 * strategy. Neither proves the real document survives the cache round trip
 * with a real session, which is the only thing a shopper at a till cares
 * about.
 *
 * ## The two risks only this test can see
 *
 *  1. **Hydration.** The cached document is a Next.js SSR payload. If anything
 *     the ticket row needs is filled in by a client fetch rather than carried
 *     in the HTML, the offline reload renders an empty or broken row while the
 *     unit suites stay green.
 *  2. **The redirect.** `/my-deals` calls `getAppUser()` and redirects to
 *     `/login?next=/my-deals` when it returns null. If a redirect response is
 *     ever what lands in the cache, the shopper reloads at the counter into a
 *     login page instead of their code. That is a worse failure than no cache
 *     at all, and it is invisible to a harness that never authenticates.
 *
 * ## Requirements
 *
 *   E2E_BASE_URL           deployed app origin
 *   E2E_SHOPPER_STORAGE    storageState for a signed-in shopper who holds at
 *                          least one ACTIVE claim (path, or inline JSON)
 *
 * Unset → the suite skips, exactly like `golden-path.spec.ts`, so it is never a
 * false green. Set but with no active ticket → it FAILS rather than skips: a
 * silent pass on an empty account is the specific way this proof could be
 * faked.
 *
 * Unlike the golden path this spec claims nothing and charges nothing — it only
 * reads a ticket that already exists, so it is safe to run repeatedly and
 * cannot incur a KES 30 success fee.
 */

const BASE_URL = process.env.E2E_BASE_URL;
const SHOPPER_STORAGE = process.env.E2E_SHOPPER_STORAGE;
const ready = Boolean(BASE_URL && SHOPPER_STORAGE);

/** Storage state may be a file path (local) or raw JSON (a CI secret). */
function storageState(raw: string): string | Record<string, unknown> {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") ? JSON.parse(trimmed) : raw;
}

const SIX_DIGITS = /\b\d{3}\s?\d{3}\b/;

test.describe("D235 — a real claimed code survives connectivity loss", () => {
  test.skip(!ready, "needs E2E_BASE_URL and E2E_SHOPPER_STORAGE — see docs/ops/e2e-golden-path.md");

  test("the six-digit code is still presentable at the counter with the network cut", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      storageState: storageState(SHOPPER_STORAGE!),
    });
    const page = await context.newPage();

    // ---- online: establish what the shopper would show ----
    await page.goto("/my-deals");
    await expect(
      page,
      "the shopper storage state is not signed in — /my-deals redirected to login"
    ).not.toHaveURL(/\/login/);

    const onlineBody = await page.locator("body").innerText();
    expect(
      SIX_DIGITS.test(onlineBody),
      "no six-digit code on /my-deals while ONLINE. This suite must not skip its\n" +
        "way to green: provision a shopper who holds at least one active claim,\n" +
        "then re-run. An empty account cannot prove D235."
    ).toBe(true);
    const code = onlineBody.match(SIX_DIGITS)![0];

    // The worker caches on the first successful load; give it the moment it
    // needs to take control before the network goes.
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
      timeout: 15_000,
    });
    await page.reload();

    // ---- offline: the counter ----
    await context.setOffline(true);
    await page.reload();

    await expect(
      page,
      "the offline reload landed on the login page. A cached redirect is worse\n" +
        "than no cache at all — the shopper is at the till with no code."
    ).not.toHaveURL(/\/login/);

    const offlineBody = await page.locator("body").innerText();

    expect(
      offlineBody,
      "the offline document does not carry the six-digit code. The worker's fetch\n" +
        "strategy is proven elsewhere; this is the failure that strategy cannot\n" +
        "catch — a cached SSR payload whose content depends on a live session."
    ).toContain(code);

    // Enough to present, not merely the digits: the shopper has to be able to
    // tell staff which shop and which deal the code belongs to.
    expect(
      offlineBody.replace(/\s+/g, " ").length,
      "the offline page rendered almost nothing around the code"
    ).toBeGreaterThan(40);

    // And it must say it is a saved copy, so nobody reads a cached page as live.
    await expect(
      page.getByText(/Saved copy/i),
      "TicketOfflineNotice did not render offline, so a cached page is passing as\n" +
        "a live one"
    ).toBeVisible();

    await context.close();
  });
});
