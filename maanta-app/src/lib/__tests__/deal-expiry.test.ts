import { describe, expect, it } from "vitest";
import {
  DEAL_GRACE_MINUTES,
  dealExpiryLabel,
  getDealExpiryState,
  isDealClaimable,
  isDealInRedemptionWindow,
} from "@/lib/deal-expiry";

describe("deal-expiry", () => {
  const now = new Date("2026-07-26T12:00:00Z");

  it("shows live countdown before deal end", () => {
    const expiresAt = "2026-07-26T14:14:00Z";
    const state = getDealExpiryState(expiresAt, now);
    expect(state.status).toBe("live");
    expect(state.displayText).toBe("Expires in 2h 14m");
  });

  it("shows grace period after deal end", () => {
    const expiresAt = "2026-07-26T11:50:00Z";
    const state = getDealExpiryState(expiresAt, now);
    expect(state.status).toBe("in_grace");
    expect(state.displayText).toMatch(/^Grace period: \d+ minute/);
  });

  it("shows expired after grace window", () => {
    const expiresAt = "2026-07-26T11:30:00Z";
    const state = getDealExpiryState(expiresAt, now, DEAL_GRACE_MINUTES);
    expect(state.status).toBe("expired");
    expect(state.displayText).toBe("Expired");
  });

  it("dealExpiryLabel mirrors getDealExpiryState display text", () => {
    expect(dealExpiryLabel("2026-07-26T14:00:00Z", now)).toBe("Expires in 2h 0m");
  });

  it("isDealClaimable is live-only (grace is for claimed tickets, not new claims)", () => {
    expect(isDealClaimable("2026-07-26T14:00:00Z", now)).toBe(true);
    expect(isDealClaimable("2026-07-26T11:50:00Z", now)).toBe(false);
    expect(isDealClaimable("2026-07-26T11:30:00Z", now)).toBe(false);
  });

  it("isDealInRedemptionWindow covers live and grace", () => {
    expect(isDealInRedemptionWindow("2026-07-26T14:00:00Z", now)).toBe(true);
    expect(isDealInRedemptionWindow("2026-07-26T11:50:00Z", now)).toBe(true);
    expect(isDealInRedemptionWindow("2026-07-26T11:30:00Z", now)).toBe(false);
  });
});
