"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Method = "phone" | "email";
type Step = "contact" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [method, setMethod] = useState<Method>("phone");
  const [step, setStep] = useState<Step>("contact");
  const [phone, setPhone] = useState("+254");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contact = method === "phone" ? phone : email;

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } =
      method === "phone"
        ? await supabase.auth.signInWithOtp({ phone })
        : await supabase.auth.signInWithOtp({ email });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep("otp");
  }

  async function handleVerifyOtp(e: FormEvent) {
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
    router.push("/");
    router.refresh();
  }

  function switchMethod(next: Method) {
    setMethod(next);
    setStep("contact");
    setOtp("");
    setError(null);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in to MAANTA</h1>

      {step === "contact" && (
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div className="flex rounded border border-black/10 p-1 text-sm dark:border-white/20">
            <button
              type="button"
              onClick={() => switchMethod("phone")}
              className={`flex-1 rounded px-3 py-1.5 ${
                method === "phone" ? "bg-foreground text-background" : ""
              }`}
            >
              Phone
            </button>
            <button
              type="button"
              onClick={() => switchMethod("email")}
              className={`flex-1 rounded px-3 py-1.5 ${
                method === "email" ? "bg-foreground text-background" : ""
              }`}
            >
              Email
            </button>
          </div>

          <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
            {method === "phone" ? (
              <label className="flex flex-col gap-1 text-sm">
                Phone number
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254712345678"
                  className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
                />
              </label>
            ) : (
              <label className="flex flex-col gap-1 text-sm">
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
                />
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {loading ? "Sending code…" : "Send code"}
            </button>
          </form>
        </div>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="flex w-full max-w-sm flex-col gap-4">
          <p className="text-sm text-black/60 dark:text-white/60">
            Enter the code sent to {contact}
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Verification code
            <input
              type="text"
              inputMode="numeric"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="123456"
              className="rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("contact");
              setError(null);
            }}
            className="text-sm underline"
          >
            Use a different {method === "phone" ? "number" : "email"}
          </button>
        </form>
      )}
    </main>
  );
}
