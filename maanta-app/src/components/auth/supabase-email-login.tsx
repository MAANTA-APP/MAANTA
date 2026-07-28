"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Body, HeadingLg } from "@/components/ui/claude";
import { authModeLoginHint } from "@/lib/auth/strategy";
import {
  logAuthFlow,
  mapAuthCallbackQueryError,
  mapOtpSendError,
  mapOtpVerifyError,
  supabaseEmailRedirectTo,
  type AuthErrorLike,
} from "@/lib/auth/supabase-email-auth";

type Stage = "email" | "code";

/**
 * Email OTP sign-in via Supabase Auth. Replaces Clerk on /login when
 * MAANTA_AUTH_STRATEGY=supabase.
 *
 * Primary path: 6-digit OTP typed on this device (works across email clients).
 * Secondary path: magic / confirm link → /auth/callback (prefer token_hash
 * templates in the Supabase dashboard so mobile Mail/Outlook handoff works).
 */
export function SupabaseEmailLogin({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    const fromCallback = mapAuthCallbackQueryError(errorParam);
    if (fromCallback) {
      logAuthFlow("callback_parse", "surfaced callback error on login", {
        error: errorParam,
      });
      setError(fromCallback);
    }
  }, []);

  async function sendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const emailRedirectTo = supabaseEmailRedirectTo(
        window.location.origin,
        "/app-bootstrap"
      );
      logAuthFlow("send", "signInWithOtp starting", {
        emailRedirectTo,
        host: window.location.host,
      });
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          shouldCreateUser: true,
          emailRedirectTo,
        },
      });
      if (otpError) throw otpError;
      logAuthFlow("send", "signInWithOtp accepted; awaiting code entry");
      setStage("code");
    } catch (err) {
      const authErr = err as AuthErrorLike;
      logAuthFlow("send", "signInWithOtp failed", {
        errorMessage: authErr?.message,
        status: authErr?.status,
        code: authErr?.code,
      });
      setError(mapOtpSendError(authErr));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    const trimmed = email.trim().toLowerCase();
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      logAuthFlow("verify_otp", "verifyOtp starting");
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmed,
        token: code.trim(),
        type: "email",
      });
      if (verifyError) throw verifyError;
      logAuthFlow("bootstrap", "verifyOtp ok; routing to /app-bootstrap");
      router.push("/app-bootstrap");
      router.refresh();
    } catch (err) {
      const authErr = err as AuthErrorLike;
      logAuthFlow("verify_otp", "verifyOtp failed", {
        errorMessage: authErr?.message,
        status: authErr?.status,
        code: authErr?.code,
      });
      setError(mapOtpVerifyError(authErr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-5 text-center">
        <HeadingLg as="h1" className="text-[1.5rem]">
          {mode === "sign-up" ? "Sign up" : "Sign in"}
        </HeadingLg>
        <Body className="mt-1.5">{authModeLoginHint()}</Body>
      </div>

      <div className="w-full rounded-card border border-line bg-white p-5 shadow-card sm:p-6">
        {stage === "email" ? (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-ink">
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-full border border-line px-4 py-2.5 text-sm"
                placeholder="you@example.com"
              />
            </label>
            {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
            <Button full onClick={sendCode} loading={busy} disabled={!email.trim()}>
              Send code
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted">
              Enter the 6-digit code we sent to{" "}
              <strong className="text-ink">{email}</strong>. Prefer the code
              over the email link if your mail app opens a different browser.
            </p>
            <label className="block text-sm font-medium text-ink">
              Verification code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1.5 w-full rounded-full border border-line px-4 py-2.5 text-center text-sm tracking-widest"
                placeholder="123456"
              />
            </label>
            {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
            <Button
              full
              onClick={verifyCode}
              loading={busy}
              disabled={code.trim().length < 6}
            >
              Verify &amp; continue
            </Button>
            <Button
              variant="ghost"
              full
              onClick={() => {
                setStage("email");
                setCode("");
                setError(null);
              }}
              disabled={busy}
            >
              Use a different email
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Signed-in guard for Supabase Auth sessions (dev/test). */
export function SupabaseSignedIn({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setReady(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!signedIn) return null;
  return <>{children}</>;
}

/** Signed-out branch for Supabase Auth (dev/test). */
export function SupabaseSignedOut({ children }: { children: React.ReactNode }) {
  const signedIn = useSupabaseSignedIn();
  if (signedIn === null) return null;
  if (signedIn) return null;
  return <>{children}</>;
}

/** Signed-out redirect for Supabase Auth (dev/test). */
export function SupabaseRedirectToSignIn() {
  const router = useRouter();
  const signedIn = useSupabaseSignedIn();

  useEffect(() => {
    if (signedIn === false) router.replace("/login");
  }, [signedIn, router]);

  return null;
}

/** Hook: whether a Supabase Auth session exists (client only). */
export function useSupabaseSignedIn(): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => subscription.unsubscribe();
  }, []);

  return signedIn;
}
