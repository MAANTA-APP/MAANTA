import type { Metadata } from "next";
import { ENTITY } from "@/lib/marketing/demo";
import { RESPONSE_TIMES } from "@/lib/marketing/facts";
import { FOOTER_PILOT_LINE_1, FOOTER_PILOT_LINE_2, PILOT_EYEBROW, PILOT_STATUS_SENTENCE } from "@/lib/marketing/pilot-status";
import { EnquiryRouter } from "@/components/marketing/EnquiryRouter";
import { Section, SectionHeading } from "@/components/marketing/sections";
import { pageMetadata } from "@/lib/marketing/page-metadata";

/**
 * `/contact` — channels first, form second.
 *
 * That order is a deliberate inversion of the usual layout and the right call for
 * this market (`copy/contact.md` §0): a shop owner in Eastleigh will WhatsApp
 * before they fill in a form, and will walk to a desk before either. Most contact
 * pages bury the human channels under a form and lose the people who would
 * actually have got in touch.
 *
 * **Response times are published as of 2026-07-31**, by founder ruling, and read
 * from `RESPONSE_TIMES` in `facts.ts` so the page and the autoresponder cannot
 * drift apart. They are deliberately conservative — the deck is blunt that "a
 * missed commitment here does more damage than no commitment at all", so these
 * should be tightened only against evidence, never loosened after the fact.
 *
 * WhatsApp hours and the desk location are still omitted: those tokens are
 * unfilled and a stated opening hour that is not staffed is the same failure as
 * a missed response time.
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
    "Talk to MAANTA. WhatsApp support for shoppers and merchants, and direct contacts for mall operators, press and privacy requests. Nairobi pilot, location to be confirmed.",
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
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
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
              <h3 className="text-base font-bold text-ink">In person</h3>
              <p className="mt-1 text-sm font-semibold text-ink">{PILOT_EYEBROW}</p>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                There is no in-mall desk yet. {PILOT_STATUS_SENTENCE} If you run a shop, the
                merchant waitlist is the way to be first to hear.
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
            A person reads every message that arrives here — there is no ticket queue. You
            will get a confirmation by email as soon as your message lands, so you know it
            reached us.
          </p>
          <dl className="mt-6 divide-y divide-line border-y border-line">
            {[
              ["WhatsApp", `We reply ${RESPONSE_TIMES.whatsapp}`],
              ["This form and email", `We reply within ${RESPONSE_TIMES.form}`],
              ["Mall operator enquiries", `We reply within ${RESPONSE_TIMES.operator}`],
              [
                "Privacy and data requests",
                "Acknowledged within 1 business day, answered within the period required by the Kenya Data Protection Act 2019",
              ],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-6">
                <dt className="text-sm font-bold text-ink sm:w-56 sm:shrink-0">{label}</dt>
                <dd className="text-sm leading-relaxed text-secondary">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-base leading-relaxed text-ink">
            If we are going to be slower than this, we will tell you rather than leave you
            waiting.
          </p>
        </div>
      </Section>

      <Section id="location">
        <SectionHeading>Where MAANTA is</SectionHeading>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            <strong className="font-semibold text-ink">{FOOTER_PILOT_LINE_1}.</strong>{" "}
            {FOOTER_PILOT_LINE_2}. MAANTA has no office or in-mall desk today; WhatsApp and
            email are the ways to reach a person.
          </p>
        </div>
        <address className="mt-8 not-italic text-sm leading-relaxed text-ink">
          <strong className="font-bold">{ENTITY.name}</strong>
          <br />
          {ENTITY.city}, {ENTITY.country}
        </address>
      </Section>
    </>
  );
}
