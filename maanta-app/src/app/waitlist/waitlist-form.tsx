"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { CONSENT_TEXT, type WaitlistSegment } from "@/lib/waitlist";

type FormState =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "success" }
  | { step: "error"; message: string };

const inputClass =
  "rounded border border-black/10 px-3 py-2 dark:border-white/20 dark:bg-transparent";

// One form for all three segments; the segment is fixed by the page that
// renders it (never a user choice) so CRM segmentation starts at the source.
// Must be rendered inside <Suspense> — useSearchParams opts the page into
// client-side rendering for the UTM capture.
export default function WaitlistForm({ segment }: { segment: WaitlistSegment }) {
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Nairobi");
  const [businessName, setBusinessName] = useState("");
  const [businessCategory, setBusinessCategory] = useState("");
  const [floorUnit, setFloorUnit] = useState("");
  const [mallName, setMallName] = useState("");
  const [mallRole, setMallRole] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot — stays empty for humans
  const [state, setState] = useState<FormState>({ step: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ step: "loading" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentType: segment,
          fullName,
          email,
          phone,
          city,
          consent,
          website,
          utmCampaign: searchParams.get("utm_campaign"),
          utmMedium: searchParams.get("utm_medium"),
          utmSource: searchParams.get("utm_source"),
          ...(segment === "merchant"
            ? { businessName, businessCategory, floorUnit }
            : {}),
          ...(segment === "mall_operator" ? { mallName, mallRole } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({
          step: "error",
          message: body.error ?? "Could not save your signup.",
        });
        return;
      }
      setState({ step: "success" });
    } catch {
      setState({ step: "error", message: "Network error — please try again." });
    }
  }

  if (state.step === "success") {
    return (
      <div className="flex flex-col gap-2 rounded border border-black/10 p-6 text-center dark:border-white/20">
        <p className="text-lg font-medium">You&apos;re on the list 🎉</p>
        <p className="text-sm text-black/60 dark:text-white/60">
          We&apos;ll email you before the BBS Mall launch with everything you
          need.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Phone
        <input
          type="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0712 345 678"
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        City
        <input
          type="text"
          required
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className={inputClass}
        />
      </label>

      {segment === "merchant" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Business name
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Business category
            <input
              type="text"
              required
              value={businessCategory}
              onChange={(e) => setBusinessCategory(e.target.value)}
              placeholder="e.g. Fashion, Food, Electronics"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Floor / unit (optional)
            <input
              type="text"
              value={floorUnit}
              onChange={(e) => setFloorUnit(e.target.value)}
              placeholder="e.g. 2nd floor, Unit 24"
              className={inputClass}
            />
          </label>
        </>
      )}

      {segment === "mall_operator" && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            Mall name
            <input
              type="text"
              required
              value={mallName}
              onChange={(e) => setMallName(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Your role at the mall
            <input
              type="text"
              required
              value={mallRole}
              onChange={(e) => setMallRole(e.target.value)}
              placeholder="e.g. Manager, Owner, Leasing"
              className={inputClass}
            />
          </label>
        </>
      )}

      {/* Honeypot: hidden from humans, filled by bots. */}
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1"
        />
        <span className="text-black/70 dark:text-white/70">{CONSENT_TEXT}</span>
      </label>

      <button
        type="submit"
        disabled={state.step === "loading"}
        className="rounded bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {state.step === "loading" ? "Joining…" : "Join the waitlist"}
      </button>
      {state.step === "error" && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
    </form>
  );
}
