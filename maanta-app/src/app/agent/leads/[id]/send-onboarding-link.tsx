"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconWhatsApp } from "@/components/ui/icons";

/**
 * Frame 13b primary action — "Send onboarding link". Rule R-AGENT-NO-SUBMIT.
 *
 * The agent never fills in the shop's form. They hand over a link; the merchant
 * authenticates and submits onboarding themselves, which is what keeps the
 * merchant the submitter of their own record (`/api/merchants/onboard`
 * authenticates the merchant and passes the agent through as attribution only).
 *
 * This deliberately adds no backend: it shares the existing `/merchant/onboard`
 * route. WhatsApp when the lead has a number, clipboard otherwise.
 */
export function SendOnboardingLink({
  shopName,
  phone,
}: {
  shopName: string;
  phone: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window === "undefined"
      ? "/merchant/onboard"
      : `${window.location.origin}/merchant/onboard`;

  const message =
    `Hi${shopName ? ` ${shopName}` : ""} — here's your Maanta onboarding link. ` +
    `You'll sign in with your own number and fill in the shop details: ${url}`;

  const digits = phone ? phone.replace(/\D/g, "") : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5">
      {digits ? (
        <a
          href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-semibold text-black transition motion-safe:active:scale-[0.98]"
        >
          <IconWhatsApp className="h-4 w-4" />
          Send onboarding link
        </a>
      ) : (
        <Button full onClick={copy}>
          Send onboarding link
        </Button>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs text-secondary">
          The shop signs in and submits their own details.
        </p>
        {digits ? (
          <button
            type="button"
            onClick={copy}
            className="shrink-0 text-xs font-semibold text-ink underline"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        ) : null}
      </div>
      {!digits && copied ? (
        <p className="mt-1 text-xs font-semibold text-ink">Link copied.</p>
      ) : null}
    </div>
  );
}
