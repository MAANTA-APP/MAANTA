import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  mapAuthCallbackQueryError,
  mapOtpSendError,
  mapOtpVerifyError,
  supabaseEmailRedirectTo,
} from "@/lib/auth/supabase-email-auth";

/**
 * UI error-surface coverage for the Supabase email login flow.
 * Full client interaction (send/verify clicks) needs a DOM env; here we lock
 * the copy contracts the login component renders via InlineAlert.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("SupabaseEmailLogin error surfaces", () => {
  it("renders the email OTP shell (not Clerk) for sign-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAANTA_AUTH_STRATEGY", "supabase");
    const { SupabaseEmailLogin } = await import(
      "@/components/auth/supabase-email-login"
    );
    const html = renderToStaticMarkup(
      createElement(SupabaseEmailLogin, { mode: "sign-in", loginHint: "test login hint" })
    );
    expect(html).toContain("Sign in");
    expect(html).toContain("Send code");
    expect(html).toContain("Email address");
    expect(html).not.toContain("Couldn't send the code");
  });

  it("maps production redirect URL to www callback", () => {
    expect(supabaseEmailRedirectTo("https://www.maanta.app")).toBe(
      "https://www.maanta.app/auth/callback?next=%2Fapp-bootstrap"
    );
    expect(supabaseEmailRedirectTo("https://maanta.app")).toBe(
      "https://www.maanta.app/auth/callback?next=%2Fapp-bootstrap"
    );
  });

  it("surfaces rate-limit as already-sent, not generic send failure", () => {
    const copy = mapOtpSendError({
      status: 429,
      code: "over_email_send_rate_limit",
      message: "email rate limit exceeded",
    });
    expect(copy).toMatch(/already sent a code/i);
    expect(copy).not.toBe(
      "Couldn't send the code. Check the email and try again."
    );
  });

  it("surfaces redirect allowlist failures distinctly", () => {
    expect(
      mapOtpSendError({ message: "Redirect URL not in allow list" })
    ).toMatch(/redirect is misconfigured/i);
  });

  it("surfaces verify failures without blaming the send step", () => {
    const copy = mapOtpVerifyError({
      message: "Token has expired or is invalid",
      status: 401,
    });
    expect(copy).toMatch(/expired|didn't match/i);
    expect(copy).not.toMatch(/Couldn't send the code/);
  });

  it("surfaces callback/PKCE handoff failures with code-entry guidance", () => {
    expect(mapAuthCallbackQueryError("pkce_missing")).toMatch(/6-digit code/i);
    expect(mapAuthCallbackQueryError("token_hash")).toMatch(/expired/i);
    expect(mapAuthCallbackQueryError("missing_params")).toMatch(
      /incomplete|6-digit code/i
    );
  });
});
