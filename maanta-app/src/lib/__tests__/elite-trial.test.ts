import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  approveOutcomeMessage,
  formatAdminTrialStatus,
  formatEliteTrialCapLine,
  formatMerchantTrialStatus,
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
    // Exact strings, written out rather than imported from elite-trial.ts —
    // asserting the constant against itself would pass any wording. This is
    // the ruled copy (design brief v1.4 item A2, adopted 2026-08-09; D78).
    expect(
      approveOutcomeMessage({
        grantRequested: true,
        eliteTrialOutcome: "unknown",
      })
    ).toBe(
      "Approved — trial outcome unconfirmed. The shop is live. We could not confirm whether the trial was applied — check Plans & trials."
    );
  });

  it("names the cap when the trial was skipped, in the ruled wording", () => {
    expect(
      approveOutcomeMessage({
        grantRequested: true,
        eliteTrialOutcome: "skipped_cap_reached",
      })
    ).toBe(
      "Shop approved on Standard — the 30-day Elite trial launch offer is fully claimed."
    );
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

describe("formatMerchantTrialStatus (10g plan screen, 14n wording — D80)", () => {
  const now = Date.parse("2026-07-30T12:00:00Z");

  it("returns null when not on trial", () => {
    expect(
      formatMerchantTrialStatus({
        eliteTrialActive: false,
        trialEndsAt: "2026-08-20T12:00:00Z",
        nowMs: now,
      })
    ).toBeNull();
  });

  it("counts trial days with no body while the trial runs", () => {
    expect(
      formatMerchantTrialStatus({
        eliteTrialActive: true,
        trialEndsAt: "2026-08-09T12:00:00Z",
        nowMs: now,
      })
    ).toEqual({ label: "Elite trial · 10 days left" });
  });

  it("renders stamped grace in the ruled 14n wording, exactly", () => {
    // Exact strings, written out rather than imported — the ruled copy.
    expect(
      formatMerchantTrialStatus({
        eliteTrialActive: true,
        trialEndsAt: "2026-07-25T12:00:00Z",
        gracePeriodEndsAt: "2026-08-04T12:00:00Z",
        nowMs: now,
      })
    ).toEqual({
      label: "Grace period · 5 days to convert",
      body: "Your trial ended. Elite features stay on until you convert or the grace period runs out.",
    });
  });

  it("derives grace from trial end + 7 days before the nightly job stamps it", () => {
    // Trial ended 2 days ago, grace_period_ends_at still NULL: the merchant
    // must see the grace state (7 − 2 = 5 days), never the admin formatter's
    // "awaiting nightly grace / downgrade job" ops copy.
    const status = formatMerchantTrialStatus({
      eliteTrialActive: true,
      trialEndsAt: "2026-07-28T12:00:00Z",
      gracePeriodEndsAt: null,
      nowMs: now,
    });
    expect(status?.label).toBe("Grace period · 5 days to convert");
    expect(JSON.stringify(status)).not.toMatch(/nightly|job/i);
  });

  it("names the post-grace state instead of 'Elite trial active (Ended)'", () => {
    expect(
      formatMerchantTrialStatus({
        eliteTrialActive: true,
        trialEndsAt: "2026-07-10T12:00:00Z",
        gracePeriodEndsAt: "2026-07-17T12:00:00Z",
        nowMs: now,
      })
    ).toEqual({
      label: "Grace period ended",
      body: "Your trial and grace period have ended. Your plan returns to Standard.",
    });
  });

  it("keeps the admin formatter off the 10g plan screen (the split itself)", () => {
    // The leak this split fixes returns the moment 10g imports the admin
    // formatter again, so the import boundary is asserted, not assumed.
    const planPage = readFileSync(
      path.resolve(__dirname, "..", "..", "app", "merchant", "(app)", "plan", "page.tsx"),
      "utf8"
    );
    expect(planPage).toContain("formatMerchantTrialStatus");
    expect(planPage).not.toContain("formatAdminTrialStatus");
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
