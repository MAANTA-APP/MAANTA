import { test, expect, type Page } from "@playwright/test";
import { loadSmokeFrames, type SmokeFrame } from "../src/lib/design-truth/load";
import { contextForRole, roleForContract, type Role } from "./helpers/roles";

/**
 * Layer 2 — behavioural smoke, generated FROM the contract.
 *
 * One test per `smoke: true` frame in `design/current-reality/frames.json`. No
 * route, role or anchor is re-declared here: if a test needs changing, the
 * contract is what changes. That is the whole point — a test file that restates
 * the contract can drift from it, and then neither is trustworthy.
 *
 * What each test proves, in order:
 *   1. the frame's `requiredRole` / `authState` can actually be driven;
 *   2. the route resolves and, where `redirectTarget` is set, bounces there;
 *   3. the promised anchor (`expectedHeading` or `expectedAnchor`) is visible.
 *
 * Accessible locators only. `expectedHeading` asserts by ARIA role, so a
 * screen-reader-only `<h1>` counts and a restyled `<div>` does not.
 *
 * PREREQUISITES FAIL LOUDLY. A missing role account throws
 * `missing test role: agent` — it never passes by skipping, because a silently
 * skipped contract test is indistinguishable from a passing one in CI output.
 * The whole suite is gated on `E2E_BASE_URL` (see playwright.config.ts); with no
 * base URL there is no environment to test and the file reports that once,
 * rather than 14 confusing failures.
 */

const frames = loadSmokeFrames();

/** Env that must exist before any smoke test can mean anything. */
const REQUIRED_ENV = ["E2E_BASE_URL"] as const;

/**
 * `[id]` routes need a seeded row. Each is supplied by env so the suite never
 * invents an id: E2E_DEAL_ID, E2E_TICKET_ID, E2E_LEAD_ID, E2E_REDEMPTION_ID.
 */
const SEED_ENV: Record<string, string> = {
  "/deals/[id]": "E2E_DEAL_ID",
  "/tickets/[id]": "E2E_TICKET_ID",
  "/agent/leads/[id]": "E2E_LEAD_ID",
  "/admin/redemptions/[id]": "E2E_REDEMPTION_ID",
};

function resolveRoute(route: string): string {
  if (!route.includes("[")) return route;
  const envName = SEED_ENV[route];
  if (!envName) {
    throw new Error(
      `design-truth smoke: no seed env mapped for dynamic route ${route}. Add it to SEED_ENV.`
    );
  }
  const value = process.env[envName];
  if (!value) throw new Error(`missing seed row: ${envName} (for ${route})`);
  return route.replace(/\[\w+\]/, value);
}

const configured = REQUIRED_ENV.every((k) => process.env[k]);

test.describe("design truth: contract smoke", () => {
  test.skip(
    !configured,
    `design-truth smoke needs ${REQUIRED_ENV.join(", ")} plus role storage states and seed rows — see design/current-reality/README.md`
  );

  test("the contract declares smoke frames to generate from", () => {
    // Guards against an empty generation loop reporting green.
    expect(frames.length).toBeGreaterThan(0);
  });

  for (const frame of frames) {
    test(`${frame.id} ${frame.name} [${frame.role}]`, async ({ browser }) => {
      // Fail loudly, and name what is missing.
      const role = roleForContract(frame.requiredRole, frame.authState);
      const ctx = await contextForRole(browser, role);
      try {
        const page = await ctx.newPage();
        await page.goto(resolveRoute(frame.route));

        if (frame.redirectTarget) {
          await expect(page).toHaveURL(new RegExp(escapeRe(frame.redirectTarget)));
        }

        await expect(anchorFor(page, frame)).toBeVisible();
      } finally {
        await ctx.close();
      }
    });
  }
});

/** The frame's promised user-facing anchor, by ARIA role where possible. */
function anchorFor(page: Page, frame: SmokeFrame) {
  return frame.expectedHeading
    ? page.getByRole("heading", { name: frame.expectedHeading }).first()
    : page.getByText(frame.expectedAnchor!, { exact: false }).first();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Re-exported for the helper's benefit; keeps the Role union in one place.
export type { Role };
