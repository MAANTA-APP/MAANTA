"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { PhoneField, TextField, inputClass } from "@/components/ui/inputs";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/ui";

type Step = "intro" | "business" | "location" | "floor" | "wallet" | "review" | "done";

const STEPS: { n: number; label: string }[] = [
  { n: 1, label: "Business details" },
  { n: 2, label: "Location & floor" },
  { n: 3, label: "Wallet setup" },
  { n: 4, label: "Review & submit" },
];

/** 9b–9j Merchant onboarding wizard. */
export default function MerchantOnboardPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // business details (9e)
  const [shopName, setShopName] = useState("");
  const [shopWhatsapp, setShopWhatsapp] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerCc, setOwnerCc] = useState("+254");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  // location (9f/9u)
  const [w3w, setW3w] = useState("");
  const [validating, setValidating] = useState(false);
  const [resolved, setResolved] = useState<{ words: string; place: string | null } | null>(null);

  // floor (9g)
  const [floor, setFloor] = useState("");
  const [unit, setUnit] = useState("");
  const [entranceNotes, setEntranceNotes] = useState("");

  const fullPhone = `${ownerCc}${ownerPhone.replace(/\D/g, "").replace(/^0+/, "")}`;

  async function validateAddress() {
    setValidating(true);
    setError(null);
    setResolved(null);
    try {
      const res = await fetch(`/api/w3w/validate?words=${encodeURIComponent(w3w)}`);
      const body = await res.json();
      if (!res.ok || !body.valid) {
        setError(body.error ?? "That address didn't resolve.");
      } else {
        setResolved({ words: body.words, place: body.nearestPlace ?? null });
      }
    } catch {
      setError("Could not validate the address — try again.");
    } finally {
      setValidating(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchants/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantName: shopName.trim(),
          floor: floor.trim() || null,
          unitNumber: unit.trim() || null,
          what3wordsAddress: resolved?.words ?? w3w.replace(/^\/+/, ""),
          phone: fullPhone,
          email: ownerEmail.trim() || null,
          whatsapp: shopWhatsapp.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not submit — try again.");
        setBusy(false);
        return;
      }
      setStep("done");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function Header({ title, back }: { title: string; back: Step | null }) {
    return (
      <div className="mb-6 flex items-center gap-3">
        {back ? (
          <button type="button" onClick={() => setStep(back)} aria-label="Back" className="p-1">
            <IconArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <h1 className="flex-1 text-center text-lg font-bold text-ink">{title}</h1>
        {back ? <span className="w-7" /> : null}
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col px-5 pb-10 pt-10">
      {step === "intro" ? (
        <>
          <h1 className="text-2xl font-bold text-ink">4 steps to go live</h1>
          <div className="mt-8 space-y-4">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                    i === 0 ? "bg-brand text-ink" : "bg-cream text-muted"
                  )}
                >
                  {s.n}
                </span>
                <span className="text-sm font-semibold text-ink">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-10">
            <Button full onClick={() => setStep("business")}>
              Start
            </Button>
          </div>
        </>
      ) : null}

      {step === "business" ? (
        <>
          <Header title="Business details" back="intro" />
          <div className="space-y-4">
            <TextField
              label="Shop name"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              autoFocus
            />
            <TextField
              label="Shop WhatsApp"
              value={shopWhatsapp}
              onChange={(e) => setShopWhatsapp(e.target.value)}
              placeholder="+254 7XX XXX XXX"
            />
            <p className="pt-2 text-sm font-bold text-ink">Owner details</p>
            <TextField
              label="Owner name"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
            <PhoneField
              label="Owner phone"
              countryCode={ownerCc}
              onCountryCode={setOwnerCc}
              value={ownerPhone}
              onChange={setOwnerPhone}
            />
            <TextField
              label="Owner email"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
            />
          </div>
          <div className="mt-auto pt-8">
            <Button
              full
              disabled={!shopName.trim() || !ownerPhone.trim()}
              onClick={() => setStep("location")}
            >
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === "location" ? (
        <>
          <Header title="Location" back="business" />
          <label className="mb-1.5 block text-xs font-medium text-muted">
            what3words address <span className="font-semibold text-flame">*required</span>
          </label>
          <input
            value={w3w}
            onChange={(e) => {
              setW3w(e.target.value);
              setResolved(null);
            }}
            placeholder="///stove.cactus.rally"
            className={cn(inputClass, "font-mono")}
            autoFocus
          />
          {!resolved ? (
            <>
              <Button
                full
                className="mt-4"
                onClick={validateAddress}
                loading={validating}
                disabled={!w3w.trim()}
              >
                Validate address
              </Button>
              <p className="mt-3 rounded-card bg-cream px-4 py-3 text-xs text-muted">
                We&apos;ll confirm this 3-word address points to a unit inside BBS Mall.
              </p>
            </>
          ) : (
            <div className="mt-4 flex items-start gap-2 rounded-card bg-cream px-4 py-3 text-sm text-ink">
              <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-verified" />
              <span>
                Resolved{resolved.place ? `: ${resolved.place}` : ""} ·{" "}
                <a
                  href={`https://what3words.com/${resolved.words}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  view map
                </a>
              </span>
            </div>
          )}
          {error ? <p className="mt-3 text-sm font-medium text-flame">{error}</p> : null}
          <div className="mt-auto pt-8">
            <Button full disabled={!resolved} onClick={() => setStep("floor")}>
              Continue
            </Button>
            <p className="mt-2 text-center text-xs text-faint">
              Continue stays disabled until the address validates
            </p>
          </div>
        </>
      ) : null}

      {step === "floor" ? (
        <>
          <Header title="Floor & unit" back="location" />
          <div className="space-y-4">
            <TextField
              label="Floor"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
              placeholder="Floor 2"
              autoFocus
            />
            <TextField
              label="Unit / kiosk"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Unit 12"
            />
            <TextField
              label="Entrance notes"
              value={entranceNotes}
              onChange={(e) => setEntranceNotes(e.target.value)}
              placeholder="near Entrance B"
            />
          </div>
          <div className="mt-auto pt-8">
            <Button full onClick={() => setStep("wallet")}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === "wallet" ? (
        <>
          <Header title="Wallet" back="floor" />
          <p className="text-sm text-muted">
            Each verified redemption costs a{" "}
            <span className="font-bold text-ink">KES 30 success fee</span>, funded from
            your wallet.
          </p>
          <div className="mt-5 flex items-center justify-between rounded-card border border-line bg-white px-4 py-3.5">
            <span className="text-sm font-semibold text-ink">Suggested top-up</span>
            <span className="text-sm font-bold text-ink">KES 3,000</span>
          </div>
          <p className="mt-3 text-xs text-faint">
            You&apos;ll top up by M-Pesa or card right after your shop is submitted.
          </p>
          <div className="mt-auto pt-8">
            <Button full onClick={() => setStep("review")}>
              Continue
            </Button>
          </div>
        </>
      ) : null}

      {step === "review" ? (
        <>
          <Header title="Review & submit" back="wallet" />
          <div className="space-y-3">
            {[
              ["Shop", shopName],
              ["Owner", `${ownerName || "—"} · ${fullPhone}`],
              ["Location", `///${(resolved?.words ?? w3w).replace(/^\/+/, "")}`],
              ["Floor & unit", [floor, unit].filter(Boolean).join(", ") || "—"],
              ["Wallet", "Top up after submission (suggested KES 3,000)"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-4 rounded-card border border-line bg-white px-4 py-3.5"
              >
                <span className="text-xs text-muted">{k}</span>
                <span className="text-right text-sm font-semibold text-ink">{v}</span>
              </div>
            ))}
          </div>
          {error ? <p className="mt-4 text-sm font-medium text-flame">{error}</p> : null}
          <div className="mt-auto pt-8">
            <Button full onClick={submit} loading={busy}>
              Submit for verification
            </Button>
          </div>
        </>
      ) : null}

      {step === "done" ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand">
            <IconCheck className="h-8 w-8 text-ink" />
          </span>
          <h1 className="mt-5 text-2xl font-bold text-ink">Submitted for verification</h1>
          <p className="mt-2 text-sm text-muted">
            We&apos;ll review your details and notify you within 24 hours
          </p>
          <ButtonLink href="/merchant/topup?suggested=3000" full className="mt-8">
            Top up wallet now
          </ButtonLink>
          <Button
            variant="ghost"
            full
            className="mt-3"
            onClick={() => {
              router.push("/merchant/redeem");
              router.refresh();
            }}
          >
            Back to home
          </Button>
        </div>
      ) : null}
    </main>
  );
}
