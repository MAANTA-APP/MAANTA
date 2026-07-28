import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SUPABASE_AUTH_ALLOWED_REDIRECTS,
  SUPABASE_AUTH_SITE_URL,
  canonicalAuthOrigin,
  mapAuthCallbackQueryError,
  mapOtpSendError,
  mapOtpVerifyError,
  normalizeEmailOtpType,
  parseAuthCallbackParams,
  safeAuthNextPath,
  supabaseEmailRedirectTo,
} from "@/lib/auth/supabase-email-auth";

describe("supabase email auth helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("canonicalAuthOrigin", () => {
    it("rewrites apex maanta.app to www for production cookie affinity", () => {
      expect(canonicalAuthOrigin("https://maanta.app")).toBe(
        "https://www.maanta.app"
      );
      expect(canonicalAuthOrigin("https://maanta.app/")).toBe(
        "https://www.maanta.app"
      );
    });

    it("leaves www and localhost unchanged", () => {
      expect(canonicalAuthOrigin("https://www.maanta.app")).toBe(
        "https://www.maanta.app"
      );
      expect(canonicalAuthOrigin("http://localhost:3000")).toBe(
        "http://localhost:3000"
      );
    });
  });

  describe("safeAuthNextPath", () => {
    it("defaults to /app-bootstrap", () => {
      expect(safeAuthNextPath(null)).toBe("/app-bootstrap");
      expect(safeAuthNextPath("")).toBe("/app-bootstrap");
    });

    it("allows relative in-app paths", () => {
      expect(safeAuthNextPath("/feed")).toBe("/feed");
      expect(safeAuthNextPath("/merchant")).toBe("/merchant");
    });

    it("blocks open redirects", () => {
      expect(safeAuthNextPath("//evil.example")).toBe("/app-bootstrap");
      expect(safeAuthNextPath("https://evil.example")).toBe("/app-bootstrap");
      expect(safeAuthNextPath("/\\evil")).toBe("/app-bootstrap");
    });
  });

  describe("supabaseEmailRedirectTo", () => {
    it("builds www.maanta.app callback with next for production", () => {
      expect(supabaseEmailRedirectTo("https://www.maanta.app")).toBe(
        "https://www.maanta.app/auth/callback?next=%2Fapp-bootstrap"
      );
    });

    it("rewrites apex origin to www so production magic links match Site URL", () => {
      expect(supabaseEmailRedirectTo("https://maanta.app")).toBe(
        "https://www.maanta.app/auth/callback?next=%2Fapp-bootstrap"
      );
    });

    it("strips trailing slash on origin", () => {
      expect(supabaseEmailRedirectTo("https://www.maanta.app/")).toBe(
        "https://www.maanta.app/auth/callback?next=%2Fapp-bootstrap"
      );
    });

    it("sanitizes a hostile next value", () => {
      expect(
        supabaseEmailRedirectTo("https://www.maanta.app", "https://evil.test")
      ).toBe("https://www.maanta.app/auth/callback?next=%2Fapp-bootstrap");
    });

    it("documents allowlisted production redirect URLs and Site URL", () => {
      expect(SUPABASE_AUTH_SITE_URL).toBe("https://www.maanta.app");
      expect(SUPABASE_AUTH_ALLOWED_REDIRECTS).toContain(
        "https://www.maanta.app/auth/callback"
      );
      expect(SUPABASE_AUTH_ALLOWED_REDIRECTS).toContain(
        "https://maanta.app/auth/callback"
      );
    });
  });

  describe("mapOtpSendError", () => {
    it("maps rate limits instead of the generic send failure", () => {
      expect(
        mapOtpSendError({
          message: "email rate limit exceeded",
          status: 429,
          code: "over_email_send_rate_limit",
        })
      ).toMatch(/already sent a code/i);
    });

    it("maps redirect allowlist misconfig", () => {
      expect(
        mapOtpSendError({
          message: "Redirect URL not allowed",
          status: 400,
        })
      ).toMatch(/redirect is misconfigured/i);
    });

    it("includes the provider message when present", () => {
      expect(mapOtpSendError({ message: "SMTP is down" })).toContain(
        "SMTP is down"
      );
    });

    it("never blames send when the failure is only a verify-stage issue", () => {
      expect(mapOtpVerifyError({ message: "Invalid OTP" })).not.toMatch(
        /Couldn't send the code/
      );
    });
  });

  describe("mapOtpVerifyError", () => {
    it("maps expired/invalid OTP distinctly from send errors", () => {
      const msg = mapOtpVerifyError({
        message: "Token has expired or is invalid",
        status: 401,
      });
      expect(msg).toMatch(/expired|didn't match/i);
      expect(msg).not.toMatch(/Couldn't send the code/);
    });
  });

  describe("mapAuthCallbackQueryError", () => {
    it("explains PKCE / email-browser handoff failures", () => {
      expect(mapAuthCallbackQueryError("pkce_missing")).toMatch(
        /different browser|6-digit code/i
      );
      expect(mapAuthCallbackQueryError("session_exchange")).toMatch(
        /6-digit code/i
      );
    });

    it("explains expired token_hash links", () => {
      expect(mapAuthCallbackQueryError("token_hash")).toMatch(/expired/i);
    });

    it("returns null when no error param", () => {
      expect(mapAuthCallbackQueryError(null)).toBeNull();
    });
  });

  describe("parseAuthCallbackParams", () => {
    it("parses PKCE code flow", () => {
      const parsed = parseAuthCallbackParams(
        new URLSearchParams("code=abc&next=/feed")
      );
      expect(parsed.code).toBe("abc");
      expect(parsed.tokenHash).toBeNull();
      expect(parsed.next).toBe("/feed");
    });

    it("parses token_hash email link flow (mobile handoff safe)", () => {
      const parsed = parseAuthCallbackParams(
        new URLSearchParams(
          "token_hash=th_123&type=magiclink&next=/app-bootstrap"
        )
      );
      expect(parsed.tokenHash).toBe("th_123");
      expect(parsed.type).toBe("magiclink");
      expect(parsed.code).toBeNull();
    });

    it("captures supabase error query params", () => {
      const parsed = parseAuthCallbackParams(
        new URLSearchParams("error=access_denied&error_description=Nope")
      );
      expect(parsed.supabaseError).toBe("access_denied");
      expect(parsed.supabaseErrorDescription).toBe("Nope");
    });
  });

  describe("normalizeEmailOtpType", () => {
    it("defaults unknown types to email", () => {
      expect(normalizeEmailOtpType(null)).toBe("email");
      expect(normalizeEmailOtpType("nope")).toBe("email");
    });

    it("keeps known magiclink type", () => {
      expect(normalizeEmailOtpType("magiclink")).toBe("magiclink");
    });
  });
});
