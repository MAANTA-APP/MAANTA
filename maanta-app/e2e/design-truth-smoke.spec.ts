import { test, expect, type Browser, type Page } from "@playwright/test";
import { smokeFrames, type Frame } from "../src/lib/design-truth/load";

/**
 * Layer 2 — behavioural smoke, generated FROM the contract
 * (`design/current-reality/frames.json`).
 *
 * One test per `smoke: true` frame. No route, role, or anchor is ever
 * re-declared here: if this file mentioned a path, the contract and the test
 * could disagree and both look green. The contract is the only source, so a
 * renamed route breaks the smoke run rather than quietly testing a dead URL.
 *
 * Locators are accessible only — `getByRole('heading')` for `expectedHeading`,
 * visible text for `expectedAnchor`. No CSS, no data-testid: where a screen had
 * no anchor, a real heading was added to the app instead (see the `sr-only`
 * heading on the merchant till).
 *
 * REQUIRES A LIVE, SEEDED, NON-PROD ENV. Two failure modes, deliberately
 * different:
 *
 *  - **Nothing configured** (`E2E_BASE_URL` unset): nobody asked for a smoke
 *    run, so the file skips with a reason. It never reports a pass.
 *  - **Partly configured**: someone IS running smoke, so a missing role account
 *    or seed row FAILS LOUDLY — `missing test role: agent`. A smoke run that
 *    silently covers 9 of 14 frames is worse than no smoke run, because the
 *    green tick is read as coverage.
 */

/**
 * STATUS: PREPARED, NEVER RUN.
 *
 * Recorded in the contract itself as `mirror.smokeCoverage.status =
 * "prepared-not-run"` with `lastRunAt: null`, and asserted by Layer 1, so nobody
 * can read `smoke: true` on 14 frames as 14 green browser checks. `smoke: true`
 * means "declared and generated". It does not mean passing.
 *
 * When a real run happens, update `mirror.smokeCoverage` (status + lastRunAt) in
 * the same commit — Layer 1 refuses a `passing`/`failing` status with a null
 * `lastRunAt`.
 */
const BASE_URL = process.env.E2E_BASE_URL;
const CONFIGURED = Boolean(BASE_URL);

/**
 * Role key -> storage-state env var. The key is `requiredRole`, except that an
 * unverified-phone auth state needs its own account (an email-only shopper), so
 * it resolves separately.
 */
function storageEnvFor(frame: Frame): string {
  if (frame.authState === "authenticated-unverified-phone") {
    return "E2E_STORAGE_SHOPPER_UNVERIFIED_PHONE";
  }
  return `E2E_STORAGE_${frame.requiredRole!.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`;
}

/** Back-compat with the golden-path suite's existing variable names. */
const STORAGE_ALIASES: Record<string, string | undefined> = {
  E2E_STORAGE_SHOPPER: process.env.E2E_SHOPPER_STORAGE,
  E2E_STORAGE_MERCHANT: process.env.E2E_MERCHANT_STORAGE,
};

function resolveStorage(frame: Frame): string {
  const key = storageEnvFor(frame);
  const raw = process.env[key] ?? STORAGE_ALIASES[key];
  if (!raw) {
    // The exact wording the contract README specifies, so a CI log names the
    // gap rather than the mechanism.
    throw new Error(
      `missing test role: ${frame.requiredRole} (set ${key}) — required by frame ${frame.id} ${frame.name}`
    );
  }
  return raw;
}

/** Storage state may be a file PATH (local dev) or raw JSON (a CI secret). */
function parseStorage(raw: string) {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") ? JSON.parse(trimmed) : trimmed;
}

/**
 * Seed ids for dynamic segments, keyed by the contract route. Each maps to one
 * of the seed rows the contract README requires: a claimable deal, a claimed
 * ticket, a held redemption, an open lead, a pending shop.
 */
const SEED_ENV: Record<string, string> = {
  "/deals/[id]": "E2E_SEED_DEAL_ID",
  "/tickets/[id]": "E2E_SEED_TICKET_ID",
  "/agent/leads/[id]": "E2E_SEED_LEAD_ID",
  "/admin/redemptions/[id]": "E2E_SEED_HELD_REDEMPTION_ID",
};

/** Fill `[id]` from seed data. Throws loudly when a seed row is not configured. */
function resolveRoute(frame: Frame): string {
  if (!frame.route.includes("[")) return frame.route;
  const key = SEED_ENV[frame.route];
  if (!key) {
    throw new Error(
      `missing seed mapping for dynamic route ${frame.route} (frame ${frame.id}) — add it to SEED_ENV`
    );
  }
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `missing seed row: ${frame.route} (set ${key}) — required by frame ${frame.id} ${frame.name}`
    );
  }
  return frame.route.replace(/\[[^\]]+\]/, value);
}

async function openAs(browser: Browser, frame: Frame): Promise<{ page: Page; close: () => Promise<void> }> {
  // Anonymous surfaces get a clean context — a signed-in session would change
  // what a public page renders.
  if (frame.authState === "anonymous") {
    const ctx = await browser.newContext();
    return { page: await ctx.newPage(), close: () => ctx.close() };
  }
  const ctx = await browser.newContext({ storageState: parseStorage(resolveStorage(frame)) });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

const frames = smokeFrames();

test.describe("design-truth smoke (Layer 2)", () => {
  test.skip(
    !CONFIGURED,
    "Set E2E_BASE_URL (plus E2E_STORAGE_* role states and E2E_SEED_* rows against a seeded NON-PROD env) to run the contract smoke suite."
  );

  test("the contract declares at least one smoke frame", () => {
    // A mirror where every frame quietly went smoke:false would otherwise pass
    // this file as an empty suite.
    expect(frames.length).toBeGreaterThan(0);
  });

  for (const frame of frames) {
    test(`${frame.id} ${frame.name} [${frame.role}]`, async ({ browser }) => {
      const { page, close } = await openAs(browser, frame);
      try {
        await page.goto(resolveRoute(frame));

        if (frame.redirectTarget) {
          await expect(page).toHaveURL(new RegExp(frame.redirectTarget));
        }

        const anchor = frame.expectedHeading
          ? page.getByRole("heading", { name: frame.expectedHeading })
          : page.getByText(frame.expectedAnchor!, { exact: false });

        // `.first()` because a heading string may legitimately appear in a
        // sticky header as well as the body; the assertion is presence.
        await expect(anchor.first()).toBeVisible();
      } finally {
        await close();
      }
    });
  }
});
