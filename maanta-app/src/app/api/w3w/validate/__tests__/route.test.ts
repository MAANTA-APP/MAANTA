import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D162 — the ROUTE half of the what3words contract.
 *
 * `w3w-failure-modes.test.ts` pins the client (`convertToCoordinates`). This
 * pins what the onboarding wizard actually receives, because the wizard's gate
 * is `if (!res.ok || !body.valid) show error`, and "Continue" only enables once
 * a resolved address is set. Two properties matter and neither is obvious from
 * the client tests:
 *
 *   1. A provider refusal must arrive as a NON-2xx carrying `valid: false`, so
 *      the wizard blocks. Returning 200 + a friendly message would let a future
 *      refactor treat "the service is down" as "the merchant may continue".
 *   2. The wizard must never be told the merchant mistyped when the truth is
 *      that MAANTA's what3words account is over quota (HTTP 402).
 *
 * Deliberately NOT tested here: any fallback that lets onboarding proceed
 * without a validated address. There is no such path and the founder brief of
 * 2026-08-23 says not to invent one — the shop's findability in-mall is the
 * whole point of the field.
 */

const convertToCoordinatesMock = vi.fn();

vi.mock("@/lib/what3words", async () => {
  const actual = await vi.importActual<typeof import("@/lib/what3words")>(
    "@/lib/what3words"
  );
  return {
    ...actual,
    convertToCoordinates: (...args: unknown[]) => convertToCoordinatesMock(...args),
  };
});

vi.mock("@/lib/auth", () => ({
  currentClerkUserId: () => Promise.resolve("user_test"),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  W3W_VALIDATE_RATE_LIMIT: 10,
  W3W_VALIDATE_RATE_WINDOW_SECONDS: 60,
}));

const req = (words: string) =>
  new Request(`https://maanta.app/api/w3w/validate?words=${encodeURIComponent(words)}`);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.W3W_API_KEY = "test-key";
});

describe("GET /api/w3w/validate — provider failure vs bad address", () => {
  it("returns 502 and serviceDown when the provider refuses (the live 402 QuotaExceeded case)", async () => {
    convertToCoordinatesMock.mockResolvedValue({
      ok: false,
      code: "upstream_rejected",
      error: "Address checking is temporarily unavailable — try again shortly.",
    });
    const { GET } = await import("../route");

    const res = await GET(req("filled.count.soap"));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.valid).toBe(false);
    expect(body.serviceDown).toBe(true);
    expect(body.code).toBe("upstream_rejected");
    // The exact regression: never blame the merchant's typing for our billing.
    expect(body.error).not.toMatch(/check the three words/i);
  });

  it("keeps onboarding BLOCKED while the provider is down — valid is false, so the wizard cannot continue", async () => {
    convertToCoordinatesMock.mockResolvedValue({
      ok: false,
      code: "upstream_rejected",
      error: "Address checking is temporarily unavailable — try again shortly.",
    });
    const { GET } = await import("../route");

    const res = await GET(req("filled.count.soap"));
    const body = await res.json();

    // The wizard gate is `!res.ok || !body.valid`. Both halves must hold, so a
    // future change to either one alone still blocks.
    expect(res.ok).toBe(false);
    expect(body.valid).toBe(false);
    expect(body.words).toBeUndefined();
    expect(body.lat).toBeUndefined();
  });

  it("still returns 200 and blames the address when what3words genuinely has no match", async () => {
    convertToCoordinatesMock.mockResolvedValue({
      ok: false,
      code: "not_found",
      error: "That address didn't resolve — check the three words and try again.",
    });
    const { GET } = await import("../route");

    const res = await GET(req("no.such.place"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.valid).toBe(false);
    expect(body.serviceDown).toBe(false);
    expect(body.error).toMatch(/check the three words/i);
  });

  it("passes a healthy lookup through with the coordinates the wizard needs", async () => {
    convertToCoordinatesMock.mockResolvedValue({
      ok: true,
      words: "filled.count.soap",
      lat: -1.2746,
      lng: 36.8501,
      nearestPlace: "Nairobi",
    });
    const { GET } = await import("../route");

    const res = await GET(req("filled.count.soap"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.words).toBe("filled.count.soap");
    expect(body.lat).toBeCloseTo(-1.2746);
    expect(body.lng).toBeCloseTo(36.8501);
  });

  it("never leaks the API key in the response", async () => {
    process.env.W3W_API_KEY = "super-secret-key";
    convertToCoordinatesMock.mockResolvedValue({
      ok: false,
      code: "upstream_rejected",
      error: "Address checking is temporarily unavailable — try again shortly.",
    });
    const { GET } = await import("../route");

    const res = await GET(req("filled.count.soap"));
    const text = JSON.stringify(await res.json());

    expect(text).not.toContain("super-secret-key");
  });
});
