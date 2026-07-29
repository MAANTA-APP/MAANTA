import { test, expect, type Page } from "@playwright/test";
import {
  asRole,
  enterCode,
  expectMerchantNav,
  merchantNav,
  roleAvailable,
  skipReason,
} from "./helpers/roles";

/**
 * Role & permission coverage across the seven MAANTA personas.
 *
 * Deliberately a handful of golden assertions per role rather than an
 * exhaustive matrix: what the user SEES (nav items, permission notices,
 * where a guard sends them), never implementation details. Each describe block
 * skips independently, so provisioning one more role storage state buys real
 * extra coverage without touching this file.
 *
 * UI hiding is clarity only — the server guards are the authority and are
 * covered by the vitest route tests plus supabase/tests/*.sql. Here we assert
 * that the two AGREE: nothing visible that the API would reject, and nothing
 * silently reachable that the nav claims is gone.
 */

/** A protected route must bounce a caller who isn't allowed in. */
async function expectRedirectedAwayFrom(page: Page, path: string) {
  await page.goto(path);
  await expect(page).not.toHaveURL(new RegExp(`${path}(/|\\?|$)`));
}

test.describe("merchant owner", () => {
  test.skip(!roleAvailable("owner"), skipReason("owner"));

  test("keeps the full console: all four tabs, deals, wallet and staff", async ({
    browser,
  }) => {
    await asRole(browser, "owner", async (page) => {
      await page.goto("/merchant/redeem");
      await expectMerchantNav(page, ["Redeem", "Deals", "Wallet", "More"]);

      // Deals: the create entry point is present for an owner.
      await merchantNav(page).getByRole("link", { name: "Deals" }).click();
      await expect(page).toHaveURL(/\/merchant\/deals/);
      await expect(page.getByRole("link", { name: "New deal" }).first()).toBeVisible();

      // Wallet: the one amber action is present.
      await merchantNav(page).getByRole("link", { name: "Wallet" }).click();
      await expect(page).toHaveURL(/\/merchant\/wallet/);
      await expect(page.getByRole("link", { name: /Top up wallet/i })).toBeVisible();

      // More: owner-only staff roster and plan & billing.
      await merchantNav(page).getByRole("link", { name: "More" }).click();
      await expect(page.getByRole("link", { name: "Staff" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Plan & billing" })).toBeVisible();
    });
  });

  test("can open the top-up flow", async ({ browser }) => {
    await asRole(browser, "owner", async (page) => {
      await page.goto("/merchant/topup");
      await expect(page.getByRole("heading", { name: "Top up" })).toBeVisible();
    });
  });
});

test.describe("merchant staff — verify only", () => {
  test.skip(!roleAvailable("staffVerifyOnly"), skipReason("staffVerifyOnly"));

  test("sees a verify-focused shell: Redeem + More only", async ({ browser }) => {
    await asRole(browser, "staffVerifyOnly", async (page) => {
      await page.goto("/merchant/redeem");
      await expectMerchantNav(page, ["Redeem", "More"]);
    });
  });

  test("can still verify a code (the permission they DO have)", async ({ browser }) => {
    await asRole(browser, "staffVerifyOnly", async (page) => {
      await page.goto("/merchant/redeem");
      // The keypad renders (not the permission notice) — an invalid code is the
      // safe way to prove it works without charging a real KES 30 fee.
      await enterCode(page, "000000");
      await expect(page.getByText(/Code not valid/i)).toBeVisible();
      await expect(page.getByText(/No fee was charged/i)).toBeVisible();
    });
  });

  test("has no wallet, deals or plan entry points", async ({ browser }) => {
    await asRole(browser, "staffVerifyOnly", async (page) => {
      await page.goto("/merchant/more");
      const nav = merchantNav(page);
      await expect(nav.getByRole("link", { name: "Wallet" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Deals" })).toHaveCount(0);
      // More lists only what they can use — no Plan & billing, no Staff roster.
      await expect(page.getByRole("link", { name: "Plan & billing" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Support" })).toBeVisible();
    });
  });

  test("deep links into gated surfaces explain, never dead-end", async ({ browser }) => {
    await asRole(browser, "staffVerifyOnly", async (page) => {
      await page.goto("/merchant/topup");
      await expect(page.getByText(/don't have permission to top up/i)).toBeVisible();

      await page.goto("/merchant/deals/new");
      await expect(page.getByText(/don't have permission to create deals/i)).toBeVisible();

      await page.goto("/merchant/plan/upgrade");
      await expect(page.getByText(/don't have permission to change the plan/i)).toBeVisible();

      await page.goto("/merchant/staff");
      await expect(page.getByText(/Only the shop owner can manage staff/i)).toBeVisible();
    });
  });

  test("cannot reach admin, founder or agent consoles", async ({ browser }) => {
    await asRole(browser, "staffVerifyOnly", async (page) => {
      await expectRedirectedAwayFrom(page, "/admin");
      await expectRedirectedAwayFrom(page, "/founder");
      await expectRedirectedAwayFrom(page, "/agent");
    });
  });
});

test.describe("merchant staff — verify + deals", () => {
  test.skip(!roleAvailable("staffDeals"), skipReason("staffDeals"));

  test("gains the Deals tab but still no Wallet", async ({ browser }) => {
    await asRole(browser, "staffDeals", async (page) => {
      await page.goto("/merchant/redeem");
      await expectMerchantNav(page, ["Redeem", "Deals", "More"]);

      await merchantNav(page).getByRole("link", { name: "Deals" }).click();
      await expect(page.getByRole("link", { name: "New deal" }).first()).toBeVisible();

      await page.goto("/merchant/topup");
      await expect(page.getByText(/don't have permission to top up/i)).toBeVisible();
    });
  });
});

test.describe("shopper", () => {
  test.skip(!roleAvailable("shopper"), skipReason("shopper"));

  test("cannot reach the merchant console, admin or agent surfaces", async ({
    browser,
  }) => {
    await asRole(browser, "shopper", async (page) => {
      // A shopper with no merchant record lands on the merchant intro page,
      // never inside the console shell.
      await page.goto("/merchant/redeem");
      await expect(merchantNav(page)).toHaveCount(0);

      await expectRedirectedAwayFrom(page, "/admin");
      await expectRedirectedAwayFrom(page, "/founder");
      await expectRedirectedAwayFrom(page, "/agent");
    });
  });
});

test.describe("field agent", () => {
  test.skip(!roleAvailable("agent"), skipReason("agent"));

  test("reaches the leads console", async ({ browser }) => {
    await asRole(browser, "agent", async (page) => {
      await page.goto("/agent/leads");
      await expect(page).toHaveURL(/\/agent\/leads/);
    });
  });

  test("cannot reach admin or the founder dashboard (no approvals, no fee reversal)", async ({
    browser,
  }) => {
    await asRole(browser, "agent", async (page) => {
      await expectRedirectedAwayFrom(page, "/admin");
      await expectRedirectedAwayFrom(page, "/admin/redemptions");
      await expectRedirectedAwayFrom(page, "/founder");
    });
  });
});

test.describe("admin / founder", () => {
  test.skip(!roleAvailable("admin"), skipReason("admin"));

  test("reaches the admin console and the founder dashboard", async ({ browser }) => {
    await asRole(browser, "admin", async (page) => {
      // Founders are provisioned as `admin` today (see docs/skills/
      // founder-role-split.md) — this smoke test is what a future role split
      // must keep true for the founder account.
      await page.goto("/founder");
      await expect(page.getByRole("heading", { name: /Founder dashboard/i })).toBeVisible();

      await page.goto("/admin/redemptions");
      await expect(page).toHaveURL(/\/admin\/redemptions/);
    });
  });
});
