import type { Metadata } from "next";
import { isWaitlistSegment, type WaitlistSegment } from "@/lib/waitlist";
import { WaitlistForm } from "./waitlist-form";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { isWaitlistTestToken } from "@/lib/growth/waitlist-test-token";

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
 * ## The internal TEST entry point
 *
 * `/waitlist?test=<token>` files a signup the admin Growth console segregates
 * out of every real count. The token is checked HERE, on the server, against
 * `WAITLIST_TEST_TOKEN`, and again in `POST /api/waitlist` — the API never
 * trusts a flag from the body, so a tester with the token gets a test row and
 * everybody else gets a real one no matter what they send.
 *
 * The badge is not decoration. A tester filling this form has to be able to see,
 * before they submit, which population they are about to land in; an invisible
 * mode is how a real signup gets filed as a test and disappears from the count.
 *
 * **This page deliberately does not vary its metadata on the param.** Doing so
 * would force `generateMetadata` and make the route dynamic, which the
 * `check-forms` build gate reads as a prerendered route that stopped shipping a
 * server-rendered form. The existing canonical already points every variant at
 * `/waitlist`, which is the standard instruction for a query-param duplicate,
 * and the test URL is handed to a person rather than linked from anywhere.
 */
export default function WaitlistPage({
  searchParams,
}: {
  searchParams?: { segment?: string; email?: string; test?: string };
}) {
  const initialSegment: WaitlistSegment = isWaitlistSegment(searchParams?.segment)
    ? searchParams.segment
    : "shopper";
  const initialEmail =
    typeof searchParams?.email === "string" ? searchParams.email : "";
  const testToken = typeof searchParams?.test === "string" ? searchParams.test : "";
  const isTestEntry = isWaitlistTestToken(testToken);

  return (
    <div className="mx-auto max-w-xl px-5 py-14">
      {isTestEntry ? (
        <div className="mb-6 flex items-center gap-3 rounded-card border-[1.5px] border-rust bg-white px-4 py-3">
          <span
            aria-hidden
            className="block h-2 w-2 shrink-0 rounded-[2px] bg-rust"
          />
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-rust">
              Internal test signup
            </p>
            <p className="mt-1 text-sm leading-snug text-ink">
              This submission will be tagged TEST and held out of every real
              count. Remove the link&apos;s <code className="font-mono">test</code>{" "}
              parameter to file a genuine signup.
            </p>
          </div>
        </div>
      ) : null}
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
      <WaitlistForm
        initialSegment={initialSegment}
        initialEmail={initialEmail}
        testToken={isTestEntry ? testToken : ""}
      />
    </div>
  );
}
