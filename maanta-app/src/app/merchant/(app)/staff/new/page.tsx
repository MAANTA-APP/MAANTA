"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PhoneField, TextField, Toggle } from "@/components/ui/inputs";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import { maskPhone } from "@/lib/ui";
import Link from "next/link";

type Step = "details" | "permissions" | "sent";

/** 10y Add staff → 10ac permissions → 10aa invite sent. */
export default function AddStaffPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [cc, setCc] = useState("+254");
  const [phone, setPhone] = useState("");
  // Verify-only by default — least privilege, and the same default /api/staff
  // applies when a field is omitted. The owner opts each extra power in.
  const [perms, setPerms] = useState({
    canVerify: true,
    canDeals: false,
    canTopup: false,
    canPurchase: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullPhone = `${cc}${phone.replace(/\D/g, "").replace(/^0+/, "")}`;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffName: name.trim(), phone: fullPhone, ...perms }),
      });
      const body = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(body.error ?? "Could not add staff.");
        return;
      }
      setStep("sent");
    } catch {
      setBusy(false);
      setError("Network error — try again.");
    }
  }

  if (step === "sent") {
    return (
      <main className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand">
          <IconCheck className="h-8 w-8 text-ink" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-ink">Invite sent</h1>
        <p className="mt-2 text-sm text-muted">
          {name} · {maskPhone(fullPhone)}
        </p>
        <p className="mt-3 text-xs text-muted">
          They can sign in with their own number. Permissions apply from first sign-in —
          change them anytime in Staff.
        </p>
        <Button
          full
          className="mt-8"
          onClick={() => {
            router.push("/merchant/staff");
            router.refresh();
          }}
        >
          Done
        </Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-[70dvh] flex-col px-5 pt-5">
      <div className="mb-6 flex items-center gap-3">
        {step === "details" ? (
          <Link href="/merchant/staff" aria-label="Back" className="p-1">
            <IconArrowLeft className="h-5 w-5" />
          </Link>
        ) : (
          <button type="button" onClick={() => setStep("details")} aria-label="Back" className="p-1">
            <IconArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className="flex-1 text-center text-lg font-bold text-ink">
          {step === "details" ? "Add staff" : "Permissions"}
        </h1>
        <span className="w-7" />
      </div>

      {step === "details" ? (
        <>
          <div className="space-y-4">
            <TextField
              label="Staff name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <PhoneField
              label="Phone"
              countryCode={cc}
              onCountryCode={setCc}
              value={phone}
              onChange={setPhone}
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Staff sign in with their own number via OTP. You choose what they can do next.
          </p>
          <div className="mt-auto pt-8">
            <Button
              full
              disabled={!name.trim() || !phone.trim()}
              onClick={() => setStep("permissions")}
            >
              Continue — set permissions
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink">What can {name} do?</p>
          <div className="mt-2 divide-y divide-line rounded-card border border-line bg-white px-4">
            <Toggle
              label="Verify redemptions"
              sub="Enter codes at the counter"
              checked={perms.canVerify}
              onChange={(v) => setPerms((p) => ({ ...p, canVerify: v }))}
            />
            <Toggle
              label="Create & edit deals"
              sub="Publish, pause, archive"
              checked={perms.canDeals}
              onChange={(v) => setPerms((p) => ({ ...p, canDeals: v }))}
            />
            <Toggle
              label="Top up wallet"
              sub="M-Pesa / card top-ups"
              checked={perms.canTopup}
              onChange={(v) => setPerms((p) => ({ ...p, canTopup: v }))}
            />
            <Toggle
              label="Purchase boosts & plan"
              sub="Spend from wallet"
              checked={perms.canPurchase}
              onChange={(v) => setPerms((p) => ({ ...p, canPurchase: v }))}
            />
          </div>
          <p className="mt-3 text-xs text-faint">The owner always keeps full access.</p>
          {error ? <p className="mt-3 text-sm font-medium text-ink">{error}</p> : null}
          <div className="mt-auto pt-8">
            <Button full onClick={save} loading={busy}>
              Save &amp; send invite
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
