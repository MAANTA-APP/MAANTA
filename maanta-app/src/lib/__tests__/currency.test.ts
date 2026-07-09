import { describe, expect, it } from "vitest";
import {
  isSupportedCurrency,
  isValidTopupAmount,
  MAX_TOPUP_AMOUNT,
  MIN_TOPUP_AMOUNT,
} from "@/lib/currency";

describe("isSupportedCurrency", () => {
  it("accepts the four supported currencies, case-insensitively", () => {
    expect(isSupportedCurrency("KES")).toBe(true);
    expect(isSupportedCurrency("usd")).toBe(true);
    expect(isSupportedCurrency("Eur")).toBe(true);
    expect(isSupportedCurrency("GBP")).toBe(true);
  });

  it("rejects unsupported currencies and non-string input", () => {
    expect(isSupportedCurrency("JPY")).toBe(false);
    expect(isSupportedCurrency(123)).toBe(false);
    expect(isSupportedCurrency(null)).toBe(false);
    expect(isSupportedCurrency(undefined)).toBe(false);
    expect(isSupportedCurrency({})).toBe(false);
  });
});

describe("isValidTopupAmount", () => {
  it("accepts numbers within [MIN_TOPUP_AMOUNT, MAX_TOPUP_AMOUNT]", () => {
    expect(isValidTopupAmount(MIN_TOPUP_AMOUNT)).toBe(true);
    expect(isValidTopupAmount(MAX_TOPUP_AMOUNT)).toBe(true);
    expect(isValidTopupAmount(500)).toBe(true);
    expect(isValidTopupAmount(499.99)).toBe(true);
  });

  it("rejects amounts outside the bounds", () => {
    expect(isValidTopupAmount(0)).toBe(false);
    expect(isValidTopupAmount(-100)).toBe(false);
    expect(isValidTopupAmount(MIN_TOPUP_AMOUNT - 0.01)).toBe(false);
    expect(isValidTopupAmount(MAX_TOPUP_AMOUNT + 1)).toBe(false);
  });

  it("rejects non-finite and non-numeric input, closing the coercion gap in the old `amount <= 0` check", () => {
    expect(isValidTopupAmount(Number.NaN)).toBe(false);
    expect(isValidTopupAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidTopupAmount(Number.NEGATIVE_INFINITY)).toBe(false);
    // `"500" <= 0` is `false` in JS (numeric coercion), so a string slipped
    // through the old check when positive — but Math.round("500" * 100)
    // still worked by accident. The real gap was objects/arrays/booleans.
    expect(isValidTopupAmount("500")).toBe(false);
    expect(isValidTopupAmount(null)).toBe(false);
    expect(isValidTopupAmount(undefined)).toBe(false);
    expect(isValidTopupAmount(true)).toBe(false);
    expect(isValidTopupAmount([500])).toBe(false);
    expect(isValidTopupAmount({ amount: 500 })).toBe(false);
  });
});
