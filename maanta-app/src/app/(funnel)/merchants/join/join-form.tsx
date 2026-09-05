"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PhoneField, SegmentedControl, TextField, inputClass } from "@/components/ui/inputs";
import { IconCheck } from "@/components/ui/icons";
import { Callout, ConfirmationPanel, Eyebrow, NumberedSteps } from "@/components/funnel/confirmation";
import { FieldLabel, RoleChip, SelectField, TestChip, TestNotice } from "@/components/funnel/pieces";
import { cn } from "@/lib/ui";
import { SUCCESS_FEE_KES } from "@/lib/pricing";
import { FACTS, OFFERS } from "@/lib/marketing/facts";
import { MARKETING_EVENTS, trackMarketing } from "@/lib/marketing/analytics";
import { LEAD_FLOOR_LABELS, type LeadFloor } from "@/lib/growth/leads";
import {
  COUNTER_STAFF_OPTIONS,
  MERCHANT_CATEGORIES,
  MERCHANT_CONTACT_CONSENT_TEXT,
  MERCHANT_FLOOR_OPTIONS,
  MERCHANT_MALL_OPTIONS,
  type CounterStaff,
} from "@/lib/merchant-interest";

/**
 * The merchant interest form (board 2, M6) → `POST /api/merchants/interest`.
 *
 * Asks for the unit, because a node team would have to find the shop if a
 * pilot is agreed. Asks for no email, because the merchant is reached on
 * WhatsApp — this is the one form on the site where "phone first, email never"
 * holds without a caveat.
 *
 * Not a contract: nothing is charged until a deal is published and a shopper
 * redeems it, and the copy says so under the button. The analytics event
 * records that a submission happened and from which form — never the shop
 * name or the number (`marketing-analytics.test.ts`).
 *
 * Deliberately no `useSearchParams` and no `Suspense`, so the form still
 * server-renders (the D41 lesson). UTMs are read from `window.location` at
 * submit time, like the waitlist form.
 */
type Done =
  | { state: "registered"; floor: LeadFloor; unit: string; mall: string }
  | { state: "already"; floor: LeadFloor; unit: string; mall: string }
  | { state: "failed" };

export function MerchantJoinForm({
  testToken = "",
  isTest = false,
  offer,
}: {
  testToken?: string;
  isTest?: boolean;
  offer: { creditLive: boolean; trialLive: boolean; creditUntil: string };
}) {
  const [shopName, setShopName] = useState("");
  const [contactName, setContactName] = useState("");
  const [cc, setCc] = useState("+254");
  const [phone, setPhone] = useState("");
  const [mall, setMall] = useState<"bbs" | "other">("bbs");
  const [mallOther, setMallOther] = useState("");
  const [floor, setFloor] = useState<LeadFloor>("GF");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [counterStaff, setCounterStaff] = useState<CounterStaff | "">("");
  const [eliteTrial, setEliteTrial] = useState(false);
  const [contactConsent, setContactConsent] = useState(isTest);
  const [testLabel, setTestLabel] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const mallName = mall === "other" ? mallOther.trim() || "your location" : FACTS.candidateMall;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contactConsent) {
      setError("Tick the box so we are allowed to contact you.");
      return;
    }
    setSubmitting(true);
    // Records that a merchant registered interest. No shop name, no number.
    trackMarketing(MARKETING_EVENTS.formSubmit, { form: "merchant-join" });
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch("/api/merchants/interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName,
          contactName,
          phone: `${cc}${phone}`,
          mall,
          mallOther: mall === "other" ? mallOther : null,
          floor,
          unit,
          category: category || null,
          counterStaff: counterStaff || null,
          eliteTrial,
          contactConsent,
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
      setDone({
        state: body?.alreadyRegistered ? "already" : "registered",
        floor,
        unit: unit.trim(),
        mall: mallName,
      });
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
      </ConfirmationPanel>
    );
  }

  if (done?.state === "already") {
    return (
      <ConfirmationPanel
        tone="success"
        title="That unit is already on our list."
        lede={`${LEAD_FLOOR_LABELS[done.floor]}, Unit ${done.unit} — ${done.mall}. Someone registered it before, so we have not added it twice.`}
      >
        <p className="text-[15px] leading-relaxed text-secondary">
          We will be in touch on WhatsApp if a pilot is confirmed for your location. If the
          number we hold is wrong, tell us and we will fix it.
        </p>
        <div className="mt-5">
          <Link
            href="/contact"
            className="flex h-12 items-center justify-center rounded-pill bg-ink text-base font-semibold text-white hover:bg-ink-soft"
          >
            Tell us
          </Link>
        </div>
      </ConfirmationPanel>
    );
  }

  if (done?.state === "registered") {
    return (
      <ConfirmationPanel
        tone="success"
        title={isTest ? "Test entry recorded." : "Got it. You're on the pilot list."}
        lede={
          isTest
            ? "Tagged TEST, held out of every growth figure, and nobody will be contacted."
            : `${LEAD_FLOOR_LABELS[done.floor]}, Unit ${done.unit} — ${done.mall}.`
        }
      >
        <p className="text-[15px] leading-relaxed text-secondary">
          We will email or WhatsApp you when a pilot location and opening date are confirmed.
          Neither has been confirmed yet.
        </p>
        <div className="mt-6">
          <Eyebrow>Before a pilot opens</Eyebrow>
          <NumberedSteps
            items={[
              "Think of one thing you would discount to bring people in.",
              "Have a photo of it on your phone. That is your deal cover.",
              "Decide who at the counter should be allowed to verify codes.",
            ]}
          />
        </div>
        {offer.creditLive || offer.trialLive ? (
          <div className="mt-6">
            <Callout>
              <p className="text-[15px] font-bold text-ink">The planned pilot opening offer</p>
              <p className="mt-1 text-sm leading-relaxed text-secondary">
                {[
                  offer.creditLive ? `KES ${OFFERS.openingCredit.amountKes} credit` : null,
                  offer.trialLive ? `${OFFERS.eliteTrial.days} days of Elite` : null,
                ]
                  .filter(Boolean)
                  .join(" and ")}
                , for eligible shops in the first confirmed pilot. {offer.creditUntil}.
              </p>
            </Callout>
          </div>
        ) : null}
        <p className="mt-5 text-center text-[13px] text-muted">
          Nothing is charged today. Nothing is a contract yet.
        </p>
      </ConfirmationPanel>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {isTest ? <TestNotice /> : null}
      <RoleChip label="Shop owner" changeHref="/waitlist" />

      <h1 className="text-balance text-[29px] font-extrabold leading-[1.1] tracking-[-0.034em] text-ink lg:text-[36px]">
        Tell us where your shop is.
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-secondary lg:text-[17px]">
        If a pilot is agreed for your location, a node team would walk the floor unit by unit. The
        clearer the address, the faster they would reach you.
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-[14px] bg-stone p-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ink font-mono text-[15px] font-bold text-white">
          {SUCCESS_FEE_KES}
        </span>
        <p className="text-[13px] leading-snug text-ink">
          <strong className="font-bold">KES {SUCCESS_FEE_KES} per verified redemption.</strong>{" "}
          Registering interest costs nothing and commits you to nothing.
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        <TextField
          label="Shop name"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          placeholder="The name above your door"
          autoComplete="organization"
          maxLength={160}
          required
        />
        <TextField
          label="Your name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Who should we ask for?"
          autoComplete="name"
          maxLength={120}
          required
        />
        <div>
          <PhoneField label="Phone number" countryCode={cc} onCountryCode={setCc} value={phone} onChange={setPhone} />
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            We reach out on WhatsApp first, once a pilot is confirmed.
          </p>
        </div>

        <div>
          <FieldLabel htmlFor="mall">Shopping location</FieldLabel>
          <SelectField id="mall" value={mall} onChange={(e) => setMall(e.target.value as "bbs" | "other")}>
            {MERCHANT_MALL_OPTIONS.map((o) => (
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
              maxLength={120}
              required
            />
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <div>
            <FieldLabel htmlFor="floor">Floor</FieldLabel>
            <SelectField id="floor" value={floor} onChange={(e) => setFloor(e.target.value as LeadFloor)}>
              {MERCHANT_FLOOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <FieldLabel htmlFor="unit">Unit</FieldLabel>
            <input
              id="unit"
              className={cn(inputClass, "font-mono [font-feature-settings:'zero']")}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="12"
              maxLength={16}
              required
            />
          </div>
        </div>

        <div>
          <FieldLabel htmlFor="category">What do you sell?</FieldLabel>
          <SelectField id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Choose a category</option>
            {MERCHANT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </div>

        <div>
          <FieldLabel>How many people work your counter?</FieldLabel>
          <SegmentedControl
            options={COUNTER_STAFF_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={counterStaff === "" ? ("" as CounterStaff) : counterStaff}
            onChange={setCounterStaff}
          />
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
              placeholder="smoke-test · merchant form"
              maxLength={60}
            />
          </div>
        ) : null}

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

        {offer.trialLive ? (
          <Check
            checked={eliteTrial}
            onChange={setEliteTrial}
            label={`Include me in the planned ${OFFERS.eliteTrial.days}-day Elite trial for the first ${OFFERS.eliteTrial.cohortShops} eligible pilot shops.`}
          />
        ) : null}
        <Check
          checked={contactConsent}
          onChange={setContactConsent}
          disabled={isTest}
          label={isTest ? "Consent is recorded but nobody is contacted in test mode." : MERCHANT_CONTACT_CONSENT_TEXT}
        />

        {error ? <InlineAlert variant="error">{error}</InlineAlert> : null}

        <Button type="submit" full loading={submitting}>
          {isTest ? (
            <>
              <TestChip />
              Submit test entry
            </>
          ) : (
            "Register interest"
          )}
        </Button>

        <p className="text-center text-[13px] leading-relaxed text-muted">
          Not a contract. Nothing is charged until you publish a deal and a shopper redeems it.
          Already set up?{" "}
          <Link href="/login" className="underline underline-offset-2 hover:text-ink">
            Sign in
          </Link>
          .
        </p>
      </div>
    </form>
  );
}

/** A checkbox row that can render in the disabled tokens (test mode). */
function Check({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-start gap-3 py-1", disabled ? "cursor-default" : "cursor-pointer")}>
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2",
          disabled ? "border-cream-dark bg-cream-dark" : checked ? "border-ink bg-brand" : "border-ink/60 bg-white"
        )}
      >
        {checked ? <IconCheck className={cn("h-3.5 w-3.5", disabled ? "text-faint" : "text-ink")} /> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className={cn("text-sm leading-snug", disabled ? "text-faint" : "text-ink")}>{label}</span>
    </label>
  );
}
