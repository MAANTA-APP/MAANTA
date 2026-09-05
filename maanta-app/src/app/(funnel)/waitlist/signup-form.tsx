"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PhoneField, TextField, inputClass } from "@/components/ui/inputs";
import { ChipGroup } from "@/components/funnel/chips";
import {
  Callout,
  ConfirmationPanel,
  Eyebrow,
  FactRows,
  NumberedSteps,
  maskPhone,
} from "@/components/funnel/confirmation";
import { FieldLabel, RoleChip, SelectField, StepProgress, TestChip, TestNotice } from "@/components/funnel/pieces";
import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/ui";
import { FACTS, RESPONSE_TIMES } from "@/lib/marketing/facts";
import {
  SHOPPER_INTERESTS,
  WAITLIST_CONSENT_TEXT,
  WAITLIST_MALL_OPTIONS,
  WAITLIST_SEGMENT_OPTIONS,
  type ShopperInterest,
  type WaitlistMallChoice,
  type WaitlistSegment,
} from "@/lib/waitlist";

type Segment = Exclude<WaitlistSegment, "merchant">;

/**
 * Step 2 of 2 — "Where should we message you?" (board 2, M5), for shoppers and
 * mall operators. Merchants go to `/merchants/join`.
 *
 * ## Phone first, email kept — founder ruling 2026-09-05
 *
 * The board's rule is "phone first, email never". The phone is first, and it is
 * the number the message will reach. The email stays because it is the thing
 * every piece of infrastructure keys on today — the sending platform's contact,
 * the mirror's identity, the consent wording a person actually agrees to — and
 * there is no SMS or WhatsApp sender in this codebase to replace it with.
 * Dropping the field would have meant a form that collects a number nothing
 * can message. The channel is an open founder decision (register D269).
 *
 * ## The confirmation never quotes a number of people
 *
 * "You're number 147" and "join 2,000 others" are traction, and there is none
 * to show. Every state says what happens next instead.
 *
 * ## Test mode (M8)
 *
 * Consent is pre-ticked and disabled — it is recorded for the shape of the data
 * — and the button says what it does. The token is posted back for the API to
 * verify itself; a boolean from the page would be a boolean anyone could send.
 */
const COPY: Record<Segment, { chip: string; h1: string; lede: string }> = {
  shopper: {
    chip: "Shopper",
    h1: "Where should we message you?",
    lede: `One message when ${FACTS.nodeLabel} opens. Nothing else.`,
  },
  mall_operator: {
    chip: "Mall operator",
    h1: "Where should we reach you?",
    lede: `One message when ${FACTS.nodeLabel} opens, and how a node would work on your floors.`,
  },
};

type Done =
  | { state: "joined"; phone: string; mall: string }
  | { state: "already"; phone: string; mall: string }
  | { state: "failed" };

export function SignupForm({
  segment,
  initialEmail = "",
  testToken = "",
  isTest = false,
  changeHref,
}: {
  segment: Segment;
  initialEmail?: string;
  /** Verified by the page; posted back so the API verifies it again. */
  testToken?: string;
  isTest?: boolean;
  changeHref: string;
}) {
  const [countryCode, setCountryCode] = useState("+254");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [mall, setMall] = useState<WaitlistMallChoice>("bbs");
  const [mallOther, setMallOther] = useState("");
  const [interests, setInterests] = useState<ShopperInterest[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [consent, setConsent] = useState(isTest);
  const [testLabel, setTestLabel] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const copy = COPY[segment];
  const segmentLabel = WAITLIST_SEGMENT_OPTIONS.find((o) => o.value === segment)?.label ?? copy.chip;
  const mallName = mall === "other" ? mallOther.trim() || "another mall" : FACTS.launchMall;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("Please agree to receive launch updates to join the waitlist.");
      return;
    }
    setSubmitting(true);
    const fullPhone = `${countryCode}${phone}`;
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segment,
          fullName: firstName || null,
          email,
          phone: fullPhone,
          mall,
          mallOther: mall === "other" ? mallOther : null,
          interests,
          businessName: businessName || null,
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
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setDone({ state: body?.alreadyJoined ? "already" : "joined", phone: fullPhone, mall: mallName });
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
          items={[
            "The connection dropped mid-request. It happens.",
            "Our side was briefly unavailable.",
          ]}
        />
        <div className="mt-6">
          <Button type="button" full onClick={() => setDone(null)}>
            Start again
          </Button>
        </div>
        <p className="mt-3.5 text-center text-[13px] text-muted">
          It takes under a minute. Your number and email are all we need.
        </p>
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
        <FactRows
          rows={[
            { label: "Number", value: <span className="font-mono">{maskPhone(done.phone)}</span> },
            { label: "Listed as", value: `${segmentLabel} · ${done.mall}` },
          ]}
        />
        <p className="mt-5 text-[15px] leading-relaxed text-secondary">
          We will message you once, when {FACTS.nodeLabel} opens. Joining again does not
          move you up — there is no queue to jump.
        </p>
        <div className="mt-5">
          <Link
            href={segment === "mall_operator" ? "/mall-operators" : "/shoppers"}
            className="flex h-12 items-center justify-center rounded-pill bg-ink text-base font-semibold text-white hover:bg-ink-soft"
          >
            See how it will work
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
        title={isTest ? "Test entry recorded." : "Karibu — you're on the list."}
        lede={
          isTest
            ? "Tagged TEST, held out of every real count, and no message was sent."
            : segment === "mall_operator"
              ? "We have your details, and we know which property you manage."
              : `We have your number and we know you shop at ${done.mall}.`
        }
      >
        <Eyebrow>What happens next</Eyebrow>
        <NumberedSteps
          items={
            segment === "mall_operator"
              ? [
                  "Nothing, for now. We will not message you until there is something to show.",
                  `When ${FACTS.nodeLabel} opens, one message with what a node did at ${FACTS.launchMall}.`,
                  <>
                    Want a pilot conversation sooner?{" "}
                    <Link href="/contact?topic=mall-operator" className="underline underline-offset-2">
                      Book one
                    </Link>{" "}
                    — we reply within {RESPONSE_TIMES.operator}.
                  </>,
                ]
              : [
                  "Nothing, for now. We will not message you until there is something to claim.",
                  `When ${FACTS.nodeLabel} opens, one message with a link to the feed.`,
                  `Claim a deal, walk to the shop, read out your ${FACTS.codeLength} digits.`,
                ]
          }
        />
        {segment === "shopper" ? (
          <div className="mt-6">
            <Callout>
              <p className="text-[15px] font-bold text-ink">Know a shop that should be on this?</p>
              <p className="mt-1 text-sm leading-relaxed text-secondary">
                The more shops in your mall publish, the more there is to claim.
              </p>
              <Link
                href="/merchants"
                className="mt-3 inline-flex h-9 items-center rounded-pill border border-ink bg-white px-4 text-[13px] font-semibold text-ink hover:bg-stone"
              >
                Send them the shop page
              </Link>
            </Callout>
          </div>
        ) : null}
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
      <StepProgress step={2} total={2} />
      {isTest ? <TestNotice /> : null}
      <RoleChip label={copy.chip} changeHref={changeHref} />

      <h1 className="text-balance text-[29px] font-extrabold leading-[1.1] tracking-[-0.034em] text-ink lg:text-[36px]">
        {copy.h1}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-secondary lg:text-[17px]">{copy.lede}</p>

      <div className="mt-5 flex flex-col gap-4">
        <PhoneField
          label="Phone number"
          countryCode={countryCode}
          onCountryCode={setCountryCode}
          value={phone}
          onChange={setPhone}
        />

        <TextField
          label="Email — for the confirmation"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <div>
          <FieldLabel htmlFor="first-name" hint="optional">
            First name
          </FieldLabel>
          <input
            id="first-name"
            className={inputClass}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            placeholder="So we can greet you properly"
          />
        </div>

        {segment === "shopper" ? (
          <>
            <div>
              <FieldLabel htmlFor="mall">Which mall do you shop at?</FieldLabel>
              <SelectField id="mall" value={mall} onChange={(e) => setMall(e.target.value as WaitlistMallChoice)}>
                {WAITLIST_MALL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectField>
              {mall === "other" ? (
                <input
                  aria-label="Which mall?"
                  className={cn(inputClass, "mt-2")}
                  value={mallOther}
                  onChange={(e) => setMallOther(e.target.value)}
                  placeholder="Which mall?"
                  maxLength={80}
                  required
                />
              ) : (
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  Somewhere else? Pick &ldquo;Another mall&rdquo; and tell us which — it helps us
                  choose Node 1.
                </p>
              )}
            </div>

            <div>
              <FieldLabel hint="optional">What do you usually shop for?</FieldLabel>
              <ChipGroup
                label="What do you usually shop for?"
                options={SHOPPER_INTERESTS}
                value={interests}
                onChange={setInterests}
              />
            </div>
          </>
        ) : (
          <div>
            <FieldLabel htmlFor="business" hint="optional">
              Mall or company
            </FieldLabel>
            <input
              id="business"
              className={inputClass}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              autoComplete="organization"
              maxLength={160}
            />
          </div>
        )}

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
              placeholder="smoke-test · role switching"
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
              isTest
                ? "border-cream-dark bg-cream-dark"
                : consent
                  ? "border-ink bg-brand"
                  : "border-ink/60 bg-white"
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
            "Join the waitlist"
          )}
        </Button>

        <p className="text-center text-[13px] leading-relaxed text-muted">
          {isTest ? (
            <>
              Leave test mode by removing the <code className="font-mono">test</code> parameter from
              the address.
            </>
          ) : (
            <>
              We use your number and email to tell you when MAANTA opens. Every message has an
              unsubscribe link. See our{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
                privacy policy
              </Link>
              .
            </>
          )}
        </p>
      </div>
    </form>
  );
}
