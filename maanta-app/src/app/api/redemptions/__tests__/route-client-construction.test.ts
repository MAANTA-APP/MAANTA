import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The claim route reaches `claim_deal` under Clerk (P0, 2026-08-14).
 *
 * `route.test.ts` mocks `@/lib/supabase/server` wholesale, which is right for
 * testing error mapping and wrong for this: it replaces the very factory that
 * was broken, so the suite stayed green through a production outage in which
 * **no claim ever reached the database**.
 *
 * So this file deliberately does *not* mock `@/lib/supabase/server`. It runs
 * the real factory over mocked `@supabase/*`, `next/headers` and Clerk, with
 * the strategy forced to Clerk — the branch production runs and CI never did —
 * and asserts the request gets all the way to the RPC.
 *
 * `guardedCreateServerClient` reproduces the supabase-js guard, so if the
 * cookie adapter is ever reunited with `accessToken` this test fails with the
 * production error rather than silently passing.
 */

vi.mock("@/lib/auth/strategy", () => ({
  // Production's branch, and the one no other test exercises.
  isSupabaseAuth: () => false,
  isClerkAuth: () => true,
  phoneOtpEnabled: () => true,
}));

vi.mock("next/headers", () => ({
  cookies: () => ({ getAll: () => [], set: vi.fn() }),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ getToken: () => Promise.resolve("clerk-jwt") }),
  currentUser: () => Promise.resolve({ phoneNumbers: [] }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _k: string, opts: Record<string, unknown>) => {
    if (opts?.accessToken && opts?.cookies) {
      throw new Error(
        "@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.onAuthStateChange is not possible"
      );
    }
    return { rpc: vi.fn(), from: vi.fn() };
  },
}));

const rpcSingleMock = vi.fn();
const rpcMock = vi.fn(() => ({ single: rpcSingleMock }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: rpcMock, from: vi.fn() }),
}));

const ensureAppUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  ensureAppUser: () => ensureAppUserMock(),
  currentClerkUserId: () => Promise.resolve(null),
  // The claim gate reads a verified CONTACT channel — phone or email —
  // since the founder ruling of 2026-08-22. These suites are about the
  // Clerk client construction path (D96), not the gate, so the channel is
  // stubbed satisfied.
  currentUserHasVerifiedContact: () => Promise.resolve(true),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: vi.fn(), from: vi.fn() }),
}));

vi.mock("@/lib/what3words", () => ({
  convertWhat3WordsToCoordinates: vi.fn(),
  distanceMeters: () => 0,
}));

vi.mock("@/lib/geo", () => ({ parseGpsCoords: () => null }));
vi.mock("@/lib/analytics", () => ({ captureDealClaimed: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(true),
  CLAIM_RATE_LIMIT: 5,
  CLAIM_RATE_WINDOW_SECONDS: 60,
}));

import { POST } from "../route";

function req(body: unknown) {
  return new Request("http://localhost/api/redemptions", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/redemptions under the Clerk strategy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    ensureAppUserMock.mockResolvedValue({ id: "user-1" });
  });

  it("reaches claim_deal instead of dying while building the client", async () => {
    rpcSingleMock.mockResolvedValue({
      data: {
        redemption_id: "red-1",
        otp_code: "123456",
        redemption_expires_at: "2026-08-14T12:00:00Z",
        merchant_id: "merchant-1",
        what3words_address: "stove.cactus.rally",
      },
      error: null,
    });

    const res = await POST(req({ dealId: "deal-1" }));

    // Before the fix this was a 500 raised inside createClient(), and the RPC
    // was never called — exactly what production showed.
    expect(rpcMock).toHaveBeenCalledWith(
      "claim_deal",
      expect.objectContaining({ p_user_id: "user-1", p_deal_id: "deal-1" })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ redemptionId: "red-1" });
  });

  it("still maps RPC errors rather than throwing (PR #202 behavior intact)", async () => {
    rpcSingleMock.mockResolvedValue({ data: null, error: { message: "deal_paused" } });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ code: "deal_paused" });
  });

  it("still refuses a duplicate claim rather than minting a second ticket", async () => {
    rpcSingleMock.mockResolvedValue({
      data: null,
      error: { message: "active_claim_already_exists: red-1" },
    });

    const res = await POST(req({ dealId: "deal-1" }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "You already have an active claim on this deal.",
    });
  });
});
