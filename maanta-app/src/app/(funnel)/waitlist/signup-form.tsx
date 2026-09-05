"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { TextField, inputClass } from "@/components/ui/inputs";
import { ConfirmationPanel, Eyebrow, NumberedSteps } from "@/components/funnel/confirmation";
import { FieldLabel, SelectField, TestChip, TestNotice } from "@/components/funnel/pieces";
import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/ui";
import {
  WAITLIST_AUDIENCE_NOTE,
  WAITLIST_CONSENT_TEXT,
  WAITLIST_LOCATION_OPTIONS,
  WAITLIST_SEGMENT_OPTIONS,
  type WaitlistLocationChoice,
  type WaitlistSegment,
} from "@/lib/waitlist";
import { DEMO_FEED_HREF, PILOT_LOCATION_OTHER_MAX, pilotBookingAction } from "@/lib/marketing/pilot-status";

/**
 * The Nairobi pilot-interest form (founder direction 2026-09-05).
 *
 * Collects the minimum: email, audience, preferred shopping location, consent.
 * No phone, no name, no interests — email is the activated channel and one
 * message is the promise. The location list is the central founder-approved
 * one, no more than ten choices, and the server validates against the same
 * values; the answer is a preference, never evidence of a mall relationship.
 *
 * ## States are honest
 *
 * Success renders only on a 2xx from the API, which answers only after the
 * contact is persisted. A 5xx or a dropped connection renders the failure
 * panel and says nothing was saved. No state quotes a number of people, a
 * call, a visit or a response time.
 *
 * ## Test mode
 *
 * Consent is pre-ticked and disabled — it is recorded for the shape of the
 * data — and the button says what it does. The token is posted back for the
 * API to verify itself; a boolean from the page would be a boolean anyone
 * could send.
 */
type Done =
  | { state: "joined"; email: string }
  | { state: "already"; email: string }
  | { state: "failed" };

export const WAITLIST_SUCCESS_MESSAGE =
  "You're on the Nairobi pilot list. We'll email you when a location and opening date are confirmed.";

export function SignupForm({
  initialSegment = "shopper",
  initialEmail = "",
  testToken = "",
  isTest = false,
}: {
  initialSegment?: WaitlistSegment;
  initialEmail?: string;
  /** Verified by the page; posted back so the API verifies it again. */
  testToken?: string;
  isTest?: boolean;
}) {
  const [segment, setSegment] = useState<WaitlistSegment>(initialSegment);
  const [email, setEmail] = useState(initialEmail);
  const [location, setLocation] = useState<WaitlistLocationChoice>("bbs");
  const [locationOther, setLocationOther] = useState("");
  const [consent, setConsent] = useState(isTest);
  const [testLabel, setTestLabel] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const booking = pilotBookingAction();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Please agree to receive pilot updates to join the list.");
      return;
    }
    if (location === "other" && !locationOther.trim()) {
      setError("Tell us which Nairobi shopping location you mean.");
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
          email,
          location,
          locationOther: location === "other" ? locationOther : null,
          consent,
          hp_url: honeypot,
          utmSource: params.get("utm_source"),
          utmMedium: params.get("utm_medium"),
          utmCampaign: params.get("utm_campaign"),
          testToken: testToken || undefined,
          testLabel: testToken ? testLabel || undefined : undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (res.status >= 500) {
        setDone({ state: "failed" });
        return;
      }
      if (!res.ok || body?.ok !== true) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone({ state: body?.alreadyJoined ? "already" : "joined", email });
    } catch {
      setDone({ state: "failed" });
    } finally {
      setSubmitting(false);
    }
  }

  if (done?.state === "failed") {
    return (
      <ConfirmationPanel
        tone="error"
        title="That did not go through."
        lede="Nothing was saved, so nothing was lost. Your details are still on the form."
      >
        <Eyebrow>Why this happens</Eyebrow>
        <NumberedSteps
          items={["The connection dropped mid-request. It happens.", "Our side was briefly unavailable."]}
        />
        <div className="mt-6">
          <Button type="button" full onClick={() => setDone(null)}>
            Try again
          </Button>
        </div>
      </ConfirmationPanel>
    );
  }

  if (done?.state === "already") {
    return (
      <ConfirmationPanel
        tone="success"
        title="You're already on the list."
        lede="That address joined us before, so we have not added you twice."
      >
        <p className="text-[15px] leading-relaxed text-secondary">{WAITLIST_SUCCESS_MESSAGE}</p>
        <div className="mt-5">
          <Link
            href={DEMO_FEED_HREF}
            className="flex h-12 items-center justify-center rounded-pill bg-ink text-base font-semibold text-white hover:bg-ink-soft"
          >
            Explore demo deals
          </Link>
        </div>
        <p className="mt-3.5 text-center text-[13px] text-muted">
          Need to change your details?{" "}
          <Link href="/contact" className="underline underline-offset-2 hover:text-ink">
            Tell us
          </Link>
        </p>
      </ConfirmationPanel>
    );
  }

  if (done?.state === "joined") {
    return (
      <ConfirmationPanel
        tone="success"
        title={isTest ? "Test entry recorded." : "You're on the Nairobi pilot list."}
        lede={
          isTest
            ? "Tagged TEST, held out of every real count, and no message was sent."
            : "We'll email you when a location and opening date are confirmed."
        }
      >
        <Eyebrow>What happens next</Eyebrow>
        <NumberedSteps
          items={[
            "Nothing, for now. We will not message you until a pilot location and opening date are confirmed.",
            "Until then, the demonstration feed shows how MAANTA works. Nothing in it can be redeemed.",
            ...(segment === "mall_operator"
              ? [
                  <>
                    Want to talk about hosting a pilot?{" "}
                    {booking.external ? (
                      <a href={booking.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                        {booking.label}
                      </a>
                    ) : (
                      <Link href={booking.href} className="underline underline-offset-2">
                        {booking.label}
                      </Link>
                    )}
                    .
                  </>,
                ]
              : []),
          ]}
        />
        <div className="mt-6">
          <Link
            href={DEMO_FEED_HREF}
            className="flex h-12 items-center justify-center rounded-pill bg-ink text-base font-semibold text-white hover:bg-ink-soft"
          >
            Explore demo deals
          </Link>
        </div>
        <p className="mt-5 text-center text-[13px] text-muted">
          Wrong details?{" "}
          <button type="button" onClick={() => setDone(null)} className="underline underline-offset-2 hover:text-ink">
            Change them
          </button>{" "}
          · Every message we send has an unsubscribe link.
        </p>
      </ConfirmationPanel>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {isTest ? <TestNotice /> : null}

      <h1 className="text-balance text-[29px] font-extrabold leading-[1.1] tracking-[-0.034em] text-ink lg:text-[36px]">
        Be there when Nairobi&apos;s first MAANTA shops switch on.
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-secondary lg:text-[17px]">
        Join for one message when a confirmed pilot location and opening date are ready. Demo
        access is available now.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <TextField
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <div>
          <FieldLabel htmlFor="audience">I am a</FieldLabel>
          <SelectField id="audience" value={segment} onChange={(e) => setSegment(e.target.value as WaitlistSegment)}>
            {WAITLIST_SEGMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">{WAITLIST_AUDIENCE_NOTE}</p>
        </div>

        <div>
          <FieldLabel htmlFor="location">Preferred shopping location</FieldLabel>
          <SelectField
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value as WaitlistLocationChoice)}
          >
            {WAITLIST_LOCATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectField>
          {location === "other" ? (
            <input
              aria-label="Which Nairobi shopping location?"
              className={cn(inputClass, "mt-2")}
              value={locationOther}
              onChange={(e) => setLocationOther(e.target.value)}
              placeholder="Which shopping location?"
              maxLength={PILOT_LOCATION_OTHER_MAX}
              required
            />
          ) : (
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              A preference, not a promise: it helps decide where the first pilot runs.
            </p>
          )}
        </div>

        {isTest ? (
          <div>
            <FieldLabel htmlFor="test-label">
              Test label <span className="text-rust">— test mode only</span>
            </FieldLabel>
            <input
              id="test-label"
              className={cn(inputClass, "font-mono")}
              value={testLabel}
              onChange={(e) => setTestLabel(e.target.value)}
              placeholder="smoke-test · audience switching"
              maxLength={60}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Shows in the admin Waitlist so you know which run an entry came from.
            </p>
          </div>
        ) : null}

        {/* Honeypot — hidden from humans; bots that fill every field trip it. */}
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

        {/*
          The consent row. In test mode it is pre-ticked and disabled, in the
          disabled tokens (cream-dark fill, faint label) — never amber — and
          says so: consent is recorded for the shape of the data, no message
          is sent.
        */}
        <label className={cn("flex items-start gap-3 py-1", isTest ? "cursor-default" : "cursor-pointer")}>
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
              isTest ? "border-cream-dark bg-cream-dark" : consent ? "border-ink bg-brand" : "border-ink/60 bg-white"
            )}
          >
            {consent ? <IconCheck className={cn("h-3.5 w-3.5", isTest ? "text-faint" : "text-ink")} /> : null}
          </span>
          <input
            type="checkbox"
            checked={consent}
            disabled={isTest}
            onChange={(e) => setConsent(e.target.checked)}
            className="sr-only"
          />
          <span className={cn("text-sm leading-snug", isTest ? "text-faint" : "text-ink")}>
            {isTest ? "Consent is recorded but no message is sent in test mode." : WAITLIST_CONSENT_TEXT}
          </span>
        </label>

        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}

        <Button type="submit" full loading={submitting}>
          {isTest ? (
            <>
              <TestChip />
              Submit test entry
            </>
          ) : (
            "Join the Nairobi pilot list"
          )}
        </Button>

        <p className="text-center text-[13px] leading-relaxed text-muted">
          We use your email to tell you when a pilot location and opening date are confirmed.
          Every message has an unsubscribe link. See our{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            privacy policy
          </Link>
          .
          {isTest ? (
            <>
              {" "}
              Leave test mode by removing the <code className="font-mono">test</code> parameter from
              the address.
            </>
          ) : null}
        </p>
      </div>
    </form>
  );
}
