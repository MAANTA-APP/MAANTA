import { test, expect } from "@playwright/test";
import {
  asRole,
  claimFirstDeal,
  enterCode,
  roleAvailable,
  shopperNav,
  skipReason,
} from "./helpers/roles";

/**
 * Golden-path browser E2E (tracker E14 / audit PR #35):
 *   shopper feed/browse/map → claim → ticket → merchant verify → KES 30
 *   fee/arrears → wallet, plus a negative (invalid/expired code) case.
 *
 * The RPC-level money invariants are already gated in CI by
 * supabase/tests/golden_path_test.sql + verify_redemption_money_path_test.sql;
 * this proves the SAME loop through the real frozen UI, and asserts the P12
 * "Collect from shopper" line on the success takeover.
 *
 * REQUIRES A LIVE ENV (human/ops task — see docs/ops/e2e-golden-path.md):
 *   - E2E_BASE_URL              deployed NON-PROD app origin
 *   - E2E_SHOPPER_STORAGE       storageState for a signed-in shopper
 *   - E2E_MERCHANT_STORAGE      storageState for a signed-in merchant OWNER
 *   - E2E_DEAL_PATH             path to a claimable seeded deal (default: /deals)
 * When these are unset the whole suite SKIPS — never a false green.
 * Per-role permission coverage lives in role-access.spec.ts.
 */
const ready = roleAvailable("shopper") && roleAvailable("owner");

test.describe("golden path (browser)", () => {
  test.skip(!ready, skipReason("shopper", "owner"));

  test("shopper reaches feed, browse and map", async ({ browser }) => {
    await asRole(browser, "shopper", async (page) => {
      await page.goto("/feed");
      // The shopper shell is the proof of "signed in as a shopper": five tabs.
      await expect(shopperNav(page).getByRole("link")).toHaveText([
        "Feed",
        "Browse",
        "Map",
        "Deals",
        "You",
      ]);

      await shopperNav(page).getByRole("link", { name: "Browse" }).click();
      await expect(page).toHaveURL(/\/browse/);

      await shopperNav(page).getByRole("link", { name: "Map" }).click();
      await expect(page).toHaveURL(/\/map/);
    });
  });

  test("shopper claims a deal and sees a 6-digit code ticket", async ({ browser }) => {
    await asRole(browser, "shopper", async (page) => {
      const code = await claimFirstDeal(page);
      // A claimed ticket surfaces a formatted 6-digit code ("482 913").
      expect(code).toMatch(/^\d{3}\s?\d{3}$/);
    });
  });

  test("merchant verifies the code: fee disclosed, then COLLECT FROM SHOPPER + Redeemed", async ({
    browser,
  }) => {
    // Shopper claims to produce a fresh code.
    const code = (
      await asRole(browser, "shopper", (page) => claimFirstDeal(page))
    ).replace(/\s/g, "");

    // Merchant resolves → discloses the KES 30 fee → confirms.
    await asRole(browser, "owner", async (page) => {
      await page.goto("/merchant/redeem");
      await enterCode(page, code);

      // Step 2 — fee disclosure (charges nothing yet).
      const confirm = page.getByRole("button", { name: /Confirm redemption/i });
      await expect(confirm).toBeVisible();
      await expect(confirm).toContainText(/KES\s*30/);
      await confirm.click();

      // Step 3 — success takeover. P12: the cashier is told what to collect.
      await expect(page.getByText("Redeemed")).toBeVisible();
      // Scope to the collect block (label + amount are separate nodes) and assert
      // the AMOUNT is shown there — so this fails if P12 renders the label with no
      // number, and doesn't get satisfied by the separate KES 30 fee line.
      const collectBlock = page
        .locator("div")
        .filter({ hasText: /Collect from shopper/i })
        .last();
      await expect(collectBlock.getByText(/KES\s*[\d,]+/)).toBeVisible();
      await expect(page.getByText(/success fee/i)).toBeVisible();
    });
  });

  test("negative: an invalid code is rejected with no fee", async ({ browser }) => {
    await asRole(browser, "owner", async (page) => {
      await page.goto("/merchant/redeem");
      await enterCode(page, "000000");
      await expect(page.getByText(/Code not valid/i)).toBeVisible();
      await expect(page.getByText(/No fee was charged/i)).toBeVisible();
    });
  });
});
