import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server Supabase client construction, per auth strategy (P0, 2026-08-14).
 *
 * The defect this locks out: the Clerk branch passed **both** `accessToken` and
 * a cookie adapter to `@supabase/ssr`'s `createServerClient`. That wrapper
 * subscribes to `supabase.auth.onAuthStateChange` while constructing, and
 * `supabase-js` refuses any access to `supabase.auth` once `accessToken` is
 * set, so construction threw on every Clerk-authenticated server request —
 * confirmed in production as an HTTP 500 from `POST /api/redemptions`, raised
 * before `claim_deal` ran.
 *
 * Nothing caught it because CI, local dev and every other test run use the
 * Supabase strategy, which took the branch that was already correct. The broken
 * branch executes only when both strategy variables say `clerk` — production
 * and nowhere else. So these tests do the one thing the suite never did: run
 * the Clerk branch.
 *
 * `guardedCreateServerClient` reproduces the supabase-js guard rather than
 * trusting a comment about it. If anyone reunites the two options, the last
 * test in this file fails the way production did.
 */

const isSupabaseAuthMock = vi.fn();
vi.mock("@/lib/auth/strategy", () => ({
  isSupabaseAuth: () => isSupabaseAuthMock(),
}));

const cookiesMock = vi.fn(() => ({
  getAll: () => [{ name: "sb-token", value: "x" }],
  set: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
}));

const getTokenMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ getToken: getTokenMock }),
}));

/**
 * Stand-in for the real guard in `@supabase/supabase-js`: once `accessToken` is
 * configured, touching `supabase.auth` throws. `@supabase/ssr` touches it while
 * wiring cookie sessions, so the two options together are fatal.
 */
const ssrCreateServerClient = vi.fn((url: string, key: string, opts: Record<string, unknown>) => {
  if (opts?.accessToken && opts?.cookies) {
    throw new Error(
      "@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.onAuthStateChange is not possible"
    );
  }
  return { __kind: "ssr", url, key, opts, rpc: vi.fn(), from: vi.fn() };
});
vi.mock("@supabase/ssr", () => ({
  createServerClient: (url: string, key: string, opts: Record<string, unknown>) =>
    ssrCreateServerClient(url, key, opts),
}));

const jsCreateClient = vi.fn((url: string, key: string, opts: Record<string, unknown>) => ({
  __kind: "supabase-js",
  url,
  key,
  opts,
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string, opts: Record<string, unknown>) =>
    jsCreateClient(url, key, opts),
}));

import { createClient } from "@/lib/supabase/server";

type Constructed = { __kind: string; opts: Record<string, unknown> };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

describe("Clerk strategy", () => {
  beforeEach(() => isSupabaseAuthMock.mockReturnValue(false));

  it("constructs without throwing", () => {
    // The whole incident in one assertion.
    expect(() => createClient()).not.toThrow();
  });

  it("builds via supabase-js, not the SSR wrapper", () => {
    const client = createClient() as unknown as Constructed;
    expect(client.__kind).toBe("supabase-js");
    expect(jsCreateClient).toHaveBeenCalledTimes(1);
    // The SSR wrapper is what reaches for supabase.auth. It must not be used
    // on a branch that has no cookie session to reconcile.
    expect(ssrCreateServerClient).not.toHaveBeenCalled();
  });

  it("passes accessToken and no cookie adapter", () => {
    const client = createClient() as unknown as Constructed;
    expect(typeof client.opts.accessToken).toBe("function");
    expect(client.opts).not.toHaveProperty("cookies");
    expect(Object.keys(client.opts)).toEqual(["accessToken"]);
  });

  it("does not read request cookies at all", () => {
    createClient();
    // Requesting request state nothing consumes; also the thing that dragged
    // the cookie adapter into this branch in the first place.
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it("resolves the Clerk session token through accessToken()", async () => {
    getTokenMock.mockResolvedValue("clerk-jwt");
    const client = createClient() as unknown as Constructed;
    const accessToken = client.opts.accessToken as () => Promise<string | null>;
    await expect(accessToken()).resolves.toBe("clerk-jwt");
  });

  it("returns a usable query surface", () => {
    const client = createClient();
    expect(typeof client.rpc).toBe("function");
    expect(typeof client.from).toBe("function");
  });
});

describe("Supabase-auth strategy — unchanged", () => {
  beforeEach(() => isSupabaseAuthMock.mockReturnValue(true));

  it("builds via the SSR wrapper with a cookie adapter", () => {
    const client = createClient() as unknown as Constructed;
    expect(client.__kind).toBe("ssr");
    expect(client.opts).toHaveProperty("cookies");
    expect(jsCreateClient).not.toHaveBeenCalled();
  });

  it("passes no accessToken", () => {
    const client = createClient() as unknown as Constructed;
    expect(client.opts).not.toHaveProperty("accessToken");
  });

  it("reads request cookies", () => {
    createClient();
    expect(cookiesMock).toHaveBeenCalled();
  });

  it("keeps a working cookie adapter", () => {
    const client = createClient() as unknown as Constructed;
    const adapter = client.opts.cookies as { getAll: () => { name: string }[] };
    expect(adapter.getAll()[0].name).toBe("sb-token");
  });
});

describe("the guard that fired in production", () => {
  it("still throws if the two options are ever recombined", () => {
    // Not a test of our code — a test that the stand-in above is faithful, so
    // the Clerk assertions mean something. Passing accessToken and cookies
    // together to the SSR wrapper reproduces the exact production error.
    expect(() =>
      ssrCreateServerClient("https://example.supabase.co", "anon-key", {
        accessToken: async () => "t",
        cookies: { getAll: () => [] },
      })
    ).toThrow(/accessing supabase\.auth\.onAuthStateChange is not possible/);
  });
});
