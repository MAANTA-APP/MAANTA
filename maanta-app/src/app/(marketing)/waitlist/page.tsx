import type { Metadata } from "next";
import { isWaitlistSegment, type WaitlistSegment } from "@/lib/waitlist";
import { WaitlistForm } from "./waitlist-form";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { ENTITY } from "@/lib/marketing/demo";
import { CLOSED_FORM_COPY, isFormCollecting } from "@/lib/marketing/forms";

export const metadata: Metadata = pageMetadata({
  path: "/waitlist",
  title: "Join the MAANTA waitlist",
  // Trimmed from 170 characters to fit the snippet window without truncating.
  // "launching at" is kept: it is future tense and so is not one of the D87
  // trading claims, and it is the only place the launch mall appears in this
  // page's snippet.
  description:
    "MAANTA is launching at BBS Mall, Eastleigh — in-mall deals claimed on your phone and redeemed in person. Join the waitlist as a shopper or a merchant.",
});

/**
 * Public pre-launch waitlist. Other pages can preset the segment via
 * /waitlist?segment=merchant (or mall_operator) so their CTAs stay
 * segment-specific per docs/maanta-waitlist-data-schema.md.
 *
 * **Non-collecting while `FORM_STATUS.waitlist` is `closed`**
 * (`lib/marketing/forms.ts`, founder ruling 2026-09-04, form safety / FC1).
 * The data path is traced — Resend audience, consent persisted — but legal
 * review has not cleared it to collect, so the page renders the ruling's
 * closed block (no inputs, no count, the real reason, a working alternative)
 * and `/api/waitlist` refuses in step. The route stays; only the form goes.
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
        MAANTA brings verified deals from shops inside the mall to your phone. Claim a
        deal in the app, walk in, and redeem it at the counter with a one-time code.
        {isFormCollecting("waitlist")
          ? " Join the waitlist and we'll let you in on day one."
          : null}
      </p>
      {isFormCollecting("waitlist") ? (
        <WaitlistForm initialSegment={initialSegment} initialEmail={initialEmail} />
      ) : (
        <div className="mt-8 rounded-card border border-line bg-paper p-6">
          <h2 className="text-xl font-black text-ink">{CLOSED_FORM_COPY.waitlist.heading}</h2>
          <p className="mt-3 text-base leading-relaxed text-secondary">
            {CLOSED_FORM_COPY.waitlist.body}
          </p>
          <p className="mt-3 text-base leading-relaxed text-ink">
            MAANTA opens first at BBS Mall, Eastleigh. Until the waitlist reopens, email{" "}
            <a
              className="font-semibold underline underline-offset-4"
              href={`mailto:${ENTITY.email}`}
            >
              {ENTITY.email}
            </a>{" "}
            and we will let you know when we are live.
          </p>
        </div>
      )}
    </div>
  );
}
