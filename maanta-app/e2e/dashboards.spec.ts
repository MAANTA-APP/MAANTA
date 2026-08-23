import { test, expect, type Page } from "@playwright/test";

/**
 * Dashboards must contain a DASHBOARD — not merely answer HTTP 200 (D164).
 *
 * This suite exists because of a specific, documented failure. On 2026-08-23 a
 * full-role production E2E scored `/founder` as passing on exactly two signals:
 * the response was 200, and the `<h1>` said "Founder dashboard". Both were true
 * of a page that was **completely broken** — the Claims metric queried a column
 * that had never existed, its error tripped the page's read-failure guard, and
 * every visit rendered "Could not load the dashboard." for days.
 *
 * The lesson generalises past that one bug: a status code and a heading are
 * emitted by the error state too, so any check built from them can only ever
 * prove the route resolves — never that it works. The assertions below are
 * therefore about CONTENT: a real KPI, a real number, and the explicit absence
 * of the read-failure component.
 *
 * REQUIRES A LIVE ENV, same posture as golden-path.spec.ts:
 *   - E2E_BASE_URL         deployed app origin
 *   - E2E_ADMIN_STORAGE    Playwright storageState JSON for a signed-in ADMIN
 *                          (admin reaches /founder too, so one account covers
 *                          both surfaces)
 * When unset the suite SKIPS — never a false green.
 */
const BASE_URL = process.env.E2E_BASE_URL;
const ADMIN_STORAGE = process.env.E2E_ADMIN_STORAGE;

const ready = Boolean(BASE_URL && ADMIN_STORAGE);

function parseStorage(raw: string) {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") ? JSON.parse(trimmed) : trimmed;
}

/** The copy the read-failure component renders. Its presence is a failure. */
const READ_ERROR = /read error, not zeroed metrics|Could not load/i;

async function assertNoReadError(page: Page, surface: string) {
  await expect(
    page.getByText(READ_ERROR),
    `${surface} rendered its read-failure state — the page is broken, not empty`
  ).toHaveCount(0);
}

test.describe("dashboards render content, not just a status code", () => {
  test.skip(
    !ready,
    "Set E2E_BASE_URL + E2E_ADMIN_STORAGE (live Supabase + Clerk test env) to run."
  );

  test("/admin shows real operations KPIs", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: parseStorage(ADMIN_STORAGE!) });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });

    await assertNoReadError(page, "/admin");

    // The loop section and its cards must actually be present.
    await expect(page.getByText("The loop (7 days)")).toBeVisible();
    await expect(page.getByText(/^Verified \(7d\)$/)).toBeVisible();
    await expect(page.getByText(/^Success fees \(7d\)$/)).toBeVisible();
    // The Claims card is labelled dynamically while tracking is young (D164),
    // so match either honest form rather than pinning one.
    await expect(
      page.getByText(/^Claims( \(7d\)| since tracking began)?$/).first()
    ).toBeVisible();

    // A KPI must carry a NUMBER. A heading alone is what the broken page had.
    await expect(page.getByText(/^\d[\d,]*$/).first()).toBeVisible();

    // Supply section proves the page rendered past the first fold of metrics.
    await expect(page.getByText("Active merchants")).toBeVisible();

    await ctx.close();
  });

  test("/founder shows real dashboard KPIs", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: parseStorage(ADMIN_STORAGE!) });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/founder`, { waitUntil: "domcontentloaded" });

    // The exact regression: this page returned 200 with the right heading for
    // days while showing nothing but an error card.
    await assertNoReadError(page, "/founder");

    await expect(page.getByText("Total users")).toBeVisible();
    await expect(page.getByText(/^Verified \(7d\)$/)).toBeVisible();
    await expect(
      page.getByText(/^Claims( \(7d\)| since tracking began)?$/).first()
    ).toBeVisible();
    await expect(page.getByText(/^\d[\d,]*$/).first()).toBeVisible();

    await ctx.close();
  });

  test("a Claims card that cannot cover 7 days says so, rather than implying it", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: parseStorage(ADMIN_STORAGE!) });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });

    const partialLabel = page.getByText("Claims since tracking began");
    if ((await partialLabel.count()) > 0) {
      // While the window is not yet covered, the caveat must be on screen —
      // a small number must not read as low demand when it means short history.
      await expect(page.getByText(/only been recorded since/i)).toBeVisible();
    } else {
      // Once it IS covered, the plain label is correct and needs no caveat.
      await expect(page.getByText(/^Claims \(7d\)$/)).toBeVisible();
      await expect(page.getByText(/only been recorded since/i)).toHaveCount(0);
    }

    await ctx.close();
  });
});
