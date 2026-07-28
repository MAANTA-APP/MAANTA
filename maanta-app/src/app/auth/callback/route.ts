import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  logAuthFlow,
  normalizeEmailOtpType,
  parseAuthCallbackParams,
  safeAuthNextPath,
} from "@/lib/auth/supabase-email-auth";

/**
 * OAuth / magic-link / email token_hash callback for Supabase Auth.
 *
 * Important: session cookies from exchangeCodeForSession / verifyOtp must be
 * written onto the redirect Response. Using cookies() from next/headers and
 * then returning a separate NextResponse.redirect() drops the Set-Cookie
 * headers — a common SSR footgun that leaves users "signed in" nowhere.
 *
 * Also accepts token_hash + type (no PKCE). That path works when the email
 * link is opened in a different browser than the one that requested OTP
 * (iPhone Mail / Outlook in-app browsers).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const parsed = parseAuthCallbackParams(url.searchParams);
  const next = safeAuthNextPath(parsed.next);
  const origin = url.origin;

  const fail = (errorCode: string, stage: Parameters<typeof logAuthFlow>[0]) => {
    logAuthFlow(stage, "auth callback failed", {
      errorCode,
      hasCode: Boolean(parsed.code),
      hasTokenHash: Boolean(parsed.tokenHash),
      type: parsed.type,
      supabaseError: parsed.supabaseError,
      supabaseErrorDescription: parsed.supabaseErrorDescription,
    });
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorCode)}`
    );
  };

  if (parsed.supabaseError) {
    return fail("supabase_error", "callback_parse");
  }

  if (!parsed.code && !parsed.tokenHash) {
    return fail("missing_params", "callback_parse");
  }

  let redirect = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          redirect = NextResponse.redirect(`${origin}${next}`);
          cookiesToSet.forEach(({ name, value, options }) => {
            redirect.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  if (parsed.code) {
    logAuthFlow("session_exchange", "exchanging PKCE code for session");
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) {
      logAuthFlow("session_exchange", "PKCE exchange failed", {
        message: error.message,
        status: error.status,
        code: error.code,
      });
      const looksLikePkce =
        /code verifier|pkce|both auth code and code verifier/i.test(
          error.message ?? ""
        );
      return fail(
        looksLikePkce ? "pkce_missing" : "session_exchange",
        "session_exchange"
      );
    }
    logAuthFlow("bootstrap", "PKCE session established; redirecting", { next });
    return redirect;
  }

  // token_hash path — no PKCE cookie required (email-client handoff safe).
  logAuthFlow("session_exchange", "verifying email token_hash", {
    type: parsed.type,
  });
  const { error } = await supabase.auth.verifyOtp({
    type: normalizeEmailOtpType(parsed.type),
    token_hash: parsed.tokenHash!,
  });
  if (error) {
    logAuthFlow("session_exchange", "token_hash verify failed", {
      errorMessage: error.message,
      status: error.status,
      code: error.code,
    });
    return fail("token_hash", "session_exchange");
  }

  logAuthFlow("bootstrap", "token_hash session established; redirecting", {
    next,
  });
  return redirect;
}
