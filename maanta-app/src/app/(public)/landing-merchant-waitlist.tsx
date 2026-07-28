"use client";

import Link from "next/link";
import { SecondaryButtonLink } from "@/components/ui/claude";

/** Merchant / mall-operator early access — separate from shopper account signup. */
export function LandingMerchantWaitlist() {
  return (
    <div className="rounded-card border border-line bg-white p-5 shadow-card">
      <p className="text-sm font-semibold text-ink">Merchants &amp; mall operators</p>
      <p className="mt-1.5 text-sm text-muted">
        Not ready to sign up as a shopper? Join the waitlist for merchant onboarding or
        mall partnerships.
      </p>
      <SecondaryButtonLink href="/waitlist?segment=merchant" className="mt-4" full>
        Join merchant waitlist
      </SecondaryButtonLink>
      <p className="mt-3 text-center text-[11px] text-faint">
        Shoppers should{" "}
        <Link href="/sign-up" className="font-semibold text-ink underline">
          create an account
        </Link>{" "}
        to claim deals.
      </p>
    </div>
  );
}
