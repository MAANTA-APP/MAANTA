import { describe, it, expect } from "vitest";
import {
  FAST_VISIT_WINDOW_MINUTES,
  fastVisitDeadline,
  formatArrivalDuration,
  formatRewardCountdown,
  isFastVisitEligible,
} from "@/lib/fast-visit-window";

// The Fast Visit window's presentation math. The AUTHORITATIVE boundary is
// asserted against the real database function in
// supabase/tests/fast_visit_points_test.sql; these tests pin that the
// client-side mirror agrees with it exactly, because a UI that says
// "eligible" when the award will refuse (or vice versa) is a broken promise
// at the counter.

const CLAIM = "2026-08-26T12:00:00.000Z";

describe("fast visit — the 15-minute rule", () => {
  it("is 15 minutes, frozen by the founder brief", () => {
    expect(FAST_VISIT_WINDOW_MINUTES).toBe(15);
  });

  it("qualifies arrival strictly inside the window", () => {
    expect(isFastVisitEligible(CLAIM, "2026-08-26T12:14:59.000Z")).toBe(true);
    expect(isFastVisitEligible(CLAIM, "2026-08-26T12:00:01.000Z")).toBe(true);
  });

  it("qualifies exactly 15:00 — the boundary is inclusive", () => {
    expect(isFastVisitEligible(CLAIM, "2026-08-26T12:15:00.000Z")).toBe(true);
  });

  it("does not qualify a millisecond past the boundary", () => {
    expect(isFastVisitEligible(CLAIM, "2026-08-26T12:15:00.001Z")).toBe(false);
    expect(isFastVisitEligible(CLAIM, "2026-08-26T12:16:00.000Z")).toBe(false);
  });

  it("never qualifies a historical claim with no recorded claim time", () => {
    expect(isFastVisitEligible(null, "2026-08-26T12:05:00.000Z")).toBe(false);
    expect(isFastVisitEligible(undefined, "2026-08-26T12:05:00.000Z")).toBe(false);
  });

  it("never qualifies without an arrival", () => {
    expect(isFastVisitEligible(CLAIM, null)).toBe(false);
    expect(isFastVisitEligible(CLAIM, undefined)).toBe(false);
  });

  it("refuses to compute from unparseable timestamps", () => {
    expect(isFastVisitEligible("garbage", "2026-08-26T12:05:00.000Z")).toBe(false);
    expect(fastVisitDeadline("garbage")).toBeNull();
    expect(fastVisitDeadline(null)).toBeNull();
  });

  it("computes the deadline as claim + 15 minutes", () => {
    expect(fastVisitDeadline(CLAIM)?.toISOString()).toBe(
      "2026-08-26T12:15:00.000Z"
    );
  });
});

describe("fast visit — display formats", () => {
  it("formats how fast the shopper was", () => {
    expect(
      formatArrivalDuration(CLAIM, "2026-08-26T12:08:17.000Z")
    ).toBe("8m 17s");
    expect(formatArrivalDuration(CLAIM, "2026-08-26T12:00:45.000Z")).toBe("45s");
  });

  it("formats the reward countdown as M:SS, clamped at zero", () => {
    expect(formatRewardCountdown(14 * 60_000 + 32_000)).toBe("14:32");
    expect(formatRewardCountdown(59_000)).toBe("0:59");
    expect(formatRewardCountdown(0)).toBe("0:00");
    expect(formatRewardCountdown(-5_000)).toBe("0:00");
  });
});
