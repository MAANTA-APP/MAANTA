import { describe, expect, it } from "vitest";
import {
  SETTLE_WAIT_LIMIT_MS,
  initialStageFromStripeReturn,
  moneyMoved,
  settlementOutcome,
} from "@/lib/topup-settlement";

/**
 * `R-STRIPE-PHASE-1`: **pending never means credited.**
 *
 * The bug this locks out: the card rail used to render the green success
 * takeover the instant Stripe redirected back, with `added: 0` and the
 * pre-payment balance — claiming a credit the webhook had not made.
 *
 * The second failure mode is the mirror image: telling a merchant whose card was
 * charged that "no money left your account", which is false and invites a second
 * payment. The two rails fail differently and must say different things.
 */

describe("initialStageFromStripeReturn", () => {
  it("treats a Stripe success return as CONFIRMING, never as credited", () => {
    // Stripe redirects when the checkout session completes, which is before our
    // webhook has necessarily credited anything.
    expect(initialStageFromStripeReturn("success")).toEqual({
      kind: "confirming",
      rail: "card",
    });
  });

  it("treats a cancellation as a failure that took no money", () => {
    const stage = initialStageFromStripeReturn("cancelled");
    expect(stage.kind).toBe("failed");
    expect(stage.kind === "failed" && stage.message).toMatch(/No money left your account/);
  });

  it("starts on the form with no return parameter", () => {
    expect(initialStageFromStripeReturn(null)).toEqual({ kind: "form" });
    expect(initialStageFromStripeReturn("something-else")).toEqual({ kind: "form" });
  });
});

describe("settlementOutcome — only a real balance increase means credited", () => {
  const base = { startBalance: 1000, elapsedMs: 4000 };

  it("keeps waiting while the balance is unchanged", () => {
    expect(settlementOutcome({ ...base, rail: "card", balanceNow: 1000 })).toBeNull();
  });

  it("keeps waiting when the balance could not be read", () => {
    // A failed poll must not be mistaken for "not credited yet, give up".
    expect(settlementOutcome({ ...base, rail: "card", balanceNow: null })).toBeNull();
  });

  it("credits with the OBSERVED delta, not the amount requested", () => {
    expect(settlementOutcome({ ...base, rail: "card", balanceNow: 4000 })).toEqual({
      kind: "credited",
      added: 3000,
      newBalance: 4000,
    });
  });

  it("does not credit on a balance that went down", () => {
    // A success fee debiting mid-poll must never read as a top-up.
    expect(settlementOutcome({ ...base, rail: "card", balanceNow: 970 })).toBeNull();
  });

  it("credits even at the timeout boundary if the money arrived", () => {
    const stage = settlementOutcome({
      rail: "card",
      startBalance: 1000,
      balanceNow: 2000,
      elapsedMs: SETTLE_WAIT_LIMIT_MS + 60_000,
    });
    expect(stage?.kind).toBe("credited");
  });
});

describe("settlementOutcome — the two rails fail differently", () => {
  const timedOut = {
    startBalance: 1000,
    balanceNow: 1000,
    elapsedMs: SETTLE_WAIT_LIMIT_MS + 1,
  };

  it("an unaccepted STK push is a failure, and says no money moved", () => {
    const stage = settlementOutcome({ ...timedOut, rail: "mpesa" })!;
    expect(stage.kind).toBe("failed");
    expect(stage.kind === "failed" && stage.message).toMatch(/No money left your account/);
  });

  it("a charged card that hasn't credited is UNSETTLED, not failed", () => {
    const stage = settlementOutcome({ ...timedOut, rail: "card" })!;
    expect(stage.kind).toBe("unsettled");
  });

  it("never tells a charged-card merchant that no money moved", () => {
    // The exact false statement to guard against — it would invite a second
    // payment for money Stripe has already taken.
    const stage = settlementOutcome({ ...timedOut, rail: "card" })!;
    const message = stage.kind === "unsettled" ? stage.message : "";
    expect(message).not.toMatch(/no money/i);
    expect(message).toMatch(/went through/i);
    expect(message).toMatch(/support/i);
  });
});

describe("moneyMoved", () => {
  it("is true once credited", () => {
    expect(moneyMoved({ kind: "credited", added: 100, newBalance: 1100 })).toBe(true);
  });

  it("is true for a card payment in flight or unsettled — Stripe has it", () => {
    expect(moneyMoved({ kind: "confirming", rail: "card" })).toBe(true);
    expect(moneyMoved({ kind: "unsettled", rail: "card", message: "x" })).toBe(true);
  });

  it("is false for an STK push still awaiting approval", () => {
    expect(moneyMoved({ kind: "confirming", rail: "mpesa" })).toBe(false);
  });

  it("is false on the form and on a failure", () => {
    expect(moneyMoved({ kind: "form" })).toBe(false);
    expect(moneyMoved({ kind: "failed", message: "cancelled" })).toBe(false);
  });
});
