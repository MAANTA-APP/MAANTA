import type { Metadata } from "next";
import { formatKes } from "@/lib/ui";
import { FACTS, NODE_TEAM } from "@/lib/marketing/facts";
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
import {
  NODE_PRESENCE_LEAD,
  NODE_SHOPS_SENTENCE,
  SEE_NODE_LINK_LABEL,
  SHOPPER_DOOR_BODY,
  SHOW_PRELAUNCH_STATUS_BLOCK,
} from "@/lib/marketing/live-claims";

/**
 * `/` — Home, as design board 1 draws it (founder ruling 2026-09-05: as drawn).
 *
 * Three doors, the loop, the pilot, the status block. Home routes; it does not
 * persuade. `#doors` is the load-bearing section and everything below it is
 * reinforcement.
 *
 * **One action.** Every acquisition page has exactly one primary action — join
 * the waitlist — repeated in the header, the hero and the closing band.
 * Repetition of one action, never two competing ones; everything else is a
 * text link.
 *
 * **Nothing invented.** No merchant logos, testimonials, signup counts,
 * savings, ratings, partnerships or traction. Where a SaaS page would put a
 * logo wall, this one puts `StatusBlock` — the honest version. Node 0 is named
 * as the pilot location and the deployment reference, never as evidence of
 * adoption; the staffing tiles say on their face that they are a model, not a
 * headcount.
 *
 * The hero mockup of the feed (`HeroShot`, 2026-08-01) and the inline
 * early-access form are retired by the same ruling: the hero shows the one
 * thing a shopper actually carries to the counter — a code — and the closing
 * band sends people to the real waitlist funnel instead of a second capture.
 */
export const metadata: Metadata = pageMetadata({
  path: "/",
  title: "MAANTA — The mall, made live.",
  description: `Mall deals you claim on your phone and redeem at the counter. ${NODE_PRESENCE_LEAD} ${FACTS.launchMall}. Join the waitlist and we will message you when the shops there start publishing deals.`,
  ogTitle: "Mall deals you claim on your phone and redeem at the counter.",
  ogDescription: `${NODE_PRESENCE_LEAD} ${FACTS.launchMall}. Join the waitlist for launch.`,
});

export default function LandingPage() {
  const fee = formatKes(FACTS.successFeeKes);

  const doors = [
    { title: "Shoppers", body: SHOPPER_DOOR_BODY, label: "For shoppers", href: "/shoppers" },
    {
      title: "Shops",
      body: (
        <>
          Publish a deal from a phone. You pay <strong className="font-bold text-ink">{fee}</strong>{" "}
          per verified redemption — nothing for a deal nobody uses.
        </>
      ),
      label: "For shops",
      href: "/merchants",
    },
    {
      title: "Mall operators",
      body: `A node is run on your floor: ${NODE_TEAM.managers === 1 ? "one node manager" : `${NODE_TEAM.managers} node managers`} and up to ${NODE_TEAM.agentsMax} agents, onboarding tenants unit by unit.`,
      label: "For operators",
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
                Mall deals you claim on your phone and redeem at the counter.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-secondary sm:text-lg">
                {NODE_PRESENCE_LEAD} {FACTS.launchMall}. Join the waitlist and we&apos;ll message
                you when the shops there start publishing deals.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                <TrackedLink
                  href="/waitlist"
                  name="Join the waitlist"
                  location="hero"
                  className="inline-flex h-12 items-center justify-center rounded-pill bg-brand px-7 text-base font-semibold text-black shadow-card transition hover:brightness-95 active:brightness-90"
                >
                  Join the waitlist
                </TrackedLink>
                <TrackedLink
                  href="/shoppers#how-it-works"
                  name="How it works"
                  location="hero"
                  className="text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
                >
                  See how it works →
                </TrackedLink>
              </div>
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
        <Eyebrow>The loop</Eyebrow>
        <SectionHeading>Four steps, and the last one happens at the till.</SectionHeading>
        <LoopSteps
          steps={[
            { title: "Find a deal", body: "Open the feed in your phone browser. Nothing to install." },
            {
              title: "Claim it",
              body: `You get a ${FACTS.codeLength}-digit code, held for you with a short grace window.`,
            },
            {
              title: "Walk to the shop",
              body: "Read the code to the person at the counter. They type it in.",
            },
            {
              title: "Pay in person",
              body: "You pay the deal price the way you normally pay. MAANTA never takes your money.",
            },
          ]}
        />
      </Section>

      <Section id="node">
        <SectionInView name="node">
          <Eyebrow>Where it opens</Eyebrow>
          <SectionHeading>
            {NODE_PRESENCE_LEAD} {FACTS.launchMall}.
          </SectionHeading>
          <NodeBlock
            staffing
            linkLabel={SEE_NODE_LINK_LABEL}
            lead={
              <>
                {NODE_SHOPS_SENTENCE} We call it {FACTS.nodeLabel} — the pilot location, and the
                reference for how every later node gets deployed.
              </>
            }
          />
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
        title="Be there when Eastleigh's shops switch on."
        body={`One message when ${FACTS.nodeLabel} opens. No spam, and every message has an unsubscribe link.`}
        primary={{ label: "Join the waitlist", href: "/waitlist" }}
      />
    </>
  );
}
