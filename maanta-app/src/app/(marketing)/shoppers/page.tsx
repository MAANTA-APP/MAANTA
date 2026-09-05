import type { Metadata } from "next";
import { FACTS } from "@/lib/marketing/facts";
import { CtaBand, FaqAccordion, Section, SectionHeading } from "@/components/marketing/sections";
import { SectionInView, TrackedLink } from "@/components/marketing/tracked";
import { StickyWaitlistBar } from "@/components/marketing/StickyWaitlistBar";
import {
  CodeTiles,
  DealCardExample,
  Eyebrow,
  LoopSteps,
  NodeBlock,
} from "@/components/marketing/acquisition";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import {
  NODE_CTA_TITLE,
  NODE_PRESENCE_LEAD,
  NODE_SHOPS_SENTENCE,
  SEE_NODE_LINK_LABEL,
} from "@/lib/marketing/live-claims";

/**
 * `/shoppers` — the shopper landing, as design board 1 draws it (founder
 * ruling 2026-09-05: as drawn). Still the 308 target for `/for-shoppers` and
 * `/how-it-works`: how-it-works lives here at `#how-it-works`, deep-linkable,
 * one canonical explanation and no new route.
 *
 * Four things, in the order a shopper asks them: what is this, how does it
 * work, what does a deal look like, what does it cost. The illustrated
 * walkthrough rail (2026-08-16) is retired by the same ruling — the code tiles
 * under "Claim the deal" and the example card are the two pictures this page
 * needs, and both say on their face that they are examples.
 *
 * One amber action: the hero's button. The mobile sticky bar shows the same
 * action only after the hero has scrolled out, so the accent is never on screen
 * twice. No deal or shop counts anywhere on this page, by rule.
 */
export const metadata: Metadata = pageMetadata({
  path: "/shoppers",
  title: "For shoppers — MAANTA",
  description: `Know what's on offer before you walk the floor. Tap a deal, get a ${FACTS.codeLength}-digit code, show it at the counter and pay the shop in person. Free, no card, nothing to download.`,
  ogTitle: "Know what's on offer before you walk the floor.",
  ogDescription: `Tap a deal, get a ${FACTS.codeLength}-digit code, show it at the counter, pay the shop in person.`,
});

const WAITLIST_HREF = "/waitlist?role=shopper";

export default function ShoppersPage() {
  return (
    <>
      <section className="bg-stone">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
            <div>
              <Eyebrow>For shoppers</Eyebrow>
              <h1 className="mt-3 max-w-3xl text-balance text-[34px] font-extrabold leading-[1.05] tracking-[-0.034em] text-ink sm:text-5xl lg:text-[52px]">
                Know what&apos;s on offer before you walk the floor.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-secondary sm:text-lg">
                Tap a deal, get a {FACTS.codeLength}-digit code, show it at the counter. You pay
                the deal price in person, the way you normally pay.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {["Free for shoppers", "No card", "Nothing to download", "Works on a slow connection"].map(
                  (chip) => (
                    <li
                      key={chip}
                      className="rounded-pill border border-line bg-white px-3 py-1.5 text-[13px] font-semibold text-secondary"
                    >
                      {chip}
                    </li>
                  )
                )}
              </ul>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                <TrackedLink
                  href={WAITLIST_HREF}
                  name="Join the shopper waitlist"
                  location="hero"
                  className="inline-flex h-12 items-center justify-center rounded-pill bg-brand px-7 text-base font-semibold text-black shadow-card transition hover:brightness-95 active:brightness-90"
                >
                  Join the shopper waitlist
                </TrackedLink>
                <a
                  href="#how-it-works"
                  className="text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
                >
                  How it works →
                </a>
              </div>
            </div>
            <div className="hidden lg:block">
              <DealCardExample />
            </div>
          </div>
        </div>
        {/* The sticky bar watches this: once it has scrolled off the top, the
            hero's amber button is gone and the bar may show its own. */}
        <div id="hero-end" aria-hidden="true" />
      </section>
      <StickyWaitlistBar sentinelId="hero-end" href={WAITLIST_HREF} label="Join the shopper waitlist" />

      <Section id="how-it-works">
        <SectionInView name="how-it-works">
          <Eyebrow>How it works</Eyebrow>
          <SectionHeading>Your phone finds it. The counter confirms it.</SectionHeading>
          <LoopSteps
            steps={[
              {
                title: "Open the feed",
                body: "In your phone browser. Filter by floor, by category, or by what is ending soon.",
              },
              {
                title: "Claim the deal",
                body: "One tap. The deal is held for you with a short grace window, so you have time to get there.",
                after: (
                  <div>
                    <CodeTiles />
                    <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Your code · example
                    </p>
                  </div>
                ),
              },
              {
                title: "Read it out at the counter",
                body: `Staff type the ${FACTS.codeLength} digits into their own screen. It either verifies or it doesn't — no arguing, no screenshots.`,
              },
              {
                title: "Pay the shop directly",
                body: "Cash, M-Pesa, card — however that shop takes money. MAANTA never handles your payment.",
              },
            ]}
          />
        </SectionInView>
      </Section>

      <Section id="deal" tone="paper">
        <Eyebrow>What a deal looks like</Eyebrow>
        <SectionHeading>Priced, timed, and tied to a unit.</SectionHeading>
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
          <DealCardExample />
          <p className="max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
            An illustration of the format. Real deals, prices and shops appear when{" "}
            {FACTS.nodeLabel} opens.
          </p>
        </div>
      </Section>

      <Section id="where">
        <Eyebrow>Where it opens</Eyebrow>
        <SectionHeading>
          {NODE_PRESENCE_LEAD} {FACTS.launchMall}.
        </SectionHeading>
        <NodeBlock lead={NODE_SHOPS_SENTENCE} linkLabel={SEE_NODE_LINK_LABEL} />
      </Section>

      <Section id="faq" tone="paper">
        <Eyebrow>Questions</Eyebrow>
        <SectionHeading>The four we get most.</SectionHeading>
        <FaqAccordion
          page="shoppers"
          items={[
            {
              q: "Does it cost anything?",
              a: "No. Shoppers pay nothing to MAANTA, ever. Shops pay us when a deal is actually redeemed.",
            },
            {
              q: "Do I need to install an app?",
              a: "No. It runs in your phone browser. You can add it to your home screen if you want it faster.",
            },
            {
              q: "Do you take my card details?",
              a: "Never. You pay the shop in person. We only need a phone number, so a code can be tied to one person and used once.",
            },
            {
              q: "When does it open?",
              a: `We are preparing ${FACTS.nodeLabel} at ${FACTS.launchMall}. We have not announced a date, and we would rather tell you when it is certain than guess now.`,
            },
          ]}
        />
      </Section>

      <CtaBand
        title={NODE_CTA_TITLE}
        body={`Join the shopper waitlist and we'll message you the day ${FACTS.nodeLabel} opens.`}
        primary={{ label: "Join the shopper waitlist", href: WAITLIST_HREF }}
      />
    </>
  );
}
