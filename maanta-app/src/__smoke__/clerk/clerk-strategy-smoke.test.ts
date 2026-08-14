import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Clerk-strategy smoke test — the CI leg production was missing.
 *
 * ## Why this file exists
 *
 * Twice now, code that was green through every gate failed in production
 * because the failing branch only executes under the Clerk auth strategy,
 * which CI never runs:
 *
 *  - **D70** — a client page hydrated into the Supabase branch on a Clerk
 *    build and called `supabase.auth.getSession()` on an `accessToken` client.
 *  - **The 2026-08-14 P0 (#203)** — the server factory passed `accessToken`
 *    AND an SSR cookie adapter, so every Clerk server request threw while
 *    constructing the client, before `claim_deal` or `verify_redemption` ran.
 *
 * The unit suites added with #203 force the Clerk branch **by mocking the
 * strategy module**. That proves the factory's branches; it does not prove the
 * env-var resolution that picks the branch — which is where D70 lived. This
 * file closes that gap: it sets `MAANTA_AUTH_STRATEGY` and
 * `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` to `clerk` and lets the **real**
 * `@/lib/auth/strategy` and the **real** `@/lib/supabase/server` run.
 *
 * Mock boundaries, deliberately chosen and narrow:
 *  - external packages only for the machinery under test — `@supabase/ssr`
 *    (with a stand-in for the supabase-js guard that fired in production),
 *    `@supabase/supabase-js`, `next/headers`, `@clerk/nextjs/server`;
 *  - peripheral request context the routes need but this file does not test —
 *    `@/lib/auth` (identity lookup), `@/lib/merchant-api` (merchant context),
 *    rate-limit, analytics, geo/what3words, and the service-role client.
 *    Strategy resolution and anon-client construction are never mocked here;
 *    they are the subject.
 *
 * Scope limit, stated: this covers server-side strategy resolution and server
 * client construction. It cannot cover D70's browser half (build-time env
 * inlining + hydration) — that would need a built-output check, and the
 * import-graph side is already guarded by `auth-strategy-boundary.test.ts`.
 */

// ── external package boundaries ─────────────────────────────────────────────

const getTokenMock = vi.fn(() => Promise.resolve("clerk-jwt"));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ getToken: getTokenMock }),
  currentUser: () =>
    Promise.resolve({
      phoneNumbers: [{ verification: { status: "verified" } }],
    }),
}));

const cookiesReadMock = vi.fn(() => ({ getAll: () => [], set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => cookiesReadMock() }));

/** Faithful stand-in for the guard that fired in production. */
const ssrCreateServerClient = vi.fn(
  (url: string, key: string, opts: Record<string, unknown>) => {
    if (opts?.accessToken && opts?.cookies) {
      throw new Error(
        "@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.onAuthStateChange is not possible"
      );
    }
    return { __kind: "ssr", opts, rpc: vi.fn(), from: vi.fn() };
  }
);
vi.mock("@supabase/ssr", () => ({
  createServerClient: (u: string, k: string, o: Record<string, unknown>) =>
    ssrCreateServerClient(u, k, o),
}));

const anonRpcSingle = vi.fn();
const anonRpc = vi.fn(() => ({ single: anonRpcSingle }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (_u: string, _k: string, opts: Record<string, unknown>) => ({
    __kind: "supabase-js",
    opts,
    rpc: anonRpc,
    from: vi.fn(),
  }),
}));

// ── peripheral request context (not under test) ─────────────────────────────

vi.mock("@/lib/auth", () => ({
  ensureAppUser: () => Promise.resolve({ id: "user-1" }),
  currentClerkUserId: () => Promise.resolve(null),
  currentUserHasVerifiedPhone: () => Promise.resolve(true),
}));

vi.mock("@/lib/merchant-api", () => ({
  requireMerchant: () =>
    Promise.resolve({
      ctx: { merchant: { id: "merchant-1", node: "node-0" } },
    }),
}));

// Every service read in the verify tail resolves to "no row" — collect line
// and masked phone are display values the route must tolerate missing.
const serviceChain = {
  select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
};
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: vi.fn(), from: () => serviceChain }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => Promise.resolve(true),
  CLAIM_RATE_LIMIT: 5,
  CLAIM_RATE_WINDOW_SECONDS: 60,
  OTP_CHECK_RATE_LIMIT: 20,
  OTP_CHECK_RATE_WINDOW_SECONDS: 60,
}));

vi.mock("@/lib/analytics", () => ({
  captureDealClaimed: vi.fn(),
  captureGuardianOutcome: vi.fn(),
}));

vi.mock("@/lib/what3words", () => ({
  convertWhat3WordsToCoordinates: vi.fn(),
  distanceMeters: () => 0,
}));
vi.mock("@/lib/geo", () => ({ parseGpsCoords: () => null }));

// Real strategy module, real factory, real routes — the subjects.
import { authStrategy, isClerkAuth } from "@/lib/auth/strategy";
import { createClient } from "@/lib/supabase/server";
import { POST as claimPOST } from "@/app/api/redemptions/route";
import { POST as verifyPOST } from "@/app/api/redemptions/verify/route";

type Constructed = { __kind: string; opts: Record<string, unknown> };

const req = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
  });

const ENV_KEYS = [
  "MAANTA_AUTH_STRATEGY",
  "NEXT_PUBLIC_MAANTA_AUTH_STRATEGY",
] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  // Production's configuration, which no other CI path sets.
  process.env.MAANTA_AUTH_STRATEGY = "clerk";
  process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY = "clerk";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("real strategy resolution under Clerk env vars", () => {
  it("resolves clerk from the environment, not from a mock", () => {
    expect(authStrategy()).toBe("clerk");
    expect(isClerkAuth()).toBe(true);
  });

  it("constructs the server client without throwing, via supabase-js with accessToken only", () => {
    const client = createClient() as unknown as Constructed;
    expect(client.__kind).toBe("supabase-js");
    expect(Object.keys(client.opts)).toEqual(["accessToken"]);
    expect(ssrCreateServerClient).not.toHaveBeenCalled();
    expect(cookiesReadMock).not.toHaveBeenCalled();
  });
});

describe("shopper claim under real Clerk resolution", () => {
  it("reaches claim_deal and returns the ticket", async () => {
    anonRpcSingle.mockResolvedValue({
      data: {
        redemption_id: "red-1",
        otp_code: "123456",
        redemption_expires_at: "2026-08-14T12:00:00Z",
        merchant_id: "merchant-1",
        what3words_address: "stove.cactus.rally",
      },
      error: null,
    });

    const res = await claimPOST(req("/api/redemptions", { dealId: "deal-1" }));

    expect(anonRpc).toHaveBeenCalledWith(
      "claim_deal",
      expect.objectContaining({ p_user_id: "user-1", p_deal_id: "deal-1" })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ redemptionId: "red-1" });
  });
});

describe("merchant verification under real Clerk resolution", () => {
  it("reaches verify_redemption and returns the verification payload", async () => {
    anonRpcSingle.mockResolvedValue({
      data: {
        redemption_id: "red-1",
        redemption_status: "success",
        fee_charge_status: "charged",
        fee_amount: 30,
        new_balance: 470,
        new_arrears: 0,
        deal_id: "deal-1",
        deal_claims_count: 1,
        disputed: false,
        guardian_recommendation: "clear",
        guardian_severity: null,
      },
      error: null,
    });

    const res = await verifyPOST(
      req("/api/redemptions/verify", { otpCode: "123456" })
    );

    expect(anonRpc).toHaveBeenCalledWith(
      "verify_redemption",
      expect.objectContaining({ p_merchant_id: "merchant-1", p_otp_code: "123456" })
    );
    expect(res.status).toBe(200);
    // Fee semantics live in the RPC; the route passes them through unchanged.
    await expect(res.json()).resolves.toMatchObject({
      redemptionId: "red-1",
      feeChargeStatus: "charged",
      feeAmount: 30,
    });
  });

  it("maps an invalid code to a rejection, not a 500", async () => {
    anonRpcSingle.mockResolvedValue({
      data: null,
      error: { message: "redemption_not_found_or_already_used" },
    });

    const res = await verifyPOST(
      req("/api/redemptions/verify", { otpCode: "000000" })
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid or already-used code.",
    });
  });
});

describe("default resolution with no strategy env", () => {
  it("falls back to supabase and the SSR cookie client", () => {
    delete process.env.MAANTA_AUTH_STRATEGY;
    delete process.env.NEXT_PUBLIC_MAANTA_AUTH_STRATEGY;

    expect(authStrategy()).toBe("supabase");
    const client = createClient() as unknown as Constructed;
    expect(client.__kind).toBe("ssr");
    expect(client.opts).toHaveProperty("cookies");
    expect(client.opts).not.toHaveProperty("accessToken");
  });
});
