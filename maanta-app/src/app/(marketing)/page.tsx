import type { Metadata } from "next";
import Link from "next/link";
import { formatKes } from "@/lib/ui";
import { FACTS, OFFERS, isOfferLive } from "@/lib/marketing/facts";
import { SCENARIO } from "@/lib/marketing/scenario";
import { ModelledBadge, ScenarioNotice } from "@/components/marketing/ScenarioNotice";
import { ScenarioStat } from "@/components/marketing/ScenarioStat";
import { LandingEarlyAccess } from "./landing-early-access";
import { SectionInView, TrackedLink } from "@/components/marketing/tracked";
import { MARKETING_EVENTS } from "@/lib/marketing/analytics-events";
import {
  AudienceHero,
  LiveDot,
  PointGrid,
  Section,
  SectionHeading,
  StepRail,
} from "@/components/marketing/sections";

/**
 * `/` — Home.
 *
 * Home routes; it does not persuade. `#doors` is the load-bearing section and
 * everything below it is reinforcement, so each section has to survive the
 * question "would removing this cost us a conversion?".
 *
 * The tagline "The mall, made live." is kept, but in the title tag rather than as
 * the H1. It is memorable once you know what MAANTA is and opaque before that,
 * and the H1 has to do the explaining.
 *
 * Accent discipline: `#FDBF2D` appears on the primary CTA, the live-status dot,
 * and the merchant band. Nowhere else.
 *
 * No live deal count appears anywhere on this page. The only scenario value
 * permitted here is the merchant-facing shop count, and it renders through
 * `ScenarioStat` inside `ScenarioNotice` like every other modelled figure.
 */

export const metadata: Metadata = {
  title: "MAANTA — The mall, made live.",
  description:
    "See every deal in your mall before you get there. Claim on your phone, show a 6-digit code at the counter, pay the shop in person. Live at BBS Mall, Eastleigh.",
  openGraph: {
    title: "Every deal in your mall, live on your phone.",
    description:
      "Claim on your phone, show a 6-digit code at the counter, pay the shop in person.",
  },
};

const DOORS = [
  {
    title: "Shoppers",
    body: "See what the shops in your mall are offering right now. Free, no card, and nothing to download.",
    label: "For shoppers",
    href: "/shoppers",
  },
  {
    title: "Merchants",
    body: "Publish a deal in two minutes. Pay only when a customer's code is verified at your counter — no listing fee, no cut of the sale.",
    label: "For merchants",
    href: "/merchants",
  },
  {
    title: "Mall operators",
    body: "Make every tenant promotion in your mall visible and measurable. No POS integration, no cost to the mall.",
    label: "For mall operators",
    href: "/mall-operators",
  },
] as const;

export default function LandingPage() {
  const fee = formatKes(FACTS.successFeeKes);
  const credit = formatKes(OFFERS.openingCredit.amountKes);
  const creditLive = isOfferLive(OFFERS.openingCredit);

  return (
    <ScenarioNotice>
      <AudienceHero
        eyebrow="The mall, made live"
        title="Every deal in your mall, live on your phone."
        sub={
          <>
            Claim a deal on your phone, show a {FACTS.codeLength}-digit code at the counter,
            and pay the shop in person. Free for shoppers, with no card and no online
            checkout. Shops pay {fee} only when a code is verified at their till.
          </>
        }
        primary={{ label: "Browse live deals", href: "/feed" }}
        secondary={{ label: "Install the app", href: "/download" }}
        status={
          <>
            <p className="font-semibold text-ink">No sign-in needed to look around.</p>
            <p className="mt-2 inline-flex items-center gap-2">
              <LiveDot />
              Live at {FACTS.launchMall} · {FACTS.city}
            </p>
          </>
        }
      />

      <Section id="problem" tone="paper">
        <SectionHeading>Malls have deals. Shoppers rarely see them.</SectionHeading>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-secondary sm:text-lg">
          Merchants write offers on chalkboards, on paper taped to the shutter, and in
          WhatsApp groups. Shoppers walk past without knowing.
        </p>
      </Section>

      <Section id="loop">
        <SectionHeading>How it works</SectionHeading>
        <StepRail
          steps={[
            {
              title: "Discover",
              body: "Open the feed for your mall. Deals sorted by what is nearest and what ends soonest.",
            },
            {
              title: "Claim",
              body: `Tap a deal. A ${FACTS.codeLength}-digit code appears on your phone and the deal is held for you.`,
            },
            {
              title: "Redeem",
              body: "Show the code at the counter. Staff verify it, you pay the deal price in person.",
            },
          ]}
        />
        <p className="mt-10 max-w-3xl text-base font-semibold leading-relaxed text-ink sm:text-lg">
          No online checkout. Money moves at the till, between you and the shop, the way it
          always has.
        </p>
      </Section>

      {/*
        The most important section on the page. Three equal cards — resist adding
        a fourth. If a visitor has to scroll to discover MAANTA serves merchants
        and malls, the page has not done its job.
      */}
      <Section id="doors" tone="paper">
        <SectionInView name="doors">
        <SectionHeading>Three ways in</SectionHeading>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {DOORS.map((d) => (
            <TrackedLink
              key={d.href}
              href={d.href}
              event={MARKETING_EVENTS.audienceDoor}
              name={d.title}
              location="doors"
              className="group flex flex-col rounded-card border border-line bg-white p-6 transition hover:border-ink"
            >
              <h3 className="text-lg font-black text-ink">{d.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-secondary">{d.body}</p>
              <span className="mt-4 text-sm font-bold text-ink underline underline-offset-4">
                {d.label} →
              </span>
            </TrackedLink>
          ))}
        </div>
        </SectionInView>
      </Section>

      <Section id="verified" tone="ink">
        <SectionHeading tone="light">Ranked by who actually walked in.</SectionHeading>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-white/70 sm:text-lg">
          <p>
            Nothing on MAANTA is ranked by stars or reviews. A deal rises because shoppers
            claimed it and staff verified the code at a counter — a real person, in a real
            shop, at a real time.
          </p>
          <p className="text-white">
            That single rule is why merchants trust the ranking, why shoppers trust the feed,
            and why a mall can treat the numbers as evidence rather than marketing.
          </p>
        </div>
      </Section>

      <Section id="deals">
        <SectionHeading>Flash, Boosted, and what is near you</SectionHeading>
        <PointGrid
          columns={3}
          points={[
            {
              title: "Flash",
              body: "Short-window top picks, often under an hour. Worth walking to now.",
            },
            { title: "Boosted", body: "Neighbourhood favourites, pushed to the top." },
            {
              title: "Map",
              body: "Pins with precise pickup spots, so you find the right shop the first time.",
            },
          ]}
        />
      </Section>

      {/* Merchant conversion band — the third and last use of the accent. */}
      <Section id="merchant-band" tone="paper">
        <div className="rounded-card border-l-4 border-brand bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-black text-ink sm:text-3xl">Run a shop at BBS Mall?</h2>
          <div className="mt-4 max-w-3xl space-y-3 text-base leading-relaxed text-secondary">
            <p>
              {fee} per verified redemption. No listing fee, no percentage cut, no monthly
              minimum. A code that expires or gets rejected costs you nothing.
            </p>
            {/* Time-bound: absent rather than stale once the offer closes. */}
            {creditLive ? (
              <p>
                The first {OFFERS.openingCredit.cohortShops} shops we activate at BBS start
                with {credit} of opening credit — ten redemptions before you spend anything.
              </p>
            ) : null}
          </div>
          {SCENARIO.isScenario ? (
            <p className="mt-4 text-sm text-secondary">
              <ScenarioStat value={SCENARIO.activeShops} badge={false} /> shops publishing at{" "}
              {FACTS.launchMall}
              <ModelledBadge />
            </p>
          ) : null}
          <TrackedLink
            href="/merchants"
            name="List your shop"
            location="merchant-band"
            className="mt-6 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-ink-soft transition hover:brightness-95"
          >
            List your shop
          </TrackedLink>
        </div>
      </Section>

      <Section id="node">
        <SectionHeading>Built for Nairobi malls first</SectionHeading>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            MAANTA starts at {FACTS.launchMall} — {FACTS.nodeLabel}. A precise, in-person loop
            for shoppers and merchants who already meet at the till.
          </p>
          <p className="text-ink">
            We are not building an online marketplace. There is no checkout, no delivery and
            no escrow. The transaction that already works — a person, a counter, a price —
            stays exactly as it is. We make the offer visible before it happens, and
            verifiable after.
          </p>
        </div>
        <Link
          href="/malls/bbs-mall"
          className="mt-6 inline-block text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
        >
          See what&apos;s live at BBS Mall
        </Link>
      </Section>

      <LandingEarlyAccess />
    </ScenarioNotice>
  );
}
