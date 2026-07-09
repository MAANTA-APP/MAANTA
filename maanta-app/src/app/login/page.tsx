"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PhoneField, OtpCells, SegmentedControl, inputClass } from "@/components/ui/inputs";
import { maskPhone } from "@/lib/ui";
import { NODE_COOKIE } from "@/lib/nodes";
import Link from "next/link";

type Method = "phone" | "email";
type Step = "contact" | "otp";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [supabase] = useState(() => createClient());
  const [method, setMethod] = useState<Method>("phone");
  const [step, setStep] = useState<Step>("contact");
  const [countryCode, setCountryCode] = useState("+254");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(45);

  const phone = `${countryCode}${phoneLocal.replace(/\D/g, "").replace(/^0+/, "")}`;

  useEffect(() => {
    if (step !== "otp" || resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [step, resendIn]);

  async function sendOtp() {
    setError(null);
    setLoading(true);
    const { error } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({ phone })
        : await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (await sendOtp()) {
      setStep("otp");
      setResendIn(45);
      setOtp("");
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } =
      method === "phone"
        ? await supabase.auth.verifyOtp({ phone, token: otp, type: "sms" })
        : await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    const next = params.get("next");
    const hasNode = document.cookie.includes(`${NODE_COOKIE}=`);
    router.push(next ?? (hasNode ? "/feed" : "/select-mall"));
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col px-5 pb-10 pt-14">
      {step === "contact" ? (
        <>
          <h1 className="text-center text-2xl font-bold text-ink">Sign in</h1>
          <form onSubmit={handleSend} className="mt-10 flex flex-1 flex-col gap-5">
            <SegmentedControl<Method>
              options={[
                { value: "phone", label: "Phone" },
                { value: "email", label: "Email" },
              ]}
              value={method}
              onChange={(m) => {
                setMethod(m);
                setError(null);
              }}
            />
            {method === "phone" ? (
              <PhoneField
                countryCode={countryCode}
                onCountryCode={setCountryCode}
                value={phoneLocal}
                onChange={setPhoneLocal}
                autoFocus
              />
            ) : (
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            )}
            {error ? <p className="text-sm font-medium text-flame">{error}</p> : null}
            <Button type="submit" full loading={loading}>
              Send code
            </Button>
            <p className="text-center text-xs text-faint">
              By continuing you agree to our{" "}
              <Link href="/terms" className="underline">
                Terms
              </Link>{" "}
              &amp;{" "}
              <Link href="/privacy" className="underline">
                Privacy Policy
              </Link>
            </p>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-center text-2xl font-bold text-ink">Verify</h1>
          <p className="mt-3 text-center text-sm text-muted">
            Code sent to {method === "phone" ? maskPhone(phone) : email}{" "}
            <button
              type="button"
              className="font-semibold text-ink underline"
              onClick={() => setStep("contact")}
            >
              Edit
            </button>
          </p>
          <form onSubmit={handleVerify} className="mt-8 flex flex-col gap-6">
            <OtpCells value={otp} onChange={setOtp} />
            {error ? (
              <p className="text-center text-sm font-medium text-flame">{error}</p>
            ) : null}
            <Button type="submit" full loading={loading} disabled={otp.length !== 6}>
              Verify
            </Button>
            {resendIn > 0 ? (
              <p className="text-center text-sm text-faint">
                Resend in 00:{String(resendIn).padStart(2, "0")}
              </p>
            ) : (
              <button
                type="button"
                className="text-center text-sm font-semibold text-ink underline"
                onClick={async () => {
                  if (await sendOtp()) setResendIn(45);
                }}
              >
                Resend code
              </button>
            )}
          </form>
        </>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
