import { test, expect, type Page } from "@playwright/test";

/**
 * Golden-path browser E2E (tracker E14 / audit PR #35):
 *   shopper browse → claim → ticket → merchant verify → KES 30 fee/arrears →
 *   wallet, plus a negative (invalid/expired code) case.
 *
 * The RPC-level money invariants are already gated in CI by
 * supabase/tests/golden_path_test.sql + verify_redemption_money_path_test.sql;
 * this proves the SAME loop through the real frozen UI, and asserts the P12
 * "Collect from shopper" line on the success takeover.
 *
 * REQUIRES A LIVE ENV (human/ops task — see docs/ops/e2e-golden-path.md):
 *   - E2E_BASE_URL              deployed app origin (e.g. https://maanta.app)
 *   - E2E_SHOPPER_STORAGE       Playwright storageState JSON for a signed-in
 *                               shopper (Clerk test user), path or inline
 *   - E2E_MERCHANT_STORAGE      storageState for a signed-in verifying merchant
 *   - E2E_DEAL_PATH             path to a claimable seeded deal (default: /deals)
 * When these are unset the whole suite SKIPS — never a false green.
 */
const BASE_URL = process.env.E2E_BASE_URL;
const SHOPPER_STORAGE = process.env.E2E_SHOPPER_STORAGE;
const MERCHANT_STORAGE = process.env.E2E_MERCHANT_STORAGE;

const ready = Boolean(BASE_URL && SHOPPER_STORAGE && MERCHANT_STORAGE);

/**
 * Storage state may be a file PATH (local dev) or raw JSON (a CI secret).
 * `browser.newContext({ storageState })` treats a string as a path, so parse
 * inline JSON into an object first and pass paths through unchanged.
 */
function parseStorage(raw: string) {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") ? JSON.parse(trimmed) : trimmed;
}

test.describe("golden path (browser)", () => {
  test.skip(
    !ready,
    "Set E2E_BASE_URL + E2E_SHOPPER_STORAGE + E2E_MERCHANT_STORAGE (live Supabase + Clerk test env) to run."
  );

  test("shopper claims a deal and sees a 6-digit code ticket", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: parseStorage(SHOPPER_STORAGE!) });
    const page = await ctx.newPage();
    const code = await claimFirstDeal(page);
    // A claimed ticket surfaces a formatted 6-digit code ("482 913").
    expect(code).toMatch(/^\d{3}\s?\d{3}$/);
    await ctx.close();
  });

  test("merchant verifies the code: fee disclosed, then COLLECT FROM SHOPPER + Verified", async ({
    browser,
  }) => {
    // Shopper claims to produce a fresh code.
    const shopperCtx = await browser.newContext({ storageState: parseStorage(SHOPPER_STORAGE!) });
    const shopperPage = await shopperCtx.newPage();
    const code = (await claimFirstDeal(shopperPage)).replace(/\s/g, "");
    await shopperCtx.close();

    // Merchant resolves → discloses the KES 30 fee → confirms.
    const merchantCtx = await browser.newContext({ storageState: parseStorage(MERCHANT_STORAGE!) });
    const page = await merchantCtx.newPage();
    await page.goto("/merchant/redeem");
    await enterCode(page, code);

    // Step 2 — fee disclosure (charges nothing yet).
    const confirm = page.getByRole("button", { name: /Confirm redemption/i });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(/KES\s*30/);
    await confirm.click();

    // Step 3 — success takeover. P12: the cashier is told what to collect.
    await expect(page.getByText("Verified")).toBeVisible();
    // Scope to the collect block (label + amount are separate nodes) and assert
    // the AMOUNT is shown there — so this fails if P12 renders the label with no
    // number, and doesn't get satisfied by the separate KES 30 fee line.
    const collectBlock = page
      .locator("div")
      .filter({ hasText: /Collect from shopper/i })
      .last();
    await expect(collectBlock.getByText(/KES\s*[\d,]+/)).toBeVisible();
    await expect(page.getByText(/success fee/i)).toBeVisible();
    await merchantCtx.close();
  });

  test("negative: an invalid code is rejected with no fee", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: parseStorage(MERCHANT_STORAGE!) });
    const page = await ctx.newPage();
    await page.goto("/merchant/redeem");
    await enterCode(page, "000000");
    await expect(page.getByText(/Code not valid/i)).toBeVisible();
    await expect(page.getByText(/No fee was charged/i)).toBeVisible();
    await ctx.close();
  });
});

/** Claim the first deal on the shopper feed and return the ticket code. */
async function claimFirstDeal(page: Page): Promise<string> {
  // Default to the declared shopper entry route `/deals` (redirects to the
  // feed); override with E2E_DEAL_PATH to go straight to a seeded deal.
  await page.goto(process.env.E2E_DEAL_PATH ?? "/deals");
  if (!process.env.E2E_DEAL_PATH) {
    await page.getByRole("link", { name: /You pay/i }).first().click();
  }
  await page.getByRole("button", { name: /^Claim/i }).click();
  const codeEl = page.getByText(/^\d{3}\s?\d{3}$/).first();
  await expect(codeEl).toBeVisible();
  return (await codeEl.textContent())?.trim() ?? "";
}

/** Type a 6-digit code into the merchant redeem keypad. */
async function enterCode(page: Page, code: string): Promise<void> {
  for (const digit of code.slice(0, 6)) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}
