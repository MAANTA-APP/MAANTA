import { describe, it, expect } from "vitest";
import {
  QUEUE_ENTRY_TTL_MINUTES,
  liveWaitingRedemptionId,
  staffFacingName,
} from "@/lib/queue";

// Identity minimisation at the counter (founder brief 2026-08-26 §26): staff
// get exactly enough to CALL a shopper — first name + last initial — and the
// helper is the only place a full name is ever reduced for display.

describe("staffFacingName", () => {
  it("reduces a full name to first name + last initial", () => {
    expect(staffFacingName("Amina Hassan")).toBe("Amina H.");
    expect(staffFacingName("Mohamed Abdi Ali")).toBe("Mohamed A.");
  });

  it("keeps a single name as-is — nothing to initial", () => {
    expect(staffFacingName("Amina")).toBe("Amina");
  });

  it("never renders an empty or missing name as a blank row", () => {
    expect(staffFacingName(null)).toBe("Shopper");
    expect(staffFacingName(undefined)).toBe("Shopper");
    expect(staffFacingName("   ")).toBe("Shopper");
  });

  it("tolerates messy whitespace", () => {
    expect(staffFacingName("  Amina   Hassan  ")).toBe("Amina H.");
  });
});

describe("queue constants", () => {
  it("entries time out at ten minutes — the founder-set target", () => {
    expect(QUEUE_ENTRY_TTL_MINUTES).toBe(10);
  });
});

describe("liveWaitingRedemptionId", () => {
  const claims = [{ redemptionId: "red-live-1" }, { redemptionId: "red-live-2" }];

  it("resumes a waiting check-in whose claim is still live", () => {
    expect(liveWaitingRedemptionId(claims, "red-live-2")).toBe("red-live-2");
  });

  it("ignores a waiting row whose claim has since been redeemed or expired", () => {
    // Codex P2 (PR #277): shopper redeems claim 1, re-scans within the queue
    // TTL to use claim 2. The stale waiting row for the dead claim must not
    // read as "already checked in" — that locked the shopper out of the
    // fresh check-in while staff (whose list joins the live redemption)
    // saw nobody.
    expect(liveWaitingRedemptionId(claims, "red-redeemed")).toBeNull();
  });

  it("handles no waiting row at all", () => {
    expect(liveWaitingRedemptionId(claims, null)).toBeNull();
    expect(liveWaitingRedemptionId(claims, undefined)).toBeNull();
    expect(liveWaitingRedemptionId([], "red-live-1")).toBeNull();
  });
});
