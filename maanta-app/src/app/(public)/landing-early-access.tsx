"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/claude";
import { IconAlert } from "@/components/ui/icons";
import { inputClass } from "@/components/ui/inputs";

/** Compact early-access email → full waitlist form (needs name/phone/consent). */
export function LandingEarlyAccess() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email.");
      return;
    }
    const params = new URLSearchParams({
      segment: "shopper",
      email: trimmed,
    });
    router.push(`/waitlist?${params.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-4 shadow-card sm:flex-row sm:items-start"
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor={fieldId}
          className="mb-1.5 block text-xs font-medium text-muted"
        >
          Email
        </label>
        <input
          id={fieldId}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hintId}
          className={`${inputClass} !rounded-full`}
        />
        {error ? (
          // role="alert" so the failure is announced. Red stays on the icon and
          // the message stays ink (frozen rule 4) — the icon, not the colour,
          // is what distinguishes this from the hint in greyscale.
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink"
          >
            <IconAlert className="h-3.5 w-3.5 text-flame" />
            {error}
          </p>
        ) : (
          <p id={hintId} className="mt-1.5 text-[11px] text-faint">
            Continues to the waitlist — we&apos;ll ask for your name and phone next.
          </p>
        )}
      </div>
      {/* Offset by the label's height so the button lines up with the input,
          not the label, once the form goes side-by-side. */}
      <PrimaryButton
        type="submit"
        size="lg"
        className="shrink-0 sm:mt-[1.375rem] sm:w-auto"
      >
        Join waitlist
      </PrimaryButton>
    </form>
  );
}
