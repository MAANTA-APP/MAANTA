import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FX_CACHE_TTL_MS,
  StaticFxProvider,
  OpenErApiProvider,
  configureFxProvider,
  getActiveFxProvider,
  ratesFromKes,
  resetFxCache,
} from "@/lib/fx";
import type { FxProvider } from "@/lib/fx";
import { toKes } from "@/lib/currency";

// Restore the launch default after each test so module-level provider/cache
// state never leaks between tests.
afterEach(() => {
  configureFxProvider(new OpenErApiProvider());
});

describe("FX provider abstraction (E9)", () => {
  it("defaults to the keyless open.er-api.com provider", () => {
    expect(getActiveFxProvider().name).toBe("open.er-api.com");
  });

  it("StaticFxProvider returns its fixed map", async () => {
    const p = new StaticFxProvider({ USD: 0.0077, EUR: 0.0071 }, "pinned");
    expect(p.name).toBe("pinned");
    expect(await p.ratesFromKes()).toEqual({ USD: 0.0077, EUR: 0.0071 });
  });

  it("ratesFromKes uses whichever provider is configured", async () => {
    configureFxProvider(new StaticFxProvider({ USD: 0.008 }));
    expect(await ratesFromKes()).toEqual({ USD: 0.008 });
  });

  it("caches within the TTL and refetches after it (provider hit once per window)", async () => {
    const spy = vi.fn(async () => ({ USD: 0.0077 }));
    const provider: FxProvider = { name: "spy", ratesFromKes: spy };
    configureFxProvider(provider); // clears cache

    const t0 = 1_000_000;
    await ratesFromKes(t0);
    await ratesFromKes(t0 + FX_CACHE_TTL_MS - 1); // still cached
    expect(spy).toHaveBeenCalledTimes(1);

    await ratesFromKes(t0 + FX_CACHE_TTL_MS + 1); // window elapsed → refetch
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed fetch (null) — it retries next call", async () => {
    const spy = vi.fn(async () => null);
    configureFxProvider({ name: "down", ratesFromKes: spy });
    const t0 = 2_000_000;
    expect(await ratesFromKes(t0)).toBeNull();
    expect(await ratesFromKes(t0)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("toKes over the abstraction", () => {
  it("passes KES through untouched (no provider call)", async () => {
    const spy = vi.fn(async () => ({ USD: 0.0077 }));
    configureFxProvider({ name: "spy", ratesFromKes: spy });
    resetFxCache();
    expect(await toKes(500, "KES")).toBe(500);
    expect(spy).not.toHaveBeenCalled();
  });

  it("converts using the active provider's live rate (amount / perKes)", async () => {
    // 1 KES = 0.0077 USD ⇒ 10 USD = 10 / 0.0077 ≈ 1298.7 KES
    configureFxProvider(new StaticFxProvider({ USD: 0.0077 }));
    resetFxCache();
    expect(await toKes(10, "USD")).toBeCloseTo(10 / 0.0077, 5);
  });

  it("falls back to the static rate when the provider is down", async () => {
    configureFxProvider({ name: "down", ratesFromKes: async () => null });
    resetFxCache();
    // FALLBACK_KES_RATE.USD = 129 ⇒ 2 USD → 258 KES
    expect(await toKes(2, "USD")).toBe(258);
  });

  it("falls back to the static rate when the map lacks the currency", async () => {
    configureFxProvider(new StaticFxProvider({ USD: 0.0077 })); // no GBP
    resetFxCache();
    // FALLBACK_KES_RATE.GBP = 163 ⇒ 1 GBP → 163 KES
    expect(await toKes(1, "GBP")).toBe(163);
  });
});
