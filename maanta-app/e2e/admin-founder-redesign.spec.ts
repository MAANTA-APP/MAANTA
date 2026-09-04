import { test, expect, devices, type Browser, type Page } from "@playwright/test";

/**
 * Browser proof for the 2026-09-03 admin / founder redesign.
 *
 * The founder's acceptance list, verbatim: an iPhone-sized Admin navigation
 * run, Action Queue → record drill-down, Merchant 360, the Founder command
 * centre, co-founder access, and the authorization boundaries. Unit tests
 * (1,850+) prove the rules; only a browser proves the shell.
 *
 * REQUIRES A LIVE, NON-PRODUCTION ENV (same posture as dashboards.spec.ts):
 *   - E2E_BASE_URL            deployed app origin, never maanta.app
 *   - E2E_ADMIN_STORAGE       Playwright storageState for a signed-in ADMIN
 *   - E2E_COFOUNDER_STORAGE   optional: storageState for a signed-in COFOUNDER.
 *                             Without it the co-founder checks skip, and say so.
 * When E2E_BASE_URL or the admin state is unset the suite SKIPS — never a
 * false green.
 *
 * Read-only throughout: no button that writes is pressed. The drill-down
 * stops at the record; approving, releasing or blocking is the operator's.
 */
const BASE_URL = process.env.E2E_BASE_URL;
const ADMIN_STORAGE = process.env.E2E_ADMIN_STORAGE;
const COFOUNDER_STORAGE = process.env.E2E_COFOUNDER_STORAGE;
const ready = Boolean(BASE_URL && ADMIN_STORAGE);

function parseStorage(raw: string) {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") ? JSON.parse(trimmed) : trimmed;
}

const READ_ERROR = /read error, not zeroed metrics|Could not load/i;
const IPHONE = devices["iPhone 13"];

/**
 * Vercel's "Protection Bypass for Automation" secret. The `maanta-nuia`
 * project has Vercel Authentication on every preview (`all_except_custom_domains`,
 * read 2026-09-04), so without it a signed-out context never reaches MAANTA:
 * the five boundary tests would land on Vercel's sign-in wall and fail for
 * the wrong reason, and a signed-in context passes only because the captured
 * storage state happens to carry the Vercel cookie. Optional — unset for a
 * local stack or an unprotected target — and applied to every context so the
 * two halves of the suite are tested through the same door.
 */
const VERCEL_BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

async function iphone(browser: Browser, storage?: string) {
  return browser.newContext({
    ...IPHONE,
    ...(storage ? { storageState: parseStorage(storage) } : {}),
    ...(VERCEL_BYPASS
      ? { extraHTTPHeaders: { "x-vercel-protection-bypass": VERCEL_BYPASS } }
      : {}),
  });
}

async function assertNoReadError(page: Page, surface: string) {
  await expect(
    page.getByText(READ_ERROR),
    `${surface} rendered its read-failure state`
  ).toHaveCount(0);
}

const ADMIN_SECTIONS = [
  "Home",
  "Action queue",
  "Merchants",
  "Shoppers",
  "Deals",
  "Visits & redemptions",
  "Support",
  "Operations",
  "Audit",
];

test.describe("authorization boundaries (no session)", () => {
  test.skip(!BASE_URL, "Set E2E_BASE_URL to run.");

  for (const route of ["/admin", "/admin/queue", "/admin/merchants", "/founder", "/founder/reports"]) {
    test(`${route} sends a signed-out visitor to sign in`, async ({ browser }) => {
      const ctx = await iphone(browser);
      const page = await ctx.newPage();
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login/);
      await ctx.close();
    });
  }
});

test.describe("admin console at iPhone size", () => {
  test.skip(!ready, "Set E2E_BASE_URL + E2E_ADMIN_STORAGE (live non-production env) to run.");

  test("the drawer lists the nine task sections in order, then System, then Founder", async ({ browser }) => {
    const ctx = await iphone(browser, ADMIN_STORAGE);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await assertNoReadError(page, "/admin");

    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.locator("nav").filter({ hasText: "Action queue" });
    const links = await drawer.getByRole("link").allInnerTexts();
    const labels = links.map((t) => t.replace(/\s*\(opens in a new tab\)\s*$/, "").trim());
    expect(labels.slice(0, ADMIN_SECTIONS.length)).toEqual(ADMIN_SECTIONS);
    expect(labels.indexOf("Billing")).toBeGreaterThan(labels.indexOf("Audit"));
    expect(labels.indexOf("Founder")).toBeGreaterThan(labels.indexOf("Resources"));
    expect(labels).not.toContain("Approvals");
    expect(labels).not.toContain("Customers");

    // No horizontal scroll on the page body at 390px.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "page body scrolls horizontally").toBeLessThanOrEqual(1);
    await ctx.close();
  });

  test("Home leads with what needs attention and links to the full queue", async ({ browser }) => {
    const ctx = await iphone(browser, ADMIN_STORAGE);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await assertNoReadError(page, "/admin");
    await expect(page.getByRole("heading", { name: "Needs attention right now" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Full action queue/ })).toBeVisible();
    // Money and evidence are still there, below.
    await expect(page.getByText("Net success fees").first()).toBeVisible();
    await ctx.close();
  });

  test("Action Queue → record: the first item opens a record, not a list", async ({ browser }) => {
    const ctx = await iphone(browser, ADMIN_STORAGE);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/admin/queue`, { waitUntil: "domcontentloaded" });
    await assertNoReadError(page, "/admin/queue");
    await expect(page.getByRole("heading", { name: "Action queue" })).toBeVisible();

    const items = page.locator("main a[href^='/admin/']").filter({ hasText: /Urgent|Attention/ });
    const count = await items.count();
    // An empty queue is not a pass. D240 reads this suite's 12-of-12 as evidence
    // that the drill-down was exercised, so a run that could not exercise it must
    // say so in red rather than annotate itself green (D256). The environment is
    // read-only, so the fix is on the environment: give the preview one action
    // item — a pending shop is enough — and re-dispatch.
    expect(
      count,
      "Action queue is empty on this environment, so the drill-down could not be exercised. Seed one action item (a pending merchant will do) on the target and re-run; do not count this suite as 12/12 without it."
    ).toBeGreaterThan(0);
    const href = await items.first().getAttribute("href");
    await items.first().click();
    await page.waitForLoadState("domcontentloaded");
    // A record, or the review surface the item names — never an unrelated list.
    // Bare `/admin/redemptions` is a deliberate destination, not a miss: D250
    // sends a fraud type the page has no filter for to the unfiltered list on
    // purpose, so the assertion accepts it (D257).
    expect(href).toMatch(
      /^\/admin\/(merchants\/[0-9a-f-]+|redemptions\/[0-9a-f-]+|redemptions(\?reason=[a-z_]+)?$|operations)/
    );
    await assertNoReadError(page, href ?? "record");
    await ctx.close();
  });

  test("Merchant 360 renders its eight sections for the first merchant", async ({ browser }) => {
    const ctx = await iphone(browser, ADMIN_STORAGE);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/admin/merchants`, { waitUntil: "domcontentloaded" });
    await assertNoReadError(page, "/admin/merchants");
    // A merchant RECORD link (a UUID), never the directory's own "Onboard a
    // shop" link at /admin/merchants/new — the first run of this proof picked
    // that one up and landed on the onboarding form.
    const hrefs = await page.locator("main a[href^='/admin/merchants/']").evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? "")
    );
    const recordHref = hrefs.find((h) => /^\/admin\/merchants\/[0-9a-f-]{36}$/.test(h));
    expect(recordHref, "the merchants directory lists no merchant record link").toBeTruthy();
    const first = page.locator(`main a[href='${recordHref}']`).first();
    await expect(first).toBeVisible();
    await first.click();
    await page.waitForLoadState("domcontentloaded");
    await assertNoReadError(page, "merchant 360");
    for (const section of ["Identity", "Staff seats", "Deals", "Shopper activity", "Economics", "Support", "Admin actions", "Audit"]) {
      await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
    // The vocabulary, and never a bare fraction.
    await expect(page.getByText(/Claim allocation/).first()).toBeVisible();
    // The honest absence is stated, not drawn.
    await expect(page.getByText(/Not available from the console, by design/)).toBeVisible();
    await ctx.close();
  });

  test("Visits & redemptions shows the five columns and the redeemed-only money note", async ({ browser }) => {
    const ctx = await iphone(browser, ADMIN_STORAGE);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/admin/visits`, { waitUntil: "domcontentloaded" });
    await assertNoReadError(page, "/admin/visits");
    for (const col of ["1. Claim", "2. Arrival / check-in", "3. Queue", "4. Verification", "5. Redemption"]) {
      await expect(page.getByText(col)).toBeVisible();
    }
    await expect(page.getByText(/The only column where the success fee is charged/)).toBeVisible();
    await ctx.close();
  });
});

test.describe("founder command centre", () => {
  test.skip(!ready, "Set E2E_BASE_URL + E2E_ADMIN_STORAGE (live non-production env) to run.");

  test("states the verdict, the clocks and the next move for an admin", async ({ browser }) => {
    const ctx = await iphone(browser, ADMIN_STORAGE);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/founder`, { waitUntil: "domcontentloaded" });
    await assertNoReadError(page, "/founder");
    await expect(page.getByRole("heading", { name: "Founder command centre" })).toBeVisible();
    await expect(page.getByText("External field validation").first()).toBeVisible();
    await expect(page.getByText(/Ladder — genuine verified redemptions/)).toBeVisible();
    await expect(page.getByText(/Kill criterion/)).toBeVisible();
    await expect(page.getByText(/Claim → walk-in tripwire/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Next move" })).toBeVisible();
    // An admin gets the console link in the header.
    await expect(page.getByRole("link", { name: "Admin console" })).toBeVisible();
    // Reports renders under the founder shell, not a redirect into admin.
    await page.goto(`${BASE_URL}/founder/reports`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/founder\/reports/);
    await assertNoReadError(page, "/founder/reports");
    await ctx.close();
  });

  test("a co-founder sees the numbers and no link into a wall", async ({ browser }) => {
    test.skip(!COFOUNDER_STORAGE, "Set E2E_COFOUNDER_STORAGE to prove the co-founder boundary.");
    const ctx = await iphone(browser, COFOUNDER_STORAGE);
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/founder`, { waitUntil: "domcontentloaded" });
    await assertNoReadError(page, "/founder (cofounder)");
    await expect(page.getByRole("heading", { name: "Founder command centre" })).toBeVisible();
    await expect(page.locator("a[href^='/admin']")).toHaveCount(0);
    await expect(page.getByText(/which this role cannot open|admin console, which this role does not open/).first()).toBeVisible();

    // /founder/reports must NOT bounce them (D231).
    await page.goto(`${BASE_URL}/founder/reports`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/founder\/reports/);

    // And the admin console refuses them: back to the product root, not a blank page.
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/admin/);
    await ctx.close();
  });
});
