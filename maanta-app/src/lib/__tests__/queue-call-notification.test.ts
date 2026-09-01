import { describe, expect, it } from "vitest";
import { isActionableQueueCallNotification } from "../queue-call-notification";

const active = {
  presentationId: "presentation-1",
  expiresAt: "2026-09-01T15:10:00Z",
  presentationStatus: "called",
  redemptionStatus: "pending",
};

describe("isActionableQueueCallNotification", () => {
  it("shows a live called presentation with a pending redemption", () => {
    expect(isActionableQueueCallNotification(active)).toBe(true);
  });

  it("hides durable evidence whose ephemeral presentation was deleted", () => {
    expect(
      isActionableQueueCallNotification({
        ...active,
        presentationId: null,
        presentationStatus: null,
        redemptionStatus: null,
      })
    ).toBe(false);
  });

  it.each([
    ["cancelled", "pending"],
    ["dismissed", "pending"],
    ["called", "success"],
    ["called", "flagged"],
  ])("hides presentation=%s redemption=%s", (presentationStatus, redemptionStatus) => {
    expect(
      isActionableQueueCallNotification({
        ...active,
        presentationStatus,
        redemptionStatus,
      })
    ).toBe(false);
  });

  it("does not classify a generic historical notification as an orphaned queue call", () => {
    expect(
      isActionableQueueCallNotification({
        presentationId: null,
        expiresAt: null,
        presentationStatus: null,
        redemptionStatus: null,
      })
    ).toBe(true);
  });
});
