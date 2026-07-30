import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDealClaimable, isDealInRedemptionWindow } from "@/lib/deal-expiry";
import { DEAL_SELECT, DEAL_SELECT_WITHOUT_LAT_LNG } from "@/lib/data";

const root = join(__dirname, "../../..");

function readApp(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

/**
 * Ratchet tests for the 2026-07-30 backend↔frontend↔wireframe parity pass.
 * These pin truths that previously drifted silently.
 */
describe("parity sync ratchets (2026-07-30)", () => {
  it("live deal selects request and filter is_paused", () => {
    expect(DEAL_SELECT).toContain("is_paused");
    expect(DEAL_SELECT_WITHOUT_LAT_LNG).toContain("is_paused");
    const data = readApp("src/lib/data.ts");
    expect(data).toMatch(/\.eq\(\s*"is_paused"\s*,\s*false\s*\)/);
  });

  it("new claims are live-only; grace is till redemption window", () => {
    const now = new Date("2026-07-26T12:00:00Z");
    expect(isDealClaimable("2026-07-26T11:50:00Z", now)).toBe(false);
    expect(isDealInRedemptionWindow("2026-07-26T11:50:00Z", now)).toBe(true);
  });

  it("merchant alerts never promise that verify is blocked by balance", () => {
    const src = readApp("src/app/merchant/(app)/alerts/page.tsx");
    expect(src).not.toMatch(/Top up to verify redemptions/);
    expect(src).not.toMatch(/can be verified/);
    expect(src).toMatch(/arrears/);
  });

  it("inventory route aliases exist", () => {
    expect(readApp("src/app/otp/page.tsx")).toMatch(/verify-phone/);
    expect(readApp("src/app/founder/reports/page.tsx")).toMatch(/admin\/reports/);
    expect(readApp("src/app/merchant/onboarding/page.tsx")).toMatch(
      /merchant\/onboard/
    );
  });

  it("design current-reality inventory is present", () => {
    const frames = JSON.parse(
      readApp("design/current-reality/frames.json")
    ) as { surfaces: { route: string; status: string }[] };
    expect(frames.surfaces.length).toBeGreaterThan(20);
    expect(frames.surfaces.some((s) => s.route === "/feed")).toBe(true);
    expect(frames.surfaces.some((s) => s.route === "/contact" && s.status === "design-ahead")).toBe(
      true
    );
  });
});
