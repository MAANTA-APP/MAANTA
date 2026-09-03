import { describe, expect, it } from "vitest";
import {
  adminDealState,
  ADMIN_DEAL_STATE_META,
  matchesDealStateFilter,
  isAdminDealStateFilter,
} from "@/lib/admin-deal-state";

const now = new Date("2026-09-03T10:00:00Z");
const inFuture = "2026-09-03T12:00:00Z";
const justExpired = "2026-09-03T09:55:00Z"; // 5 min ago — inside the 15-min grace
const longExpired = "2026-09-02T10:00:00Z";

describe("adminDealState — ordered, derived, never stored", () => {
  it("reads a live deal as live", () => {
    expect(
      adminDealState({ is_active: true, is_paused: false, expires_at: inFuture, max_claims: 10, claims_count: 3 }, now)
    ).toBe("live");
  });

  it("ended wins over everything", () => {
    expect(
      adminDealState({ is_active: false, is_paused: true, expires_at: longExpired, max_claims: 1, claims_count: 5 }, now)
    ).toBe("ended");
  });

  it("paused wins over fully claimed and expiry", () => {
    expect(
      adminDealState({ is_active: true, is_paused: true, expires_at: inFuture, max_claims: 1, claims_count: 1 }, now)
    ).toBe("paused");
  });

  it("distinguishes grace from expired", () => {
    expect(
      adminDealState({ is_active: true, is_paused: false, expires_at: justExpired, max_claims: null, claims_count: 0 }, now)
    ).toBe("in_grace");
    expect(
      adminDealState({ is_active: true, is_paused: false, expires_at: longExpired, max_claims: null, claims_count: 0 }, now)
    ).toBe("expired");
  });

  it("reads an exhausted allocation as fully claimed while still live", () => {
    expect(
      adminDealState({ is_active: true, is_paused: false, expires_at: inFuture, max_claims: 4, claims_count: 4 }, now)
    ).toBe("fully_claimed");
  });

  it("gives every state an icon and a word, so it survives greyscale", () => {
    for (const meta of Object.values(ADMIN_DEAL_STATE_META)) {
      expect(meta.icon.length).toBeGreaterThan(0);
      expect(meta.label.length).toBeGreaterThan(1);
    }
  });

  it("folds in_grace under the expired filter and accepts only known filters", () => {
    expect(matchesDealStateFilter("in_grace", "expired")).toBe(true);
    expect(matchesDealStateFilter("live", "expired")).toBe(false);
    expect(matchesDealStateFilter("paused", "all")).toBe(true);
    expect(isAdminDealStateFilter("live")).toBe(true);
    expect(isAdminDealStateFilter("bogus")).toBe(false);
    expect(isAdminDealStateFilter(undefined)).toBe(false);
  });
});
