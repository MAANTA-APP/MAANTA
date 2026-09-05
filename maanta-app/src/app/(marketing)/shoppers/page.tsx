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
import { NODE_CTA_TITLE } from "@/lib/marketing/live-claims";
import {
  DEMO_DISCLOSURE_SHOPPER,
  DEMO_FEED_HREF,
  PILOT_STATUS_SENTENCE,
  SHOPPER_WHERE_BODY,
  SHOPPER_WHERE_HEADING,
} from "@/lib/marketing/pilot-status";

/**
 * `/shoppers` — the shopper landing, repositioned for the Nairobi pilot
 * (founder direction 2026-09-05). Still the 308 target for `/for-shoppers`
 * and `/how-it-works`: how-it-works lives here at `#how-it-works`.
 *
 * One amber action: "Explore demo deals". The mobile sticky bar repeats that
 * same action only after the hero has scrolled out, so the accent is never on
 * screen twice. "Join the shopper waitlist" is the secondary. No deal or shop
 * counts anywhere on this page, by rule, and the FAQ says what sign-in
 * actually needs: an account, email first, no card.
 */
export const metadata: Metadata = pageMetadata({
  path: "/shoppers",
  title: "For shoppers in Nairobi — MAANTA",
  description: `Explore deals from nearby shops, claim one on your phone with a ${FACTS.codeLength}-digit one-time code, and redeem it at the counter. The public pilot is not open yet; explore demonstration deals now.`,
  ogTitle: "See what is worth walking to.",
  ogDescription: `Claim a deal on your phone, get a ${FACTS.codeLength}-digit code, redeem it at the counter. Nairobi pilot, location to be confirmed.`,
});

const WAITLIST_HREF = "/waitlist?role=shopper";

export default function ShoppersPage() {
  return (
    <>
      <section className="bg-stone">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
            <div>
              <Eyebrow>For shoppers in Nairobi</Eyebrow>
              <h1 className="mt-3 max-w-3xl text-balance text-[34px] font-extrabold leading-[1.05] tracking-[-0.034em] text-ink sm:text-5xl lg:text-[52px]">
                See what is worth walking to.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-secondary sm:text-lg">
                Explore deals from nearby shops, claim one on your phone and redeem it at the
                counter. The public pilot is not open yet, but you can explore demonstration
                deals now.
              </p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {["Free for shoppers", "No card details", "Nothing to download", "Works on a slow connection"].map(
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
                  href={DEMO_FEED_HREF}
                  name="Explore demo deals"
                  location="hero"
                  className="inline-flex h-12 items-center justify-center rounded-pill bg-brand px-7 text-base font-semibold text-black shadow-card transition hover:brightness-95 active:brightness-90"
                >
                  Explore demo deals
                </TrackedLink>
                <TrackedLink
                  href={WAITLIST_HREF}
                  name="Join the shopper waitlist"
                  location="hero"
                  className="inline-flex h-12 items-center justify-center rounded-pill border border-ink bg-white px-6 text-base font-semibold text-ink transition hover:bg-stone"
                >
                  Join the shopper waitlist
                </TrackedLink>
              </div>
              <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted">{DEMO_DISCLOSURE_SHOPPER}</p>
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
      <StickyWaitlistBar sentinelId="hero-end" href={DEMO_FEED_HREF} label="Explore demo deals" />

      <Section id="how-it-works">
        <SectionInView name="how-it-works">
          <Eyebrow>How it works</Eyebrow>
          <SectionHeading>Your phone finds it. The counter confirms it.</SectionHeading>
          <LoopSteps
            steps={[
              {
                title: "Find a deal",
                body: "Open the feed in your phone browser. Filter by floor, by category, or by what is ending soon.",
              },
              {
                title: "Claim it",
                body: "One tap. The deal is held for you with a short grace window, so you have time to get there.",
                after: (
                  <div>
                    <CodeTiles />
                    <p className="mt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                      Example code · not redeemable
                    </p>
                  </div>
                ),
              },
              {
                title: "Visit the shop",
                body: `Read the ${FACTS.codeLength} digits out at the counter. Staff type them into their own screen — it either verifies or it doesn't.`,
              },
              {
                title: "Redeem at the counter",
                body: "The shop verifies your one-time code. You pay the shop directly using a payment method the shop accepts. MAANTA does not process the purchase.",
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
          <div>
            <p className="max-w-xl text-base leading-relaxed text-secondary sm:text-lg">
              An illustration of the format. Real deals, prices and shops appear only once a pilot
              opens. {DEMO_DISCLOSURE_SHOPPER}
            </p>
            <TrackedLink
              href={DEMO_FEED_HREF}
              name="Explore demo deals"
              location="deal"
              className="mt-5 inline-block text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
            >
              Explore demo deals →
            </TrackedLink>
          </div>
        </div>
      </Section>

      <Section id="where">
        <Eyebrow>Potential first location</Eyebrow>
        <SectionHeading>{SHOPPER_WHERE_HEADING}</SectionHeading>
        <NodeBlock lead={SHOPPER_WHERE_BODY} linkLabel="About the potential first location" />
        <div className="mt-6">
          <TrackedLink
            href={WAITLIST_HREF}
            name="Choose a preferred location"
            location="where"
            className="inline-flex h-12 items-center justify-center rounded-pill border border-ink bg-white px-6 text-base font-semibold text-ink transition hover:bg-stone"
          >
            Choose a preferred location
          </TrackedLink>
        </div>
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
              q: "What information does MAANTA need?",
              a: "You need a MAANTA account so a one-time deal code can be tied to one shopper and used once. For the controlled pilot, email is the primary sign-in method. MAANTA does not collect your card details or process your payment to the shop.",
            },
            {
              q: "When does it open?",
              a: `${PILOT_STATUS_SENTENCE} We would rather tell you when it is certain than guess now.`,
            },
          ]}
        />
      </Section>

      <CtaBand
        title={NODE_CTA_TITLE}
        body="Join the shopper waitlist for one message when a confirmed pilot location and opening date are ready."
        primary={{ label: "Join the shopper waitlist", href: WAITLIST_HREF }}
        secondary={{ label: "Explore demo deals", href: DEMO_FEED_HREF }}
      />
    </>
  );
}
