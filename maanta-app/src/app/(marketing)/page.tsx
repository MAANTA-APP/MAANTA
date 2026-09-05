import type { Metadata } from "next";
import { formatKes } from "@/lib/ui";
import { FACTS } from "@/lib/marketing/facts";
import { JsonLd } from "@/components/marketing/JsonLd";
import { MARKETING_EVENTS } from "@/lib/marketing/analytics-events";
import { jsonLdDocument, organizationSchema, websiteSchema } from "@/lib/marketing/structured-data";
import { SectionInView, TrackedLink } from "@/components/marketing/tracked";
import { CtaBand, Section, SectionHeading } from "@/components/marketing/sections";
import {
  CodeExampleCard,
  Doors,
  Eyebrow,
  LoopSteps,
  NodeBlock,
  NodePill,
  StatusBlock,
} from "@/components/marketing/acquisition";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { SHOPPER_DOOR_BODY, SHOW_PRELAUNCH_STATUS_BLOCK, SITE_DESCRIPTION, SITE_TITLE } from "@/lib/marketing/live-claims";
import {
  DEMO_DISCLOSURE,
  DEMO_FEED_HREF,
  PILOT_STATUS_SENTENCE,
  POTENTIAL_LOCATION_BODY,
  POTENTIAL_LOCATION_EYEBROW,
  POTENTIAL_LOCATION_HEADING,
} from "@/lib/marketing/pilot-status";

/**
 * `/` — Home, repositioned around a Nairobi pilot whose location is not
 * confirmed (founder direction 2026-09-05). Same structure as design board 1:
 * three doors, the loop, the potential first location, the status block.
 *
 * **One amber action**: "Explore demo deals", into the real feed, which
 * carries its own disclosure banner and labels every card "Demo". "Join the
 * Nairobi waitlist" is the secondary, and the disclosure under both says what
 * the demo feed is.
 *
 * **Nothing invented.** No merchant logos, testimonials, signup counts,
 * savings, ratings, partnerships or traction. BBS Mall in Eastleigh is named
 * once, in the bounded potential-location block, and only as a candidate.
 * The staffing tiles say on their face that they are a model, not a headcount.
 */
export const metadata: Metadata = pageMetadata({
  path: "/",
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  ogTitle: "Find real offers from Nairobi shops before you make the trip.",
  ogDescription: PILOT_STATUS_SENTENCE,
});

export default function LandingPage() {
  const fee = formatKes(FACTS.successFeeKes);

  const doors = [
    {
      title: "Shoppers",
      body: (
        <>
          <span className="block font-bold text-ink">See what is worth walking to.</span>
          {SHOPPER_DOOR_BODY}
        </>
      ),
      label: "For shoppers",
      href: "/shoppers",
    },
    {
      title: "Shops",
      body: (
        <>
          <span className="block font-bold text-ink">Turn an offer into a verified visit.</span>
          Publish a deal from your phone and pay MAANTA only when a shopper&apos;s code is
          successfully verified at your counter — <strong className="font-bold text-ink">{fee}</strong>{" "}
          per verified redemption.
        </>
      ),
      label: "For shops",
      href: "/merchants",
    },
    {
      title: "Mall operators",
      body: (
        <>
          <span className="block font-bold text-ink">Test measurable tenant promotions.</span>
          Explore a proposed mall pilot that makes tenant offers visible and records verified
          redemptions without connecting to the mall&apos;s POS.
        </>
      ),
      label: "For mall operators",
      href: "/mall-operators",
    },
  ] as const;

  return (
    <>
      <JsonLd data={jsonLdDocument(organizationSchema(), websiteSchema())} />

      {/* Hero — the one amber button, and a code instead of a mockup. */}
      <section className="bg-stone">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14">
            <div>
              <NodePill />
              <h1 className="mt-5 max-w-4xl text-balance text-[34px] font-extrabold leading-[1.05] tracking-[-0.034em] text-ink sm:text-5xl lg:text-[56px]">
                Find real offers from Nairobi shops before you make the trip.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-secondary sm:text-lg">
                MAANTA brings time-limited shop deals into one feed. Claim a deal, receive a
                one-time code, and redeem it with the shop in person. We are preparing our first
                Nairobi pilot; no location or launch date has been confirmed.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                <TrackedLink
                  href={DEMO_FEED_HREF}
                  name="Explore demo deals"
                  location="hero"
                  className="inline-flex h-12 items-center justify-center rounded-pill bg-brand px-7 text-base font-semibold text-black shadow-card transition hover:brightness-95 active:brightness-90"
                >
                  Explore demo deals
                </TrackedLink>
                <TrackedLink
                  href="/waitlist"
                  name="Join the Nairobi waitlist"
                  location="hero"
                  className="inline-flex h-12 items-center justify-center rounded-pill border border-ink bg-white px-6 text-base font-semibold text-ink transition hover:bg-stone"
                >
                  Join the Nairobi waitlist
                </TrackedLink>
              </div>
              <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted">{DEMO_DISCLOSURE}</p>
            </div>
            <div>
              <CodeExampleCard />
            </div>
          </div>
        </div>
      </section>

      {/* The doors. Three equal cards — resist adding a fourth. */}
      <Section id="doors">
        <SectionInView name="doors">
          <Eyebrow>Which one are you?</Eyebrow>
          <SectionHeading lead="Same product, three different jobs. Pick the one that describes you.">
            Three doors into MAANTA.
          </SectionHeading>
          <Doors doors={doors} event={MARKETING_EVENTS.audienceDoor} />
        </SectionInView>
      </Section>

      <Section id="loop" tone="paper">
        <Eyebrow>How it works</Eyebrow>
        <SectionHeading>Four steps, and the last one happens at the counter.</SectionHeading>
        <LoopSteps
          steps={[
            { title: "Find a deal", body: "Open the feed in your phone browser. Nothing to install." },
            {
              title: "Claim it",
              body: `You get a ${FACTS.codeLength}-digit one-time code, held for you with a short grace window.`,
            },
            {
              title: "Visit the shop",
              body: "Read the code to the person at the counter. They type it in.",
            },
            {
              title: "Redeem at the counter",
              body: "The shop verifies your one-time code. You pay the shop directly using a payment method the shop accepts. MAANTA does not process the purchase.",
            },
          ]}
        />
        <p className="mt-6 text-sm text-secondary">
          <TrackedLink
            href="/shoppers#how-it-works"
            name="How it works"
            location="loop"
            className="font-bold text-ink underline underline-offset-4 hover:text-secondary"
          >
            The shopper walkthrough, step by step →
          </TrackedLink>
        </p>
      </Section>

      <Section id="node">
        <SectionInView name="node">
          <Eyebrow>{POTENTIAL_LOCATION_EYEBROW}</Eyebrow>
          <SectionHeading>{POTENTIAL_LOCATION_HEADING}</SectionHeading>
          <NodeBlock staffing linkLabel="About the potential first location" lead={POTENTIAL_LOCATION_BODY} />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <TrackedLink
              href="/waitlist"
              name="Choose your preferred location"
              location="node"
              className="inline-flex h-12 items-center justify-center rounded-pill border border-ink bg-white px-6 text-base font-semibold text-ink transition hover:bg-stone"
            >
              Choose your preferred location
            </TrackedLink>
            <TrackedLink
              href={DEMO_FEED_HREF}
              name="Explore demo deals"
              location="node"
              className="text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
            >
              Explore demo deals →
            </TrackedLink>
          </div>
        </SectionInView>
      </Section>

      {SHOW_PRELAUNCH_STATUS_BLOCK ? (
        <Section id="status" tone="ink">
          <SectionInView name="status">
            <StatusBlock />
          </SectionInView>
        </Section>
      ) : null}

      <CtaBand
        title="Be there when Nairobi's first MAANTA shops switch on."
        body="One message when a confirmed pilot location and opening date are ready. No spam, and every message has an unsubscribe link."
        primary={{ label: "Join the Nairobi waitlist", href: "/waitlist" }}
        secondary={{ label: "Explore demo deals", href: DEMO_FEED_HREF }}
      />
    </>
  );
}
