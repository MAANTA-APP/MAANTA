"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";
import { Button, ButtonLink } from "@/components/ui/button";
import { PhoneField } from "@/components/ui/inputs";
import { OtpInput } from "@/components/ui/otp-input";
import { InlineAlert } from "@/components/ui/inline-alert";
import { BackButton } from "@/components/ui/claude";
import { IconCheck } from "@/components/ui/icons";
import {
  SupabaseRedirectToSignIn,
  SupabaseSignedIn,
  SupabaseSignedOut,
} from "@/components/auth/supabase-email-login";
import { authModeLoginHint, isClerkAuthClient, phoneOtpEnabled } from "@/lib/auth/strategy";

function safeInternalPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/feed";
  }
  return raw;
}

function VerifyPhoneUnavailable() {
  const params = useSearchParams();
  const next = safeInternalPath(params.get("next"));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col px-5 pb-10 pt-6">
      <BackButton fallback="/you" />
      <h1 className="mt-4 text-2xl font-bold text-ink">Phone verification</h1>
      <p className="mt-2 text-sm text-muted">{authModeLoginHint()}</p>
      <div className="mt-6 rounded-card border border-line bg-stone px-4 py-3 text-sm text-secondary">
        Phone SMS OTP is launch-only (Clerk). In dev/test you can claim deals with
        email sign-in — no phone step required.
      </div>
      <ButtonLink href={next} full className="mt-6">
        Continue
      </ButtonLink>
    </main>
  );
}

function ClerkVerifyPhoneInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeInternalPath(params.get("next"));
  const { isLoaded, user } = useUser();

  const [stage, setStage] = useState<"enter" | "code" | "done">("enter");
  const [cc, setCc] = useState("+254");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneId, setPhoneId] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  useEffect(() => {
    if (stage !== "done") return;
    const t = setTimeout(() => {
      router.push(next);
      router.refresh();
    }, 1200);
    return () => clearTimeout(t);
  }, [stage, next, router]);

  const fullPhone = `${cc}${phone.replace(/\D/g, "").replace(/^0+/, "")}`;

  async function sendCode() {
    if (!isLoaded || !user) return;
    setBusy(true);
    setError(null);
    try {
      const created = await user.createPhoneNumber({ phoneNumber: fullPhone });
      await created.prepareVerification();
      setPhoneId(created.id);
      setStage("code");
      setResendIn(30);
    } catch {
      setError("Couldn't send the code. Check the number and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (!isLoaded || !user || !phoneId || resendIn > 0) return;
    setBusy(true);
    setError(null);
    try {
      await user.reload();
      const record = user.phoneNumbers.find((p) => p.id === phoneId);
      if (!record) throw new Error("phone record missing");
      await record.prepareVerification();
      setResendIn(30);
    } catch {
      setError("Couldn't send the code. Check the number and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!isLoaded || !user || !phoneId) return;
    setBusy(true);
    setError(null);
    try {
      await user.reload();
      const record = user.phoneNumbers.find((p) => p.id === phoneId);
      if (!record) throw new Error("phone record missing");
      const result = await record.attemptVerification({ code: code.trim() });
      if (result.verification.status !== "verified") {
        throw new Error("not verified");
      }
      await user.update({ primaryPhoneNumberId: record.id }).catch(() => {});
      setStage("done");
    } catch {
      setError("Code didn't match. Check the SMS and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col px-5 pb-10 pt-6">
      <BackButton fallback="/you" />
      <h1 className="mt-4 text-2xl font-bold text-ink">Add your phone to claim</h1>
      <p className="mt-2 text-sm text-muted">
        Claiming a deal needs a verified phone number. We&apos;ll text you a
        one-time code, then take you back to the deal.
      </p>

      {stage === "enter" ? (
        <div className="mt-8 space-y-4">
          <PhoneField
            label="Phone number"
            countryCode={cc}
            onCountryCode={setCc}
            value={phone}
            onChange={setPhone}
          />
          {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
          <Button full onClick={sendCode} loading={busy} disabled={!phone.trim()}>
            Send code
          </Button>
        </div>
      ) : stage === "code" ? (
        <div className="mt-8 space-y-4">
          <label className="block text-center text-xs font-medium text-muted">
            Enter the 6-digit code
          </label>
          <OtpInput value={code} onChange={setCode} autoFocus ariaLabel="6-digit code" />
          {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
          <Button full onClick={verify} loading={busy} disabled={code.trim().length !== 6}>
            Verify &amp; continue
          </Button>
          <button
            type="button"
            onClick={resendCode}
            disabled={busy || resendIn > 0}
            className="mx-auto block py-1 text-sm font-semibold text-ink underline-offset-2 hover:underline disabled:text-faint disabled:no-underline"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
          </button>
          <Button
            variant="ghost"
            full
            onClick={() => {
              setStage("enter");
              setCode("");
              setError(null);
              setResendIn(0);
            }}
            disabled={busy}
          >
            Use a different number
          </Button>
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-verified/10">
            <IconCheck className="h-7 w-7 text-verified" />
          </span>
          <p className="text-base font-bold text-ink">Phone verified</p>
          <p className="-mt-1 max-w-[240px] text-[13px] leading-relaxed text-secondary">
            You can now claim deals. Taking you back…
          </p>
        </div>
      )}
    </main>
  );
}

function ClerkVerifyPhonePage() {
  return (
    <>
      <SignedIn>
        <Suspense fallback={null}>
          <ClerkVerifyPhoneInner />
        </Suspense>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}

function SupabaseVerifyPhonePage() {
  return (
    <>
      <SupabaseSignedIn>
        <Suspense fallback={null}>
          <VerifyPhoneUnavailable />
        </Suspense>
      </SupabaseSignedIn>
      <SupabaseSignedOut>
        <SupabaseRedirectToSignIn />
      </SupabaseSignedOut>
    </>
  );
}

export default function VerifyPhonePage() {
  if (!phoneOtpEnabled() || !isClerkAuthClient()) {
    return <SupabaseVerifyPhonePage />;
  }
  return <ClerkVerifyPhonePage />;
}
