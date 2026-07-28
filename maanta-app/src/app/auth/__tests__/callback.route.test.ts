import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exchangeCodeForSession = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession,
      verifyOtp,
    },
  })),
}));

describe("GET /auth/callback", () => {
  it("exchanges PKCE code and redirects to /app-bootstrap", async () => {
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

  it("verifies token_hash without PKCE (email-client handoff)", async () => {
    exchangeCodeForSession.mockReset();
    verifyOtp.mockResolvedValueOnce({ error: null });

    // Fresh import not required — module already loaded; re-import is fine.
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
});
