import { describe, it, expect } from "vitest";
import {
  QUEUE_ENTRY_TTL_MINUTES,
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
