import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

type CookieApi = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: CookieToSet[]) => void;
};

let lastCookieApi: CookieApi | null = null;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: CookieApi }
  ) => {
    lastCookieApi = opts.cookies;
    return {
      auth: {
        exchangeCodeForSession,
        verifyOtp,
      },
    };
  },
}));

describe("GET /auth/callback", () => {
  it("exchanges PKCE code and redirects to /app-bootstrap (prod email-link success)", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });
    verifyOtp.mockReset();

    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://www.maanta.app/auth/callback?code=pkce-code&next=/app-bootstrap"
    );
    const res = await GET(req);

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/app-bootstrap"
    );
  });

  it("canonicalizes apex callback host to www on success", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://maanta.app/auth/callback?code=pkce-from-apex&next=/app-bootstrap"
    );
    const res = await GET(req);

    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/app-bootstrap"
    );
  });

  it("verifies token_hash without PKCE (email-client handoff)", async () => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockResolvedValueOnce({ error: null });

    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://www.maanta.app/auth/callback?token_hash=th_abc&type=email&next=/app-bootstrap"
    );
    const res = await GET(req);

    expect(verifyOtp).toHaveBeenCalledWith({
      type: "email",
      token_hash: "th_abc",
    });
    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/app-bootstrap"
    );
  });

  it("maps invalid/expired token_hash to login?error=token_hash", async () => {
    verifyOtp.mockResolvedValueOnce({
      error: {
        message: "Email link is invalid or has expired",
        status: 403,
        code: "otp_expired",
      },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://www.maanta.app/auth/callback?token_hash=stale&type=email"
    );
    const res = await GET(req);

    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/login?error=token_hash"
    );
  });

  it("maps PKCE verifier failures to pkce_missing for the login UI", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({
      error: {
        message: "both auth code and code verifier should be non-empty",
        status: 400,
        code: "validation_failed",
      },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://www.maanta.app/auth/callback?code=orphan-code"
    );
    const res = await GET(req);

    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/login?error=pkce_missing"
    );
  });

  it("rejects missing params with callback_parse error", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest("https://www.maanta.app/auth/callback");
    const res = await GET(req);

    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/login?error=missing_params"
    );
  });

  it("surfaces supabase error query params from a broken redirect", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://www.maanta.app/auth/callback?error=access_denied&error_description=Redirect%20not%20allowed"
    );
    const res = await GET(req);

    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/login?error=supabase_error"
    );
  });

  it("blocks open redirects in next=", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: null });

    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://www.maanta.app/auth/callback?code=x&next=https://evil.test"
    );
    const res = await GET(req);

    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/app-bootstrap"
    );
  });

  it("writes session cookies onto the redirect response via setAll", async () => {
    exchangeCodeForSession.mockImplementationOnce(async () => {
      lastCookieApi?.setAll([
        {
          name: "sb-access-token",
          value: "access",
          options: { path: "/" },
        },
        {
          name: "sb-refresh-token",
          value: "refresh",
          options: { path: "/" },
        },
      ]);
      return { error: null };
    });

    const { GET } = await import("@/app/auth/callback/route");
    const req = new NextRequest(
      "https://www.maanta.app/auth/callback?code=with-cookies"
    );
    const res = await GET(req);

    const setCookies = res.headers.getSetCookie?.() ?? [];
    const joined = setCookies.join("\n");
    expect(joined).toMatch(/sb-access-token=access/);
    expect(joined).toMatch(/sb-refresh-token=refresh/);
    expect(res.headers.get("location")).toBe(
      "https://www.maanta.app/app-bootstrap"
    );
  });
});
