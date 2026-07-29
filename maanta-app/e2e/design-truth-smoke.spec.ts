import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { asRole, roleAvailable, skipReason, type Role } from "./helpers/roles";

/**
 * Design-truth behavioural smoke.
 *
 * `design/current-reality/frames.json` is the contract; this file executes it.
 * For every frame carrying a `smoke` block we prove three things a route/rule
 * check cannot:
 *
 *   1. the intended role actually LANDS on the frame (guards, redirects and
 *      middleware all cooperate), not just that a file exists at that path;
 *   2. the page exposes the user-facing anchor the contract promises;
 *   3. roles the contract denies are bounced away.
 *
 * Deliberately shallow — one anchor per frame, no screenshots, no layout
 * assertions. This is a contract suite, not visual regression: it should stay
 * fast enough that nobody is tempted to skip it, and it must not fail because a
 * card moved. Depth for the money path lives in golden-path.spec.ts; depth for
 * permissions lives in role-access.spec.ts.
 *
 * Frames without a `smoke` block stay route-only by design (see the protocol,
 * docs/design-truth-protocol.md → "when a frame needs behavioural smoke").
 *
 * Like the rest of the suite, each frame skips — never fails — when its role's
 * storage state isn't provisioned.
 */

type Smoke = {
  role: Role;
  heading?: string;
  redirectTarget?: string;
  denyRoles?: Role[];
};

type Frame = {
  id: string;
  title: string;
  route: string | null;
  role: string;
  status: string;
  smoke?: Smoke;
};

const FRAMES: Frame[] = JSON.parse(
  readFileSync(
    path.join(__dirname, "../design/current-reality/frames.json"),
    "utf8"
  )
).frames;

const contracted = FRAMES.filter(
  (f): f is Frame & { route: string; smoke: Smoke } =>
    Boolean(f.smoke && f.route) &&
    // A dynamic route needs a seeded id, which this suite has no way to pin.
    !f.route!.includes("[")
);

test.describe("design truth: current frames behave as the contract says", () => {
  for (const frame of contracted) {
    const { id, title, route, smoke } = frame;

    test.describe(`${id} — ${title}`, () => {
      test.skip(!roleAvailable(smoke.role), skipReason(smoke.role));

      if (smoke.redirectTarget) {
        test(`${route} redirects to ${smoke.redirectTarget}`, async ({ browser }) => {
          await asRole(browser, smoke.role, async (page) => {
            await page.goto(route);
            // Legacy paths are linked from the wild (bookmarks, old QR codes),
            // so where they land is part of the contract, not an accident.
            await expect(page).toHaveURL(
              new RegExp(`${escapeRe(smoke.redirectTarget!)}(/|\\?|$)`)
            );
          });
        });
      } else {
        test(`${smoke.role} lands on ${route} and sees "${smoke.heading}"`, async ({
          browser,
        }) => {
          await asRole(browser, smoke.role, async (page) => {
            await page.goto(route);
            // Still on the intended route — proves no guard bounced us.
            await expect(page).toHaveURL(new RegExp(`${escapeRe(route)}(/|\\?|$)`));
            // The anchor is a heading by ROLE, so a screen-reader-only h1
            // counts and a restyled div does not. Substring match survives
            // dynamic suffixes ("Pending approvals (3)"); the exact string is
            // pinned against source by src/lib/__tests__/design-truth.test.ts.
            await expect(
              page.getByRole("heading", { name: smoke.heading! }).first()
            ).toBeVisible();
          });
        });
      }

      for (const denied of smoke.denyRoles ?? []) {
        test(`${denied} cannot reach ${route}`, async ({ browser }) => {
          test.skip(!roleAvailable(denied), skipReason(denied));
          await asRole(browser, denied, async (page) => {
            await page.goto(route);
            await expect(page).not.toHaveURL(
              new RegExp(`${escapeRe(route)}(/|\\?|$)`)
            );
          });
        });
      }
    });
  }
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
