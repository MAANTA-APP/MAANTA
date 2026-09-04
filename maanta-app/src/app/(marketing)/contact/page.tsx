import type { Metadata } from "next";
import { ENTITY } from "@/lib/marketing/demo";
import { NO_DESK_NOTICE, SUPPORT_REPLY_LINE } from "@/lib/marketing/live-claims";
import { EnquiryRouter } from "@/components/marketing/EnquiryRouter";
import { Section, SectionHeading } from "@/components/marketing/sections";
import { pageMetadata } from "@/lib/marketing/page-metadata";

/**
 * `/contact` — channels first, form second.
 *
 * That order is a deliberate inversion of the usual layout and the right call for
 * this market (`copy/contact.md` §0): a shop owner in Eastleigh will WhatsApp
 * before they fill in a form. Most contact pages bury the human channels under a
 * form and lose the people who would actually have got in touch.
 *
 * **There is no desk and no address on this page** (founder ruling 2026-09-04,
 * drift **D261**). Until then it listed "The desk at BBS Mall" as a contact
 * channel and closed with a postal address block at the mall. MAANTA has no
 * premises there and will not until BBS authorises the relationship; the only
 * permitted phrasing is intent, read from `NO_DESK_NOTICE` so it flips with the
 * rest of the pre-launch claims.
 *
 * **No response times.** The 2026-07-31 `RESPONSE_TIMES` ("the same day", "1
 * business day") were withdrawn by founder ruling 2026-09-04 (X9): no support
 * team exists, so no turnaround may be published. The deck's own line — "a
 * missed commitment here does more damage than no commitment at all" — is the
 * reason. `SUPPORT_REPLY_LINE` is what this page and `/help` say instead.
 *
 * WhatsApp hours are omitted for the same reason: a stated opening hour that is
 * not staffed is the same failure as a missed response time.
 *
 * The form itself lives in `EnquiryRouter`, a client component. It is **not**
 * wrapped in `Suspense`, and that is load-bearing (drift D41).
 *
 * It used to be. `EnquiryRouter` called `useSearchParams()` to read `?topic=`,
 * which opts its subtree out of static rendering, and the `Suspense` here was
 * meant to stop that spreading to the whole route. It did — by server-rendering
 * the fallback instead of the form. A grey pulsing rectangle shipped where the
 * form should be, immediately below this page's own promise that "This form and
 * email — We reply within 1 business day". Nobody could send anything.
 *
 * The parameter is now read in an effect, so the form markup is in the
 * prerendered HTML and a boundary is neither needed nor wanted here: adding one
 * back around a component that no longer suspends would reintroduce a fallback
 * with nothing to fall back from. Guarded by `scripts/check-server-forms.mjs`,
 * which reads built output rather than this file.
 */

export const metadata: Metadata = pageMetadata({
  path: "/contact",
  title: "Contact — MAANTA",
  description:
    "Talk to MAANTA. WhatsApp and email for shoppers and merchants, and direct contacts for mall operators, press and privacy requests.",
});

export default function ContactPage() {
  return (
    <>
      <Section>
        <h1 className="text-3xl font-black leading-tight text-ink sm:text-4xl">Talk to us</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary sm:text-lg">
          Pick what this is about and we will point you at the fastest route. Most things are
          quicker on WhatsApp than by form.
        </p>
      </Section>

      {/* Channels above the form — the routes people will actually use. */}
      <Section id="channels" tone="paper" className="!py-0">
        <div className="py-14 sm:py-16">
          <SectionHeading>Ways to reach us</SectionHeading>
          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <div className="rounded-card bg-white shadow-card p-5">
              <h3 className="text-base font-bold text-ink">WhatsApp</h3>
              <a
                href={ENTITY.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-sm font-semibold text-ink underline underline-offset-4"
              >
                {ENTITY.whatsapp}
              </a>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                The quickest route for anything to do with a deal, a code, or a shop account.
              </p>
            </div>

            <div className="rounded-card bg-white shadow-card p-5">
              <h3 className="text-base font-bold text-ink">Email</h3>
              <a
                href={`mailto:${ENTITY.email}`}
                className="mt-1 block text-sm font-semibold text-ink underline underline-offset-4"
              >
                {ENTITY.email}
              </a>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                For anything else.
              </p>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-secondary">{NO_DESK_NOTICE}</p>
        </div>
      </Section>

      <Section>
        {/*
          The form submits through a JavaScript handler, so it renders without
          JavaScript but cannot send. Saying so is the honest state — a form that
          silently does nothing is the same broken promise D41 was, one layer
          further down. The two channels named here are the ones that work with
          no JavaScript at all: a link and a mailto.
        */}
        <noscript>
          <div className="mb-8 rounded-card border border-line bg-paper p-5">
            <p className="text-sm font-bold text-ink">
              This form needs JavaScript to send.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              Message us on WhatsApp at{" "}
              <a
                href={ENTITY.whatsappLink}
                className="font-semibold text-ink underline underline-offset-4"
              >
                {ENTITY.whatsapp}
              </a>{" "}
              or email{" "}
              <a
                href={`mailto:${ENTITY.email}`}
                className="font-semibold text-ink underline underline-offset-4"
              >
                {ENTITY.email}
              </a>
              . Both reach the same people.
            </p>
          </div>
        </noscript>
        <EnquiryRouter />
      </Section>

      <Section id="response" tone="paper">
        <SectionHeading>What happens next</SectionHeading>
        <div className="mt-6 max-w-2xl">
          <p className="text-base leading-relaxed text-secondary">
            A person reads every message that arrives here — there is no ticket queue.
          </p>
          <p className="mt-4 text-base leading-relaxed text-ink">{SUPPORT_REPLY_LINE}</p>
          <p className="mt-4 text-base leading-relaxed text-secondary">
            Privacy and data requests are answered within the period the Kenya Data
            Protection Act 2019 requires.
          </p>
        </div>
      </Section>

    </>
  );
}
