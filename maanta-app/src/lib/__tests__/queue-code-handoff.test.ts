import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  publishQueueCode,
  subscribeQueueCode,
  publishRedemptionCompleted,
  subscribeRedemptionCompleted,
} from "@/lib/queue-code-handoff";

// D193 (Cursor Security Agent MEDIUM on PR #277): the queue-row tap used to
// navigate to `/merchant/redeem?code=<OTP>`, writing a LIVE redemption
// credential into shared-till browser history, Referer, server access logs
// and PostHog's $current_url. The handoff now happens in component memory on
// the same page; these tests pin the mechanism AND ratchet the source so the
// code cannot quietly return to a URL.

describe("queue-code handoff", () => {
  it("delivers a tapped code to the subscribed keypad", () => {
    const seen: string[] = [];
    const unsub = subscribeQueueCode((c) => seen.push(c));
    expect(publishQueueCode("123456")).toBe(true);
    expect(seen).toEqual(["123456"]);
    unsub();
  });

  it("delivers nothing after unsubscribe — the code dies with the keypad", () => {
    const seen: string[] = [];
    const unsub = subscribeQueueCode((c) => seen.push(c));
    unsub();
    expect(publishQueueCode("123456")).toBe(false);
    expect(seen).toEqual([]);
  });

  it("refuses a malformed code outright", () => {
    const seen: string[] = [];
    const unsub = subscribeQueueCode((c) => seen.push(c));
    expect(publishQueueCode("12345")).toBe(false);
    expect(publishQueueCode("12345a")).toBe(false);
    expect(publishQueueCode("")).toBe(false);
    expect(seen).toEqual([]);
    unsub();
  });

  it("last mounted keypad wins — exactly one listener", () => {
    const first: string[] = [];
    const second: string[] = [];
    const unsub1 = subscribeQueueCode((c) => first.push(c));
    const unsub2 = subscribeQueueCode((c) => second.push(c));
    publishQueueCode("654321");
    expect(first).toEqual([]);
    expect(second).toEqual(["654321"]);
    unsub2();
    unsub1(); // stale unsubscribe must not clobber anything
  });
});

describe("D193 ratchet — the claim code never travels by URL", () => {
  const read = (rel: string) =>
    readFileSync(path.join(__dirname, "../../", rel), "utf8");

  it("the queue panel does not navigate with the code", () => {
    const src = read("app/merchant/(app)/redeem/queue-panel.tsx");
    expect(src).not.toMatch(/redeem\?code/);
    expect(src).not.toMatch(/router\.(push|replace)\(`[^`]*\$\{/);
    expect(src).toContain("publishQueueCode");
  });

  it("the redeem page takes no code from searchParams", () => {
    const src = read("app/merchant/(app)/redeem/page.tsx");
    expect(src).not.toMatch(/searchParams/);
    expect(src).not.toMatch(/prefillCode/);
  });

  it("the keypad receives codes only through the in-memory handoff", () => {
    const src = read("app/merchant/(app)/redeem/redeem-keypad.tsx");
    expect(src).toContain("subscribeQueueCode");
    expect(src).not.toMatch(/prefillCode/);
  });
});

describe("redemption-completed channel (D204)", () => {
  it("notifies every subscriber, and stops after unsubscribe", () => {
    const seen: string[] = [];
    const offA = subscribeRedemptionCompleted(() => seen.push("a"));
    const offB = subscribeRedemptionCompleted(() => seen.push("b"));
    publishRedemptionCompleted();
    expect(seen.sort()).toEqual(["a", "b"]);
    offA();
    seen.length = 0;
    publishRedemptionCompleted();
    expect(seen).toEqual(["b"]);
    offB();
    seen.length = 0;
    publishRedemptionCompleted();
    expect(seen).toEqual([]);
  });

  it("carries no data — it is a refresh nudge, not a payload", () => {
    let args: unknown[] = [];
    const off = subscribeRedemptionCompleted((...a: unknown[]) => {
      args = a;
    });
    publishRedemptionCompleted();
    expect(args).toEqual([]);
    off();
  });

  it("publishing with nobody listening is a harmless no-op", () => {
    expect(() => publishRedemptionCompleted()).not.toThrow();
  });
});
