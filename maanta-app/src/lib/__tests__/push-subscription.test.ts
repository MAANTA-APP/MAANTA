import { describe, it, expect } from "vitest";
import { parsePushSubscription } from "@/lib/push-subscription";

describe("push-subscription", () => {
  it("accepts a minimal valid subscription", () => {
    const parsed = parsePushSubscription({
      endpoint: "https://push.example.com/send/abc",
      keys: { p256dh: "key", auth: "auth" },
    });
    expect(parsed?.endpoint).toBe("https://push.example.com/send/abc");
  });

  it("rejects missing endpoint", () => {
    expect(parsePushSubscription({ keys: { p256dh: "k", auth: "a" } })).toBeNull();
  });

  it("rejects oversized payloads", () => {
    expect(
      parsePushSubscription({
        endpoint: "https://push.example.com/send/abc",
        keys: { p256dh: "x".repeat(9000), auth: "y".repeat(9000) },
      })
    ).toBeNull();
  });
});
