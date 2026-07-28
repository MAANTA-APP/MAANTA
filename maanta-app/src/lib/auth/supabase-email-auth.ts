/**
 * Helpers for the Supabase Auth email OTP / magic-link flow.
 * Kept pure so unit tests can cover production redirect + error mapping
 * without a browser or live Supabase project.
 */

export type AuthFlowStage =
  | "send"
  | "verify_otp"
  | "callback_parse"
  | "session_exchange"
  | "bootstrap";

export type AuthErrorLike = {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
};

/** Safe in-app next path after auth (blocks open redirects). */
export function safeAuthNextPath(
  raw: string | null | undefined,
  fallback = "/app-bootstrap"
): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://") || trimmed.includes("\\")) return fallback;
  return trimmed;
}

/**
 * Build the emailRedirectTo / redirectTo URL for signInWithOtp.
 * Always points at /auth/callback on the given origin (www in prod).
 */
export function supabaseEmailRedirectTo(
  origin: string,
  next: string = "/app-bootstrap"
): string {
  const base = origin.replace(/\/$/, "");
  const safeNext = safeAuthNextPath(next);
  return `${base}/auth/callback?next=${encodeURIComponent(safeNext)}`;
}

/** Canonical production origins operators must allowlist in Supabase Auth. */
export const SUPABASE_AUTH_ALLOWED_REDIRECTS = [
  "https://www.maanta.app/auth/callback",
  "https://maanta.app/auth/callback",
] as const;

export function logAuthFlow(
  stage: AuthFlowStage,
  message: string,
  detail?: Record<string, unknown>
): void {
  // `message` wins over any colliding key in detail so stage labels stay intact.
  const payload = { ...(detail ?? {}), stage, message };
  console.info("[maanta-auth]", JSON.stringify(payload));
}

function errorText(error: AuthErrorLike | null | undefined): string {
  return `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
}

/** Map signInWithOtp failures to stage-specific UI copy. */
export function mapOtpSendError(error: AuthErrorLike | null | undefined): string {
  const text = errorText(error);
  const status = error?.status;

  if (
    status === 429 ||
    text.includes("rate") ||
    text.includes("over_email_send_rate_limit") ||
    text.includes("too many")
  ) {
    return "We already sent a code to that email. Check your inbox (and spam), or wait a minute and try again.";
  }

  if (
    text.includes("redirect") ||
    text.includes("not allowed") ||
    text.includes("whitelist") ||
    text.includes("allow list") ||
    text.includes("allowlist")
  ) {
    return "Sign-in redirect is misconfigured for this environment. Ask an admin to check Supabase Auth URL config.";
  }

  if (
    text.includes("invalid") &&
    (text.includes("email") || text.includes("format"))
  ) {
    return "That email address looks invalid. Check it and try again.";
  }

  if (text.includes("signup") && text.includes("disabled")) {
    return "New sign-ups are disabled right now. Contact support if you need access.";
  }

  if (error?.message?.trim()) {
    return `Couldn't send the code (${error.message.trim()}). Check the email and try again.`;
  }

  return "Couldn't send the code. Check the email and try again.";
}

/** Map verifyOtp failures to stage-specific UI copy. */
export function mapOtpVerifyError(
  error: AuthErrorLike | null | undefined
): string {
  const text = errorText(error);
  const status = error?.status;

  if (
    status === 401 ||
    text.includes("otp") ||
    text.includes("token") ||
    text.includes("expired") ||
    text.includes("invalid")
  ) {
    return "Code didn't match or expired. Check the latest email, or request a new code.";
  }

  if (error?.message?.trim()) {
    return `Couldn't verify the code (${error.message.trim()}). Try again.`;
  }

  return "Code didn't match. Check your email and try again.";
}

/**
 * Map /login?error=… values set by /auth/callback into user-facing copy.
 * Magic-link PKCE fails when the link is opened in a different browser than
 * the one that requested the email (common on iPhone Mail / Outlook).
 */
export function mapAuthCallbackQueryError(
  errorParam: string | null | undefined
): string | null {
  if (!errorParam) return null;

  switch (errorParam) {
    case "auth_callback":
    case "session_exchange":
    case "pkce_missing":
      return "That sign-in link couldn't complete in this browser. Enter the 6-digit code from the email here instead (or request a new code on this device).";
    case "callback_parse":
    case "missing_params":
      return "That sign-in link was incomplete. Enter the 6-digit code from the email, or request a new code.";
    case "token_hash":
      return "That sign-in link expired. Request a new code and enter it on this screen.";
    case "supabase_error":
      return "Supabase rejected the sign-in link. Request a new code and enter it here.";
    default:
      return "Sign-in didn't finish. Enter the code from your email, or request a new one.";
  }
}

export type CallbackAuthParams = {
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  next: string;
  supabaseError: string | null;
  supabaseErrorDescription: string | null;
};

/** Parse /auth/callback query params (PKCE code or email token_hash). */
export function parseAuthCallbackParams(
  searchParams: URLSearchParams
): CallbackAuthParams {
  return {
    code: searchParams.get("code"),
    tokenHash:
      searchParams.get("token_hash") ?? searchParams.get("tokenHash"),
    type: searchParams.get("type"),
    next: safeAuthNextPath(searchParams.get("next")),
    supabaseError: searchParams.get("error"),
    supabaseErrorDescription: searchParams.get("error_description"),
  };
}

/** Email OTP verify types accepted by supabase.auth.verifyOtp({ token_hash }). */
const TOKEN_HASH_TYPES = new Set([
  "email",
  "signup",
  "magiclink",
  "invite",
  "recovery",
  "email_change",
]);

export function normalizeEmailOtpType(
  raw: string | null | undefined
): "email" | "signup" | "magiclink" | "invite" | "recovery" | "email_change" {
  const value = (raw ?? "email").toLowerCase();
  if (TOKEN_HASH_TYPES.has(value)) {
    return value as
      | "email"
      | "signup"
      | "magiclink"
      | "invite"
      | "recovery"
      | "email_change";
  }
  return "email";
}
