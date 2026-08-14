import { afterEach, describe, expect, it } from "vitest";
import { timeoutSignal, W3W_CLAIM_TIMEOUT_MS } from "@/lib/what3words";

/**
 * Runtime compatibility for the claim-path timeout (P0, 2026-08-14).
 *
 * The bound on the what3words call is the thing standing between a slow
 * provider and a committed claim reported to the shopper as a failure. It must
 * hold on whatever Node version Vercel actually runs — and this repository does
 * not pin that: no `engines`, no `.nvmrc`, no `.node-version`, no
 * `vercel.json`. CI's Node 20 pin governs GitHub Actions only.
 *
 * So the fallback path is not decoration, and testing only the modern path
 * would prove nothing about the case it exists for. The second test deletes
 * `AbortSignal.timeout` for its duration and asserts the helper still produces
 * a signal that aborts — which is exactly what a runtime lacking the method
 * would do.
 */

const original = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");

afterEach(() => {
  if (original) Object.defineProperty(AbortSignal, "timeout", original);
});

describe("timeoutSignal", () => {
  it("uses AbortSignal.timeout when the runtime has it", async () => {
    const signal = timeoutSignal(20);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    await new Promise((r) => setTimeout(r, 60));
    expect(signal?.aborted).toBe(true);
  });

  it("still aborts on a runtime without AbortSignal.timeout", async () => {
    // Simulates the runtime this repository cannot rule out.
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const signal = timeoutSignal(20);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    await new Promise((r) => setTimeout(r, 60));
    expect(signal?.aborted).toBe(true);
  });

  it("does not abort before the deadline", async () => {
    const signal = timeoutSignal(500);
    await new Promise((r) => setTimeout(r, 30));
    // A signal that aborts eagerly would break every healthy lookup.
    expect(signal?.aborted).toBe(false);
  });

  it("bounds the claim path more tightly than the interactive default", () => {
    // The claim-path lookup sits behind a ticket someone is waiting for.
    expect(W3W_CLAIM_TIMEOUT_MS).toBeLessThan(2000);
  });
});
