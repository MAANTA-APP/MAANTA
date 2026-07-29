import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Clerk-backed role sessions for the E2E suite.
 *
 * MAANTA roles live in `public.users.role` (Clerk carries authentication only),
 * so a "role" here is simply a signed-in Clerk test user whose seeded app-user
 * row has the role/permissions we want to assert. Rather than scripting Clerk's
 * sign-in UI on every test (slow, and it burns SMS/email OTP), each role is a
 * captured Playwright `storageState`, supplied by env var.
 *
 * Every role is OPTIONAL: a spec that needs a role the operator hasn't
 * provisioned skips instead of failing, so partial provisioning still yields
 * honest partial coverage and never a false green.
 *
 * See docs/ops/e2e-golden-path.md for how to capture each state and which
 * seeded account backs it.
 */
export type Role =
  | "shopper"
  | "owner"
  | "staffVerifyOnly"
  | "staffDeals"
  | "agent"
  | "admin";

/**
 * Role → env var holding its storage state. `E2E_MERCHANT_STORAGE` is the
 * original owner variable and is kept as the primary name for back-compat with
 * already-provisioned CI secrets.
 */
const STORAGE_ENV: Record<Role, string[]> = {
  shopper: ["E2E_SHOPPER_STORAGE"],
  owner: ["E2E_MERCHANT_STORAGE", "E2E_OWNER_STORAGE"],
  staffVerifyOnly: ["E2E_STAFF_VERIFY_STORAGE"],
  staffDeals: ["E2E_STAFF_DEALS_STORAGE"],
  agent: ["E2E_AGENT_STORAGE"],
  admin: ["E2E_ADMIN_STORAGE"],
};

/** Human-readable description of what a role's seeded account must look like. */
export const ROLE_FIXTURES: Record<Role, string> = {
  shopper: "public.users.role = 'customer', verified phone, can claim deals",
  owner: "merchants.user_id = this user (owner holds every staff permission)",
  staffVerifyOnly:
    "merchant_staff row: can_verify = true, can_deals/can_topup/can_purchase = false",
  staffDeals:
    "merchant_staff row: can_verify = true, can_deals = true, can_topup/can_purchase = false",
  agent: "public.users.role = 'agent' with an active agents row",
  admin: "public.users.role = 'admin' (also serves the founder dashboard today)",
};

export function baseUrlConfigured(): boolean {
  return Boolean(process.env.E2E_BASE_URL);
}

function rawStorage(role: Role): string | undefined {
  for (const key of STORAGE_ENV[role]) {
    const value = process.env[key];
    if (value && value.trim()) return value;
  }
  return undefined;
}

/** True when this role can actually be driven in this environment. */
export function roleAvailable(role: Role): boolean {
  return baseUrlConfigured() && Boolean(rawStorage(role));
}

/** Skip reason naming the exact env vars an operator still has to provide. */
export function skipReason(...roles: Role[]): string {
  const missing = roles.filter((r) => !rawStorage(r));
  const vars = missing.map((r) => STORAGE_ENV[r][0]).join(", ");
  if (!baseUrlConfigured()) {
    return `Set E2E_BASE_URL (plus ${roles
      .map((r) => STORAGE_ENV[r][0])
      .join(", ")}) to run.`;
  }
  return `Set ${vars} — see docs/ops/e2e-golden-path.md for the seeded account each one needs.`;
}

/**
 * Storage state may be a file PATH (local dev) or raw JSON (a CI secret).
 * `browser.newContext({ storageState })` treats a string as a path, so parse
 * inline JSON into an object first and pass paths through unchanged.
 */
function parseStorage(raw: string) {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") ? JSON.parse(trimmed) : trimmed;
}

/** A browser context signed in as `role`. Throws if the role isn't provisioned. */
export async function contextForRole(
  browser: Browser,
  role: Role
): Promise<BrowserContext> {
  const raw = rawStorage(role);
  if (!raw) throw new Error(`No storage state for role "${role}" — ${skipReason(role)}`);
  return browser.newContext({ storageState: parseStorage(raw) });
}

/** Run `fn` on a fresh page signed in as `role`, always closing the context. */
export async function asRole<T>(
  browser: Browser,
  role: Role,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  const ctx = await contextForRole(browser, role);
  try {
    return await fn(await ctx.newPage());
  } finally {
    await ctx.close();
  }
}

/** The merchant bottom bar, addressed by its accessible name. */
export function merchantNav(page: Page) {
  return page.getByRole("navigation", { name: "Merchant" });
}

/** The shopper bottom bar, addressed by its accessible name. */
export function shopperNav(page: Page) {
  return page.getByRole("navigation", { name: "Shopper" });
}

/** Assert the merchant bottom bar shows exactly `expected`, in order. */
export async function expectMerchantNav(page: Page, expected: string[]) {
  const nav = merchantNav(page);
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveText(expected);
}

/** Claim the first deal on the shopper feed and return the ticket code. */
export async function claimFirstDeal(page: Page): Promise<string> {
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
export async function enterCode(page: Page, code: string): Promise<void> {
  for (const digit of code.slice(0, 6)) {
    await page.getByRole("button", { name: digit, exact: true }).click();
  }
}
