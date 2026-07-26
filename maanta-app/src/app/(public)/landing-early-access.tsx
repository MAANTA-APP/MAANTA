"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/claude";
import { inputClass } from "@/components/ui/inputs";

/** Compact early-access email → full waitlist form (needs name/phone/consent). */
export function LandingEarlyAccess() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      <label className="min-w-0 flex-1">
        <span className="sr-only">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          autoComplete="email"
          className={`${inputClass} !rounded-full`}
        />
        {error ? (
          <p className="mt-1.5 text-xs font-medium text-ink">{error}</p>
        ) : (
          <p className="mt-1.5 text-[11px] text-faint">
            Continues to the waitlist — we&apos;ll ask for your name and phone next.
          </p>
        )}
      </label>
      <PrimaryButton type="submit" size="lg" className="shrink-0 sm:w-auto">
        Join waitlist
      </PrimaryButton>
    </form>
  );
}
