"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { PhoneField, TextField } from "@/components/ui/inputs";
import { InlineAlert } from "@/components/ui/inline-alert";

/**
 * Phone-required-at-claim step (S2 ruling 2026-07-23). Launch auth lets a
 * shopper sign in with email OR phone; claiming needs a verified phone. When
 * the claim route bounces an email-only session with `phone_required`, it lands
 * here to add + verify a phone by SMS OTP, then returns to the deal (`next`).
 *
 * The phone is added to the shopper's OWN Clerk account via the client SDK —
 * no server route mints or trusts a phone on their behalf. Once Clerk verifies
 * it, the account carries a verified phone and the claim gate passes.
 */
/**
 * Only allow an internal, same-origin path as the post-verify return target.
 * `next` comes from the query string, so reject absolute/protocol-relative URLs
 * (`//evil`, `https://…`, `javascript:…`) and fall back to the feed — passing an
 * untrusted URL to router.push() is an open-redirect / XSS sink.
 */
function safeInternalPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/feed";
  }
  return raw;
}

function VerifyPhoneInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeInternalPath(params.get("next"));
  const { isLoaded, user } = useUser();

  const [stage, setStage] = useState<"enter" | "code">("enter");
  const [cc, setCc] = useState("+254");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The pending Clerk PhoneNumber resource id, once created.
  const [phoneId, setPhoneId] = useState<string | null>(null);

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
    } catch {
      setError("Could not send the code — check the number and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!isLoaded || !user || !phoneId) return;
    setBusy(true);
    setError(null);
    try {
      // createPhoneNumber() returns the new resource but does NOT sync
      // user.phoneNumbers — reload before looking the record up, or it's missing.
      await user.reload();
      const record = user.phoneNumbers.find((p) => p.id === phoneId);
      if (!record) throw new Error("phone record missing");
      const result = await record.attemptVerification({ code: code.trim() });
      if (result.verification.status !== "verified") {
        throw new Error("not verified");
      }
      // Make it the primary phone so it's the account's canonical number.
      await user.update({ primaryPhoneNumberId: record.id }).catch(() => {});
      router.push(next);
      router.refresh();
    } catch {
      setError("That code didn't match — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col px-5 pb-10 pt-14">
      <h1 className="text-2xl font-bold text-ink">Add your phone</h1>
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
      ) : (
        <div className="mt-8 space-y-4">
          <TextField
            label="Enter the 6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoFocus
          />
          {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}
          <Button full onClick={verify} loading={busy} disabled={code.trim().length < 4}>
            Verify &amp; continue
          </Button>
          <Button
            variant="ghost"
            full
            onClick={() => {
              setStage("enter");
              setCode("");
              setError(null);
            }}
            disabled={busy}
          >
            Use a different number
          </Button>
        </div>
      )}
    </main>
  );
}

export default function VerifyPhonePage() {
  return (
    <>
      <SignedIn>
        <Suspense fallback={null}>
          <VerifyPhoneInner />
        </Suspense>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
