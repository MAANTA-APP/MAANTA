import type { Metadata } from "next";
import { formatKes } from "@/lib/ui";
import { FACTS } from "@/lib/marketing/facts";
import { ENTITY, ENTITY_LINE } from "@/lib/marketing/demo";
import { CtaBand, Section, SectionHeading } from "@/components/marketing/sections";
import { TrackedLink } from "@/components/marketing/tracked";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { DEMO_FEED_HREF, PILOT_STATUS_SENTENCE, pilotBookingAction } from "@/lib/marketing/pilot-status";

/**
 * `/about` — product-centred, set in prose (founder direction 2026-09-05).
 *
 * The founder biography that used to sit at `#team` — birthplace, family
 * migration, education, nationality, ethnicity and a personal claim to
 * Eastleigh — is removed and not replaced with a larger one. What earns trust
 * here is the product's own logic and an honest statement of where it stands:
 * built, not launched, first pilot being prepared for Nairobi, location and
 * date unconfirmed.
 *
 * No measured figures, no traction, no partner, no mall. The "does not do"
 * list is retained and tightened; every item is a decision, not a gap.
 */
export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: "About — MAANTA",
  description:
    "MAANTA makes shop offers visible before a shopper walks past them and measurable when a deal is redeemed at the counter. Built, not yet launched; first Nairobi pilot being prepared.",
  ogTitle: "What MAANTA is, and what it refuses to be.",
  ogDescription: PILOT_STATUS_SENTENCE,
});

export default function AboutPage() {
  const fee = formatKes(FACTS.successFeeKes);
  const booking = pilotBookingAction();

  return (
    <>
      <Section id="what">
        <h1 className="max-w-3xl text-3xl font-black leading-tight text-ink sm:text-4xl">About MAANTA</h1>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary sm:text-lg">
          <p className="text-ink">
            MAANTA makes shop offers visible before a shopper walks past them and measurable when
            a deal is redeemed at the counter.
          </p>
        </div>
      </Section>

      <Section id="began" tone="paper">
        <SectionHeading>How the idea began</SectionHeading>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            MAANTA began with a simple observation: in a busy Nairobi shopping centre, a useful
            offer can be one floor away and still remain invisible. Shops already know how to
            sell. Shoppers already want value. The missing layer is a reliable way to make offers
            visible and confirm that an offer brought someone to the counter.
          </p>
          <p>
            MAANTA was designed around that gap. A shop publishes a time-limited deal. A shopper
            claims it and receives a one-time code. Shop staff verify the code in person. That
            verified redemption — not an impression, click or review — is the signal MAANTA
            records.
          </p>
        </div>
      </Section>

      <Section id="building">
        <SectionHeading>What MAANTA is building</SectionHeading>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            One shared feed for participating shops, one simple verification step at the counter
            and one evidence trail showing which offers produced real visits.
          </p>
          <p>
            Shops pay {fee} for each verified redemption and nothing otherwise. Shoppers pay MAANTA
            nothing, and a pilot is not billed to the mall.
          </p>
          <p className="text-ink">
            The first controlled pilot is being prepared for Nairobi. Its location and launch date
            have not been confirmed.
          </p>
        </div>
      </Section>

      {/*
        Five short statements, strong vertical rhythm, deliberately no icons —
        icons would make an austere list look decorative, and the austerity is
        the argument.
      */}
      <Section id="not" tone="paper">
        <SectionHeading lead="It is quicker to describe MAANTA by what it refuses to be.">
          What MAANTA does not do
        </SectionHeading>
        <ul className="mt-10 max-w-2xl space-y-6">
          {[
            {
              t: "MAANTA does not process the shopper's purchase.",
              b: "There is no checkout in MAANTA. The shopper pays the shop directly, using a payment method the shop accepts.",
            },
            { t: "MAANTA does not deliver goods.", b: "The shopper walks in. That is the point." },
            {
              t: "MAANTA does not use star ratings.",
              b: "A deal rises because people redeemed it, not because people rated it.",
            },
            {
              t: "MAANTA does not take a percentage of the sale.",
              b: `${fee} is ${fee} whether the basket is ${formatKes(200)} or ${formatKes(20_000)}.`,
            },
            {
              // Worded to match the Privacy Policy sentence exactly. Claims
              // register #2 — same sentence, both pages.
              t: "MAANTA does not sell shopper data.",
              b: "We do not sell personal data. We do not share it with advertisers or data brokers, and we do not share it with other malls.",
            },
          ].map((p) => (
            <li key={p.t}>
              <p className="text-base font-bold text-ink">{p.t}</p>
              <p className="mt-1 text-base leading-relaxed text-secondary">{p.b}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-2xl text-base leading-relaxed text-ink">
          Every one of those is a decision we intend to keep, not a feature we have not got to
          yet.
        </p>
      </Section>

      <CtaBand
        title="Help shape the first Nairobi pilot."
        body="Explore the demonstration feed, join the waitlist for one message when a location and date are confirmed, or talk to us about hosting a pilot."
        primary={{ label: "Explore demo deals", href: DEMO_FEED_HREF }}
        secondary={{ label: "Join the waitlist", href: "/waitlist" }}
        reassurance={
          <>
            <TrackedLink
              href={booking.href}
              name={booking.label}
              location="cta"
              external={booking.external}
              className="underline underline-offset-4 hover:text-white"
            >
              {booking.label}
            </TrackedLink>{" "}
            · {ENTITY.email} · {ENTITY_LINE}
          </>
        }
      />
    </>
  );
}
