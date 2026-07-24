"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  CheckboxRow,
  PhoneField,
  SegmentedControl,
  TextField,
  inputClass,
} from "@/components/ui/inputs";
import { cn } from "@/lib/ui";
import { WAITLIST_CONSENT_TEXT, type WaitlistSegment } from "@/lib/waitlist";

const SEGMENT_OPTIONS: { value: WaitlistSegment; label: string }[] = [
  { value: "shopper", label: "Shopper" },
  { value: "merchant", label: "Merchant" },
  { value: "mall_operator", label: "Mall operator" },
];

const SEGMENT_BLURB: Record<WaitlistSegment, string> = {
  shopper: "Get early access and day-one deals at BBS Mall.",
  merchant:
    "Publish deals and pay only KES 30 per verified in-person redemption.",
  mall_operator:
    "Bring measurable footfall and deal activity to your property.",
};

const BUSINESS_LABEL: Record<WaitlistSegment, string | null> = {
  shopper: null,
  merchant: "Business / shop name (optional)",
  mall_operator: "Mall / company name (optional)",
};

export function WaitlistForm({ initialSegment }: { initialSegment: WaitlistSegment }) {
  const [segment, setSegment] = useState<WaitlistSegment>(initialSegment);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+254");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState(""); // bot trap — humans never see or fill it
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { alreadyJoined: boolean }>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Please agree to receive launch updates to join the waitlist.");
      return;
    }
    setSubmitting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment,
          fullName,
          email,
          phone: `${countryCode}${phone}`,
          businessName: businessName || null,
          note: note || null,
          consent,
          hp_url: honeypot,
          utmSource: params.get("utm_source"),
          utmMedium: params.get("utm_medium"),
          utmCampaign: params.get("utm_campaign"),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone({ alreadyJoined: Boolean(body?.alreadyJoined) });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 rounded-card bg-verified-tint px-5 py-4">
        <p className="text-sm font-semibold text-verified">
          ✓ You&apos;re on the list
        </p>
        <p className="mt-1 text-sm text-ink">
          {done.alreadyJoined
            ? "You had already joined — no need to sign up twice. We'll be in touch before launch."
            : "Check your inbox for a confirmation email. We'll be in touch before launch."}
        </p>
      </div>
    );
  }

  const businessLabel = BUSINESS_LABEL[segment];

  return (
    <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
      <div>
        <span className="mb-1.5 block text-xs font-medium text-muted">
          I&apos;m joining as a
        </span>
        <SegmentedControl
          options={SEGMENT_OPTIONS}
          value={segment}
          onChange={setSegment}
        />
        <p className="mt-2 text-xs text-muted">{SEGMENT_BLURB[segment]}</p>
      </div>

      <TextField
        label="Full name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        autoComplete="name"
        required
      />
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <PhoneField
        label="Phone number"
        countryCode={countryCode}
        onCountryCode={setCountryCode}
        value={phone}
        onChange={setPhone}
      />
      {businessLabel ? (
        <TextField
          label={businessLabel}
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          autoComplete="organization"
        />
      ) : null}
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">
          Anything you&apos;d like us to know? (optional)
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={1000}
          className={cn(inputClass, "h-auto py-3")}
        />
      </label>

      {/*
        Honeypot — hidden from humans, bots that fill every field trip it.
        Named and flagged so browser autofill / password managers never
        touch it (a false positive would silently drop a real signup).
      */}
      <div aria-hidden="true" className="hidden">
        <input
          type="text"
          name="hp_url"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
        />
      </div>

      <CheckboxRow
        label={WAITLIST_CONSENT_TEXT}
        checked={consent}
        onChange={setConsent}
      />

      {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}

      <Button type="submit" full loading={submitting}>
        Join the waitlist
      </Button>
    </form>
  );
}
