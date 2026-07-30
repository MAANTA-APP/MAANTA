import { describe, expect, it } from "vitest";
import {
  approveOutcomeMessage,
  formatAdminTrialStatus,
  formatEliteTrialCapLine,
  parseEliteTrialCapStatus,
} from "@/lib/elite-trial";

describe("formatEliteTrialCapLine", () => {
  it("reports remaining slots under the cap", () => {
    expect(formatEliteTrialCapLine({ cap: 100, granted: 12, remaining: 88 })).toBe(
      "Elite trial launch offer: 88 of 100 slots left (12 granted)."
    );
  });

  it("warns when the offer is exhausted", () => {
    expect(formatEliteTrialCapLine({ cap: 100, granted: 100, remaining: 0 })).toMatch(
      /fully claimed/
    );
  });
});

describe("approveOutcomeMessage", () => {
  it("prefers the API notice when present", () => {
    expect(
      approveOutcomeMessage({
        grantRequested: true,
        notice: "Shop approved on Standard — the 30-day Elite trial launch offer is fully claimed.",
        eliteTrialOutcome: "skipped_cap_reached",
      })
    ).toMatch(/fully claimed/);
  });

  it("does not imply a trial when none was requested", () => {
    expect(approveOutcomeMessage({ grantRequested: false })).toBe(
      "Shop approved on Standard."
    );
  });

  it("names a granted trial when the outcome is granted", () => {
    expect(
      approveOutcomeMessage({
        grantRequested: true,
        eliteTrialGranted: true,
        eliteTrialOutcome: "granted",
      })
    ).toBe("Shop approved with a 30-day Elite trial.");
  });

  it("surfaces unknown rather than collapsing to skipped", () => {
    expect(
      approveOutcomeMessage({
        grantRequested: true,
        eliteTrialOutcome: "unknown",
      })
    ).toMatch(/could not confirm/);
  });
});

describe("formatAdminTrialStatus", () => {
  const now = Date.parse("2026-07-30T12:00:00Z");

  it("returns null when not on trial", () => {
    expect(
      formatAdminTrialStatus({
        eliteTrialActive: false,
        trialEndsAt: "2026-08-20T12:00:00Z",
        nowMs: now,
      })
    ).toBeNull();
  });

  it("counts trial days while the trial window is open", () => {
    expect(
      formatAdminTrialStatus({
        eliteTrialActive: true,
        trialEndsAt: "2026-08-09T12:00:00Z",
        nowMs: now,
      })
    ).toBe("Elite trial · 10 days left");
  });

  it("names grace when grace_period_ends_at is in the future", () => {
    expect(
      formatAdminTrialStatus({
        eliteTrialActive: true,
        trialEndsAt: "2026-07-20T12:00:00Z",
        gracePeriodEndsAt: "2026-08-05T12:00:00Z",
        nowMs: now,
      })
    ).toBe("Elite trial grace · 6 days left");
  });
});

describe("parseEliteTrialCapStatus", () => {
  it("accepts a single-element array from PostgREST", () => {
    expect(parseEliteTrialCapStatus([{ cap: 100, granted: 3, remaining: 97 }])).toEqual({
      cap: 100,
      granted: 3,
      remaining: 97,
    });
  });

  it("returns null for empty payloads", () => {
    expect(parseEliteTrialCapStatus(null)).toBeNull();
    expect(parseEliteTrialCapStatus([])).toBeNull();
  });
});
