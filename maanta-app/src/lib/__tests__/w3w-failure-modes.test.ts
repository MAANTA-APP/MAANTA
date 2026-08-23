import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertToCoordinates, convertTo3Words } from "@/lib/what3words";
import { relativeAge, relativeAgo } from "@/lib/ui";

/**
 * Found by running the real E2E against production on 2026-08-23.
 *
 * Every what3words lookup was failing — including what3words' own canonical
 * example `filled.count.soap` — and the app reported it as
 * "That address didn't resolve — check the three words and try again."
 * The `!res.ok` branch was fused with the no-coordinates branch and logged
 * nothing, so a dead integration was indistinguishable from an operator
 * mistyping, on both the merchant onboarding wizard and the admin pick-up
 * location panel. It cost an hour to find and would have cost a Nairobi
 * merchant their onboarding with no way to know why.
 *
 * These tests pin the split: refusal (ours) vs not-found (theirs), and that a
 * refusal is logged rather than swallowed.
 */

const realFetch = globalThis.fetch;

function mockFetch(res: { ok: boolean; status: number; json: unknown }) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: res.ok,
    status: res.status,
    json: () => Promise.resolve(res.json),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env.W3W_API_KEY = "test-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("what3words — a provider refusal is not an operator mistake", () => {
  it("reports a 401 (bad or expired key) as upstream_rejected, not as a wrong address", async () => {
    mockFetch({
      ok: false,
      status: 401,
      json: { error: { code: "InvalidKey", message: "Authentication failed" } },
    });

    const result = await convertToCoordinates("filled.count.soap");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("upstream_rejected");
    // The exact regression: this must NOT tell the person to check their words.
    expect(result.error).not.toMatch(/check the three words/i);
    expect(result.error).toMatch(/temporarily unavailable/i);
  });

  it("logs the upstream status and provider error code, so the cause is visible", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch({
      ok: false,
      status: 402,
      json: { error: { code: "QuotaExceeded", message: "Quota exceeded" } },
    });

    await convertToCoordinates("filled.count.soap");

    expect(spy).toHaveBeenCalled();
    const [, payload] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.status).toBe(402);
    expect(payload.w3wCode).toBe("QuotaExceeded");
  });

  it("never logs the API key or the address — both are secrets or PII (D85)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.W3W_API_KEY = "super-secret-key";
    mockFetch({ ok: false, status: 401, json: { error: { code: "InvalidKey" } } });

    await convertToCoordinates("filled.count.soap");

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).not.toContain("super-secret-key");
    expect(logged).not.toContain("filled.count.soap");
  });

  it("still blames the address when what3words answers 200 with no match", async () => {
    mockFetch({ ok: true, status: 200, json: { coordinates: null } });

    const result = await convertToCoordinates("no.such.place");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("not_found");
    expect(result.error).toMatch(/check the three words/i);
  });

  it("resolves normally when the provider is healthy", async () => {
    mockFetch({
      ok: true,
      status: 200,
      json: { coordinates: { lat: -1.2746, lng: 36.8501 }, nearestPlace: "Nairobi" },
    });

    const result = await convertToCoordinates("zoomed.newer.apple");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lat).toBeCloseTo(-1.2746);
    expect(result.lng).toBeCloseTo(36.8501);
  });

  it("applies the same split to the reverse lookup", async () => {
    mockFetch({ ok: false, status: 401, json: { error: { code: "InvalidKey" } } });

    const result = await convertTo3Words(-1.2746, 36.8501);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("upstream_rejected");
  });
});

describe("relativeAgo — no more 'Submitted now ago'", () => {
  it("says 'just now' instead of gluing 'ago' onto 'now'", () => {
    const justNow = new Date().toISOString();
    expect(relativeAge(justNow)).toBe("now");
    expect(relativeAgo(justNow)).toBe("just now");
    expect(relativeAgo(justNow)).not.toContain("now ago");
  });

  it("keeps the normal phrasing for everything older", () => {
    const fiveMinutes = new Date(Date.now() - 5 * 60_000).toISOString();
    const threeHours = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const twoDays = new Date(Date.now() - 2 * 86_400_000).toISOString();

    expect(relativeAgo(fiveMinutes)).toBe("5m ago");
    expect(relativeAgo(threeHours)).toBe("3h ago");
    expect(relativeAgo(twoDays)).toBe("2d ago");
  });
});
