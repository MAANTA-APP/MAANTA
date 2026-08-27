import { describe, it, expect } from "vitest";
import {
  FAST_VISIT_WINDOW_MINUTES,
  fastVisitDeadline,
  formatArrivalDuration,
  formatRewardCountdown,
} from "@/lib/fast-visit-window";

// The Fast Visit window's presentation math ONLY. The AUTHORITATIVE
// qualification — feature gate ON at arrival, claim time known, arrival
// within the inclusive 15-minute boundary — is decided by
// record_shopper_arrival at arrival time, persisted as
// redemptions.fast_visit_qualified_at, and asserted against the real
// database functions in supabase/tests/fast_visit_points_test.sql
// (scenarios F and I). This module deliberately exports NO eligibility
// predicate: a client-side mirror computed from raw timestamps cannot know
// whether the feature was on when the shopper walked in, and re-deriving
// the rule in a second place is how the two drift apart.

const CLAIM = "2026-08-26T12:00:00.000Z";

describe("fast visit — the reward window", () => {
  it("is 15 minutes, frozen by the founder brief", () => {
    expect(FAST_VISIT_WINDOW_MINUTES).toBe(15);
  });

  it("computes the countdown deadline as claim + 15 minutes", () => {
    expect(fastVisitDeadline(CLAIM)?.toISOString()).toBe(
      "2026-08-26T12:15:00.000Z"
    );
  });

  it("has no deadline for a historical claim with no recorded claim time", () => {
    expect(fastVisitDeadline(null)).toBeNull();
    expect(fastVisitDeadline(undefined)).toBeNull();
  });

  it("refuses to compute from unparseable timestamps", () => {
    expect(fastVisitDeadline("garbage")).toBeNull();
  });

  it("exports no client-side eligibility predicate — qualification is the persisted arrival-time verdict", async () => {
    const mod = await import("@/lib/fast-visit-window");
    expect(
      Object.keys(mod).filter((k) => /eligib|qualif/i.test(k))
    ).toEqual([]);
  });
});

describe("fast visit — display formats", () => {
  it("formats how fast the shopper was", () => {
    expect(
      formatArrivalDuration(CLAIM, "2026-08-26T12:08:17.000Z")
    ).toBe("8m 17s");
    expect(formatArrivalDuration(CLAIM, "2026-08-26T12:00:45.000Z")).toBe("45s");
  });

  it("the reward countdown rolls over and guards non-finite input (D203)", () => {
    // It used to be a second, weaker copy of the claim countdown's sub-hour
    // branch. A slow device clock could push `left` over an hour and render
    // the raw-minute string D167 item 3 removed from the timer directly
    // above it; an unparseable value rendered "NaN:NaN".
    expect(formatRewardCountdown(65 * 60_000)).not.toMatch(/^\d{3,}:/);
    expect(formatRewardCountdown(65 * 60_000)).toContain("h");
    expect(formatRewardCountdown(NaN)).toBe("");
    expect(formatRewardCountdown(Infinity)).toBe("");
    // Under an hour it is unchanged — the shape the counter mockups show.
    expect(formatRewardCountdown(14 * 60_000 + 32_000)).toBe("14:32");
  });

  it("formats the reward countdown as M:SS, clamped at zero", () => {
    expect(formatRewardCountdown(14 * 60_000 + 32_000)).toBe("14:32");
    expect(formatRewardCountdown(59_000)).toBe("0:59");
    expect(formatRewardCountdown(0)).toBe("0:00");
    expect(formatRewardCountdown(-5_000)).toBe("0:00");
  });
});
