import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { staticFallbackProvider, FALLBACK_KES_PER_UNIT } from "../fallback";
import { openErApiProvider, __resetFxCache } from "../remote";
import { kesPerUnit } from "../index";
import type { FxRateProvider } from "../types";
import { toKes } from "@/lib/currency";

// open.er-api.com is base-KES: rates[X] = X per 1 KES. USD 0.00775 → ~129 KES/USD.
function okResponse(rates: Record<string, number>) {
  return { ok: true, json: () => Promise.resolve({ rates }) };
}

const fetchMock = vi.fn();

beforeEach(() => {
  __resetFxCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("staticFallbackProvider", () => {
  it("returns KES-per-unit for supported currencies", async () => {
    expect(await staticFallbackProvider.kesPerUnit("KES")).toBe(1);
    expect(await staticFallbackProvider.kesPerUnit("USD")).toBe(FALLBACK_KES_PER_UNIT.USD);
    expect(await staticFallbackProvider.kesPerUnit("GBP")).toBe(163);
  });
});

describe("openErApiProvider", () => {
  it("KES resolves to 1 without any network call", async () => {
    expect(await openErApiProvider.kesPerUnit("KES")).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("inverts base-KES rates to KES-per-unit", async () => {
    fetchMock.mockResolvedValue(okResponse({ USD: 0.008, EUR: 0.0071 }));
    // 1 / 0.008 = 125 KES per USD
    expect(await openErApiProvider.kesPerUnit("USD")).toBeCloseTo(125, 6);
  });

  it("caches: a second lookup does not refetch within the TTL", async () => {
    fetchMock.mockResolvedValue(okResponse({ USD: 0.008 }));
    await openErApiProvider.kesPerUnit("USD");
    await openErApiProvider.kesPerUnit("USD");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on a non-OK response (→ registry falls through)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) });
    expect(await openErApiProvider.kesPerUnit("USD")).toBeNull();
  });

  it("returns null on a malformed response shape", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ nope: true }) });
    expect(await openErApiProvider.kesPerUnit("USD")).toBeNull();
  });

  it("returns null when the fetch itself throws (timeout/network)", async () => {
    fetchMock.mockRejectedValue(new Error("aborted"));
    expect(await openErApiProvider.kesPerUnit("USD")).toBeNull();
  });
});

describe("kesPerUnit registry", () => {
  it("takes the first positive answer in the chain", async () => {
    const a: FxRateProvider = { name: "a", kesPerUnit: async () => 100 };
    const b: FxRateProvider = { name: "b", kesPerUnit: async () => 200 };
    expect(await kesPerUnit("USD", [a, b])).toBe(100);
  });

  it("falls through a provider that returns null", async () => {
    const dead: FxRateProvider = { name: "dead", kesPerUnit: async () => null };
    const live: FxRateProvider = { name: "live", kesPerUnit: async () => 130 };
    expect(await kesPerUnit("USD", [dead, live])).toBe(130);
  });

  it("skips non-positive / non-finite answers", async () => {
    const zero: FxRateProvider = { name: "zero", kesPerUnit: async () => 0 };
    const nan: FxRateProvider = { name: "nan", kesPerUnit: async () => Number.NaN };
    const ok: FxRateProvider = { name: "ok", kesPerUnit: async () => 129 };
    expect(await kesPerUnit("USD", [zero, nan, ok])).toBe(129);
  });

  it("returns null when no provider can answer", async () => {
    const dead: FxRateProvider = { name: "dead", kesPerUnit: async () => null };
    expect(await kesPerUnit("USD", [dead])).toBeNull();
  });

  it("default chain falls back to the static rate when live FX is down", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    // No explicit chain → default [live, fallback]; live fails → fallback answers.
    expect(await kesPerUnit("USD")).toBe(FALLBACK_KES_PER_UNIT.USD);
  });
});

describe("toKes (behaviour preserved through the abstraction)", () => {
  it("passes KES through unchanged without a network call", async () => {
    expect(await toKes(5000, "KES")).toBe(5000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses live rates when available (amount / unitPerKes)", async () => {
    fetchMock.mockResolvedValue(okResponse({ USD: 0.008 }));
    // 100 USD * (1 / 0.008) = 12,500 KES — identical to the old amount/rate math.
    expect(await toKes(100, "USD")).toBeCloseTo(12_500, 6);
  });

  it("falls back to the static rate when the provider is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    expect(await toKes(100, "USD")).toBe(100 * FALLBACK_KES_PER_UNIT.USD);
  });
});
