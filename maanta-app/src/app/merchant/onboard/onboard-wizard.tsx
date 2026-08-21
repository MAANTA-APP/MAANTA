"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { PhoneField, TextField, inputClass } from "@/components/ui/inputs";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/ui";
import { takeMerchantJoin } from "@/lib/merchant-join-handoff";

type Step = "intro" | "business" | "location" | "floor" | "wallet" | "review" | "done";

/** A field agent the merchant can credit for assisting their onboarding (G1). */
export type OnboardAgent = { id: string; name: string };

const STEPS: { n: number; label: string }[] = [
  { n: 1, label: "Business details" },
  { n: 2, label: "Location & floor" },
  { n: 3, label: "Wallet setup" },
  { n: 4, label: "Review & submit" },
];

/** 9b–9j Merchant onboarding wizard. `successFee` is the canonical app_config
 * success fee, fetched server-side by the page and passed in so the wallet-step
 * copy reflects the real charge instead of a hardcoded literal. */
export function OnboardWizard({
  successFee,
  agents = [],
  initialShopName = "",
}: {
  successFee: number;
  agents?: OnboardAgent[];
  /** Prefill from `/merchants/join` → `/login?next=/merchant/onboard?shop=…`. */
  initialShopName?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // G1 — agent-assisted onboarding attribution. The merchant answers "Were you
  // helped by a Maanta agent?" and, if yes, picks who. The agent is attribution
  // only; the merchant is always the authenticated submitter. `assistedByAgent`
  // is null until answered so we can require an explicit choice before submit.
  const hasAgents = agents.length > 0;
  const [assistedByAgent, setAssistedByAgent] = useState<boolean | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const attributionAnswered =
    !hasAgents || assistedByAgent === false || (assistedByAgent === true && !!selectedAgentId);

  // business details (9e) — shop name may arrive from the public lead form.
  const [shopName, setShopName] = useState(initialShopName);
  const [shopWhatsapp, setShopWhatsapp] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerCc, setOwnerCc] = useState("+254");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");

  /**
   * Pick up the phone number left by `/merchants/join`.
   *
   * The join form asks for a number and, before this handoff existed, dropped it
   * on the floor — the merchant typed it again two steps later. It arrives via
   * `sessionStorage` rather than the URL so it stays out of history, `Referer`
   * and the PostHog `$current_url`; see `@/lib/merchant-join-handoff`.
   *
   * Read once, after mount, and only into empty fields, so it can never
   * overwrite something the merchant has already typed.
   */
  useEffect(() => {
    const stashed = takeMerchantJoin();
    if (!stashed) return;
    setOwnerPhone((cur) => cur || stashed.phone);
    setOwnerCc((cur) => (cur === "+254" ? stashed.cc : cur));
  }, []);

  // location (9f/9u)
  const [w3w, setW3w] = useState("");
  const [validating, setValidating] = useState(false);
  const [resolved, setResolved] = useState<{
    words: string;
    place: string | null;
    lat: number | null;
    lng: number | null;
  } | null>(null);

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
        setResolved({
          words: body.words,
          place: body.nearestPlace ?? null,
          lat: typeof body.lat === "number" ? body.lat : null,
          lng: typeof body.lng === "number" ? body.lng : null,
        });
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
          lat: resolved?.lat ?? null,
          lng: resolved?.lng ?? null,
          phone: fullPhone,
          email: ownerEmail.trim() || null,
          whatsapp: shopWhatsapp.trim() || null,
          // G3 — the floor step captures entrance notes; carry them through
          // instead of silently dropping them before the RPC.
          entranceNotes: entranceNotes.trim() || null,
          // G1 — agent attribution. Only sent when the merchant answered "Yes"
          // and picked an agent; "No" (or no agents available) sends null, which
          // the RPC records as self_serve.
          onboardingAgentId:
            assistedByAgent && selectedAgentId ? selectedAgentId : null,
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

  // Which numbered step (of STEPS) each screen belongs to — "location" and
  // "floor" are both halves of step 2, "Location & floor".
  const STEP_NUMBER: Partial<Record<Step, number>> = {
    business: 1,
    location: 2,
    floor: 2,
    wallet: 3,
    review: 4,
  };

  function Header({ title, back }: { title: string; back: Step | null }) {
    // The intro promises "4 steps to go live"; the step headers now say where
    // in those 4 the merchant is, same as the new-deal wizard.
    const stepNumber = STEP_NUMBER[step];
    return (
      <div className="mb-6 flex items-center gap-3">
        {back ? (
          <button type="button" onClick={() => setStep(back)} aria-label="Back" className="p-1">
            <IconArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <div className="flex-1 text-center">
          <h1 className="text-lg font-bold text-ink">{title}</h1>
          {stepNumber ? (
            <p className="text-[11px] font-medium text-faint">
              Step {stepNumber} of {STEPS.length}
            </p>
          ) : null}
        </div>
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
              type="tel"
              inputMode="tel"
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
          {/* The label wraps the input — as siblings it never reached the
              field, leaving the wizard's one required free-text input unnamed
              to assistive tech. */}
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              what3words address <span className="font-semibold text-ink">*required</span>
            </span>
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
          </label>
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
          {error ? (
            <p className="mt-3 text-sm font-medium text-ink" role="alert">
              {error}
            </p>
          ) : null}
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
            <span className="font-bold text-ink">
              KES {successFee.toLocaleString("en-KE")} success fee
            </span>
            , funded from your wallet.
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
          {hasAgents ? (
            <div className="mt-6">
              <p className="text-sm font-bold text-ink">
                Were you helped by a Maanta agent?
              </p>
              <p className="mt-1 text-xs text-muted">
                So we can credit the field agent who signed you up. You&apos;re
                still submitting this yourself.
              </p>
              <div
                role="radiogroup"
                aria-label="Were you helped by a Maanta agent?"
                className="mt-3 grid grid-cols-2 gap-3"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={assistedByAgent === false}
                  onClick={() => {
                    setAssistedByAgent(false);
                    setSelectedAgentId("");
                  }}
                  className={cn(
                    "h-11 rounded-full border text-sm font-semibold",
                    assistedByAgent === false
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-ink"
                  )}
                >
                  No
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={assistedByAgent === true}
                  onClick={() => setAssistedByAgent(true)}
                  className={cn(
                    "h-11 rounded-full border text-sm font-semibold",
                    assistedByAgent === true
                      ? "border-ink bg-ink text-white"
                      : "border-line bg-white text-ink"
                  )}
                >
                  Yes
                </button>
              </div>
              {assistedByAgent === true ? (
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    Which agent?
                  </span>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className={cn(inputClass, "appearance-none")}
                  >
                    <option value="">Select an agent…</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="mt-4 text-sm font-medium text-ink" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-auto pt-8">
            <Button
              full
              onClick={submit}
              loading={busy}
              disabled={!attributionAnswered}
            >
              Submit for verification
            </Button>
            {hasAgents && !attributionAnswered ? (
              <p className="mt-2 text-center text-xs text-faint">
                {assistedByAgent === true
                  ? "Choose the agent who helped you, or select “No”."
                  : "Let us know if an agent helped you."}
              </p>
            ) : null}
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
