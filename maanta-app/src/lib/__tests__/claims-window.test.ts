import { describe, expect, it } from "vitest";
import { claimsWindow } from "@/lib/claims-window";

/**
 * D164 — the three states a Claims number can be in must stay distinguishable.
 *
 * All three previously rendered as a bare "0":
 *   1. a real zero (nobody claimed; the window is genuinely covered),
 *   2. a failed read (now caught upstream by the read-failure guards),
 *   3. incomplete coverage — the 7-day window reaching back further than
 *      `claimed_at` has existed.
 *
 * (3) is the one that misleads during the pilot's first week: a small number
 * reads as low demand when it means short history.
 */

const START = "2026-08-24T09:00:00.000Z";

describe("claimsWindow — labelling a count whose history is shorter than its window", () => {
  it("says tracking has not started when the config row is missing", () => {
    // The migration has not been applied here. The card must not imply it is
    // reporting a real zero.
    const w = claimsWindow(null);

    expect(w.label).toBe("Claims");
    expect(w.partial).toBe(true);
    expect(w.hint).toMatch(/not enabled yet/i);
    expect(w.hint).toMatch(/not a count of zero claims/i);
    expect(w.label).not.toContain("7d");
  });

  it("does not claim a 7-day window on the day tracking begins", () => {
    const w = claimsWindow(START, new Date("2026-08-24T10:00:00.000Z"));

    expect(w.label).toBe("Claims since tracking began");
    expect(w.partial).toBe(true);
    expect(w.hint).toContain("24 Aug");
  });

  it("still qualifies the number at six days and 23 hours", () => {
    const w = claimsWindow(START, new Date("2026-08-31T08:00:00.000Z"));

    expect(w.partial).toBe(true);
    expect(w.label).toBe("Claims since tracking began");
  });

  it("reverts to the plain 7d label the moment seven days are genuinely covered", () => {
    const w = claimsWindow(START, new Date("2026-08-31T09:00:00.000Z"));

    expect(w.label).toBe("Claims (7d)");
    expect(w.partial).toBe(false);
    expect(w.hint).toBeNull();
  });

  it("stays on the plain label well after the window is covered", () => {
    const w = claimsWindow(START, new Date("2026-10-01T00:00:00.000Z"));

    expect(w.label).toBe("Claims (7d)");
    expect(w.hint).toBeNull();
  });

  it("treats an unreadable config value as incomplete, never as a confident 7d", () => {
    const w = claimsWindow("not-a-date", new Date("2026-10-01T00:00:00.000Z"));

    expect(w.partial).toBe(true);
    expect(w.label).not.toContain("7d");
    expect(w.hint).toMatch(/unreadable/i);
  });

  it("renders the date as a fixed short form, not a locale-dependent string", () => {
    // The dashboards are read on a phone at a counter; the label must not
    // change shape with the reader's locale.
    expect(claimsWindow("2026-09-05T00:00:00.000Z", new Date("2026-09-06T00:00:00.000Z")).hint)
      .toContain("5 Sep");
    expect(claimsWindow("2026-12-31T00:00:00.000Z", new Date("2027-01-01T00:00:00.000Z")).hint)
      .toContain("31 Dec");
  });
});
