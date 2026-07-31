import type { Metadata } from "next";
import { isWaitlistSegment, type WaitlistSegment } from "@/lib/waitlist";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "Join the MAANTA waitlist",
  description:
    "MAANTA is launching at BBS Mall, Eastleigh — real in-mall deals, claimed on your phone and redeemed in person. Join the waitlist as a shopper, merchant, or mall operator.",
};

/**
 * Public pre-launch waitlist. Other pages can preset the segment via
 * /waitlist?segment=merchant (or mall_operator) so their CTAs stay
 * segment-specific per docs/maanta-waitlist-data-schema.md.
 */
export default function WaitlistPage({
  searchParams,
}: {
  searchParams?: { segment?: string; email?: string };
}) {
  const initialSegment: WaitlistSegment = isWaitlistSegment(searchParams?.segment)
    ? searchParams.segment
    : "shopper";
  const initialEmail =
    typeof searchParams?.email === "string" ? searchParams.email : "";

  return (
    <div className="mx-auto max-w-xl px-5 py-14">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        Launching at BBS Mall, Eastleigh
      </p>
      <h1 className="mt-2 text-3xl font-black text-ink">Be first in line</h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        MAANTA brings real, verified deals from shops inside the mall to your
        phone. Claim a deal in the app, walk in, and redeem it at the counter
        with a one-time code. Join the waitlist and we&apos;ll let you in on
        day one.
      </p>
      <WaitlistForm initialSegment={initialSegment} initialEmail={initialEmail} />
    </div>
  );
}
