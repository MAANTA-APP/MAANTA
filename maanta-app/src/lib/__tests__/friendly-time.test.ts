import { describe, expect, it } from "vitest";
import { friendlyTime } from "@/lib/ui";

describe("friendlyTime Nairobi calendar", () => {
  const now = new Date("2026-08-30T21:30:00Z"); // 31 Aug, 00:30 EAT

  it("formats the wall clock in Nairobi rather than the server timezone", () => {
    expect(friendlyTime("2026-08-30T21:15:00Z", now)).toBe("Today, 12:15am");
  });

  it("uses Nairobi calendar boundaries for Today and Yesterday", () => {
    expect(friendlyTime("2026-08-30T20:45:00Z", now)).toBe("Yesterday, 11:45pm");
    expect(friendlyTime("2026-08-29T20:45:00Z", now)).toBe("29 Aug, 11:45pm");
  });
});
