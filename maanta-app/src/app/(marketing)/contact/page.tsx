import type { Metadata } from "next";
import { Suspense } from "react";
import { ENTITY } from "@/lib/marketing/demo";
import { FACTS } from "@/lib/marketing/facts";
import { EnquiryRouter } from "@/components/marketing/EnquiryRouter";
import { Section, SectionHeading } from "@/components/marketing/sections";

/**
 * `/contact` — channels first, form second.
 *
 * That order is a deliberate inversion of the usual layout and the right call for
 * this market (`copy/contact.md` §0): a shop owner in Eastleigh will WhatsApp
 * before they fill in a form, and will walk to a desk before either. Most contact
 * pages bury the human channels under a form and lose the people who would
 * actually have got in touch.
 *
 * **No response times are published.** The deck's `#response` section is built
 * entirely from tokens — `{{WHATSAPP_RESPONSE}}`, `{{EMAIL_RESPONSE}}`,
 * `{{OPERATOR_RESPONSE}}`, `{{PRIVACY_ACK}}` — and every one is unfilled. The
 * deck's own instruction is "publish only what you can actually meet: a missed
 * commitment here does more damage than no commitment at all", and
 * `website-handoff.md` §9 holds every stated response time. So the section states
 * what is true — that a person reads every message and WhatsApp is fastest — and
 * commits to no window. Hours and desk location are omitted for the same reason.
 *
 * The form itself lives in `EnquiryRouter`, which is a client component because
 * it reads `?topic=`. It is wrapped in `Suspense` so `useSearchParams` does not
 * opt the whole route out of static rendering.
 */

export const metadata: Metadata = {
  title: "Contact — MAANTA",
  description:
    "Talk to MAANTA. WhatsApp support for shoppers and merchants, a desk at BBS Mall, Eastleigh, and direct contacts for mall operators, press and privacy requests.",
};

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
            <div className="rounded-card border border-line bg-white p-5">
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

            <div className="rounded-card border border-line bg-white p-5">
              <h3 className="text-base font-bold text-ink">The desk at BBS Mall</h3>
              <p className="mt-1 text-sm font-semibold text-ink">
                {ENTITY.address}, {ENTITY.city}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                If you run a shop in the mall and would rather do this in person, come and
                find us. We will set you up at your counter.
              </p>
            </div>

            <div className="rounded-card border border-line bg-white p-5">
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
        <Suspense
          fallback={
            <div className="h-96 animate-pulse rounded-card border border-line bg-paper" />
          }
        >
          <EnquiryRouter />
        </Suspense>
      </Section>

      <Section id="response" tone="paper">
        <SectionHeading>What happens next</SectionHeading>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            A person reads every message that arrives here — there is no ticket queue. You
            will get a confirmation by email as soon as your message lands, so you know it
            reached us.
          </p>
          <p>
            WhatsApp is the fastest route during the day. Privacy and data requests are
            answered within the period required by the Kenya Data Protection Act 2019.
          </p>
          <p className="text-ink">
            We are not publishing a response-time commitment until we are certain we can meet
            it. If we are going to be slow, we would rather tell you than promise a window
            and miss it.
          </p>
        </div>
      </Section>

      <Section id="location">
        <SectionHeading>Where to find us</SectionHeading>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            MAANTA operates at{" "}
            <strong className="font-semibold text-ink">
              {FACTS.launchMall}, {FACTS.city}
            </strong>
            . That is where the shops are, where our activation team works, and where the
            desk is.
          </p>
          <p>There is no other office worth sending you to.</p>
        </div>
        <address className="mt-8 not-italic text-sm leading-relaxed text-ink">
          <strong className="font-bold">{ENTITY.name}</strong>
          <br />
          {ENTITY.address}
          <br />
          {ENTITY.city}, {ENTITY.country}
        </address>
      </Section>
    </>
  );
}
