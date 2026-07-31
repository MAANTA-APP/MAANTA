import type { Metadata } from "next";
import Link from "next/link";
import { formatKes } from "@/lib/ui";
import { FACTS } from "@/lib/marketing/facts";
import { SCENARIO } from "@/lib/marketing/scenario";
import { ENTITY } from "@/lib/marketing/demo";
import { ScenarioNotice } from "@/components/marketing/ScenarioNotice";
import { ScenarioStat } from "@/components/marketing/ScenarioStat";
import {
  AudienceHero,
  CtaBand,
  FaqAccordion,
  LiveDot,
  PointGrid,
  Section,
  SectionHeading,
  StepRail,
} from "@/components/marketing/sections";
import { SectionInView } from "@/components/marketing/tracked";

/**
 * `/mall-operators` — the page with no prior surface, and the one carrying the
 * most risk.
 *
 * **Two different disclosure problems, handled two different ways.**
 *
 * The *figures* (rows 2–6 of the deck's claims register) are modelled. They render
 * only through `ScenarioStat`, inside `ScenarioNotice`, and fall back when
 * `NEXT_PUBLIC_SCENARIO_MODE` is not "true" — which is production.
 *
 * The *prose claims* (rows 1 and 7–13) are not covered by that marker, and the
 * most serious of them is row 1: the deck treats BBS Mall as a signed mall-level
 * partner, and BBS have not been approached. On a private preview that is a
 * mockup; published on `www.maanta.app` it is a public claim about a named third
 * party's commercial relationship with MAANTA. Per `demo-mode-spec.md` §2a the
 * four affected sections — `#hero` status, `#node` callout, `#stage`, `#report` —
 * carry production copy that makes no partner claim at all. BBS appears only as
 * the mall MAANTA is live in, which is true.
 *
 * Also edited down from the deck:
 *  - `#report` describes what a pilot **includes**, not a deliverable already
 *    being produced — nobody owns producing it yet (claims register #7);
 *  - the Data Processing Addendum is stated as something agreed as part of a
 *    pilot, not an existing document (#10, deferred in the footer/legal plan);
 *  - "We do not sell shopper data" is worded to match the Privacy Policy (#12).
 *
 * `#report` gets the strongest visual treatment: it is the answer to "what do I
 * actually get", and it is honest about MAANTA doing the work rather than
 * shipping a dashboard nobody opens.
 */

export const metadata: Metadata = {
  title: "Mall operators — MAANTA",
  description:
    "MAANTA makes every tenant promotion in your mall visible, redeemable and measurable. No POS integration. No cost to the mall.",
  openGraph: {
    title: "Your mall runs hundreds of promotions a month.",
    description: "None of them are measured.",
  },
};

export default function MallOperatorsPage() {
  const fee = formatKes(FACTS.successFeeKes);

  return (
    <ScenarioNotice>
      <AudienceHero
        eyebrow="For mall operators"
        title="Your mall runs hundreds of promotions a month. None of them are measured."
        sub={
          <>
            MAANTA puts every tenant offer into one live feed, redeems it at the counter with
            a one-time code, and reports back what actually moved. No POS integration. No
            hardware. No cost to the mall.
          </>
        }
        primary={{ label: "Book a pilot conversation", href: "/contact?topic=mall-operator" }}
        secondary={{ label: "See how Node 0 works", href: "#node" }}
        status={
          // Scenario on: the modelled node figures, each badged. Scenario off:
          // the plain live-node line used across the rest of the site. No
          // partnership is claimed in either state.
          SCENARIO.isScenario ? (
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <LiveDot />
              Live at {FACTS.launchMall} since{" "}
              <ScenarioStat value={SCENARIO.nodeLiveSince} /> ·{" "}
              <ScenarioStat value={SCENARIO.activeShops} badge={false} /> shops ·{" "}
              <ScenarioStat value={SCENARIO.verifiedRedemptions} /> verified redemptions
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 font-semibold text-ink">
              <LiveDot />
              Live at {FACTS.launchMall} · {FACTS.city}
            </span>
          )
        }
      />

      <Section id="problem" tone="paper">
        <SectionHeading>Promotion without attribution</SectionHeading>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-secondary">
          Walk any floor of a busy mall and you will find offers written on chalkboards,
          taped to shutters, and posted into WhatsApp groups with forty members. A tenant
          runs twenty percent off for a weekend. On Monday, nobody can say what it did.
        </p>
        <PointGrid
          columns={3}
          points={[
            {
              title: "Offers stop at the shop doorway.",
              body: "A deal reaches the people already standing in front of it. The shopper two floors up never learns it existed.",
            },
            {
              title: "Footfall counters tell you how many, never why.",
              body: "A gate count records that four thousand people entered on Saturday. It cannot tell you that six hundred came for a specific offer in a specific unit.",
            },
            {
              title: "Tenant performance is self-reported.",
              body: "When a lease comes up for review, the strongest evidence on the table is usually the tenant's own account of a good quarter.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          The promotions are already happening. The measurement is what is missing.
        </p>
      </Section>

      <Section id="node">
        <SectionHeading
          lead={
            <>
              MAANTA operates mall by mall. When a mall goes live it becomes a node: every
              participating tenant can publish offers to one feed that shoppers open on their
              phone, before and during a visit.
            </>
          }
        >
          A node is a mall that runs live
        </SectionHeading>
        <StepRail
          steps={[
            {
              title: "A tenant publishes",
              body: "Two minutes on a phone. Price, quantity, expiry.",
            },
            {
              title: "A shopper claims",
              body: `The offer is reserved and a ${FACTS.codeLength}-digit code is issued to their phone.`,
            },
            {
              title: "Staff verify at the counter",
              body: "The code is entered, checked, and the shopper pays the deal price in person.",
            },
            {
              title: "The redemption is recorded",
              body: "Shop, time, deal, verified.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          There is no online checkout. Money moves at your tenant&apos;s till, exactly as it
          does today. What changes is that the visit is now attributable to a specific offer.
        </p>

        {/*
          Node 0 callout. Scenario mode shows the modelled counts; production
          describes what Node 0 is — which is true and needs no figures.
        */}
        <div className="mt-8 rounded-card border border-line bg-paper p-6">
          {SCENARIO.isScenario ? (
            <p className="text-base leading-relaxed text-ink">
              <strong className="font-bold">
                {FACTS.launchMall} — {FACTS.nodeLabel}.
              </strong>{" "}
              Live for <ScenarioStat value={SCENARIO.monthsLive} badge={false} /> months.{" "}
              <ScenarioStat value={SCENARIO.activeShops} badge={false} /> shops publishing,{" "}
              <ScenarioStat value={SCENARIO.liveDeals} badge={false} /> offers active,{" "}
              <ScenarioStat value={SCENARIO.verifiedRedemptions} /> redemptions verified at
              the counter.
            </p>
          ) : (
            <p className="text-base leading-relaxed text-ink">
              <strong className="font-bold">
                {FACTS.launchMall} — {FACTS.nodeLabel}.
              </strong>{" "}
              {FACTS.nodeLabel} is our first node and where the product is being run in
              person: tenants onboarded unit by unit, staff trained at their own counters,
              and every redemption verified at the till. It is the reference for how a node
              is deployed and operated.
            </p>
          )}
        </div>
      </Section>

      <Section id="value" tone="paper">
        <SectionHeading>What the mall gets</SectionHeading>
        <PointGrid
          points={[
            {
              title: "Verified redemption data",
              body: "Not impressions. Not clicks. A redemption is counted only when a member of your tenant's staff verifies a code at the counter and the shopper is standing there. It is the closest thing to a receipt for footfall.",
            },
            {
              title: "Tenant activation, done in person",
              body: "Our team works the floors unit by unit. We onboard shops, set up staff accounts, and stay until the first redemption goes through. Tenants who have never run a digital promotion are the ones we spend the most time with.",
            },
            {
              title: "Every offer in one place",
              body: "A shopper deciding where to spend Saturday sees what your mall has before they leave the house. Offers rank by verified redemptions, never by stars or reviews, so the feed reflects what people actually walked in for.",
            },
            {
              title: "Nothing to integrate",
              body: "No POS connection. No hardware. No IT project, no procurement cycle, no vendor security review of your systems. Your tenants use a phone they already own.",
            },
          ]}
        />
      </Section>

      {/*
        The differentiator, and the section most carefully worded. The report is
        not an existing deliverable — nobody owns producing one yet — so this
        describes what a pilot includes rather than something already arriving
        each month.
      */}
      <Section id="report" tone="ink">
        <SectionInView name="report">
        <SectionHeading
          tone="light"
          lead="You are not asked to log into anything, learn a tool, or chase a login for a colleague. A pilot includes a written report on how the node performed, and we sit down and go through it with you."
        >
          A monthly operating report, delivered by a person
        </SectionHeading>
        <ul className="mt-8 max-w-3xl space-y-3 text-base leading-relaxed text-white/70">
          {[
            "Verified redemptions by shop, by floor, by day of week and by hour",
            "Which offer types moved — Flash, Boosted, standard",
            "Merchant participation: active, dormant, newly onboarded, and who needs a visit",
            "Repeat-shopper rate across the mall",
            "A written read on what changed since last month, and what we think caused it",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-white">
          The last item is the one that matters. Numbers without an interpretation are
          another dashboard nobody opens.
        </p>
      </SectionInView>
      </Section>

      <Section id="deployment">
        <SectionHeading lead="Four steps, and roughly a month from agreement to live feed.">
          What deployment actually involves
        </SectionHeading>
        <StepRail
          steps={[
            {
              title: "Scope",
              body: "One meeting. We walk the floor plan, the tenant list and the category mix, and agree which floors to activate first.",
            },
            {
              title: "Activation",
              body: "Our team is in the building. We onboard tenants unit by unit, set up wallets and staff accounts, and run each shop through a live redemption before we leave the counter.",
            },
            {
              title: "Go live",
              body: "The feed opens to shoppers. Signage goes up at the entrances your team approves.",
            },
            {
              title: "Operate and report",
              body: "We keep working the floors, onboarding new tenants, and supporting staff. The first operating report lands at the end of the month.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          Nothing is installed. Nothing is procured. Nothing is invoiced to the mall.
        </p>
      </Section>

      <Section id="requirements" tone="paper">
        <SectionHeading>What we need from you</SectionHeading>
        <PointGrid
          points={[
            {
              title: "An introduction to your tenants.",
              body: "A letter, or a line in the comms you already send. Tenants respond very differently when the mall has vouched for us.",
            },
            {
              title: "A table during activation.",
              body: "Somewhere on the concourse while we are onboarding tenants.",
            },
            {
              title: "Permission for signage.",
              body: "Entrances and concourse, in whatever format your standards allow.",
            },
            {
              title: "One named contact on your side.",
              body: "Someone we can reach, and who can reach us.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          That is the whole list. There is no systems access, no data export from your side,
          and no procurement step.
        </p>
      </Section>

      <Section id="commercial">
        <SectionHeading>The mall pays nothing</SectionHeading>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            MAANTA earns a {fee} success fee, charged to a tenant only when a shopper&apos;s
            code is verified in store. No listing fee. No percentage of the sale. No monthly
            minimum. An expired or rejected code costs the tenant nothing.
          </p>
          <p className="text-ink">
            The mall is not billed at any point during a pilot, and we are not asking you to
            sign a commercial agreement to start one. If the pilot works and both sides want
            to continue, we agree terms then, with three months of your own data on the
            table.
          </p>
        </div>
      </Section>

      <Section id="data" tone="paper">
        <SectionHeading>What we collect, and who it belongs to</SectionHeading>
        <PointGrid
          points={[
            {
              title: "We record",
              body: "Deal claims, verified redemptions, timestamps, and the shop the redemption belongs to. Shoppers create an account with a phone number.",
            },
            {
              title: "We do not handle payment data",
              body: "There is no online checkout in MAANTA. Payment happens at your tenant's till, on your tenant's terms, exactly as it does now. No card details pass through us.",
            },
            {
              title: "Mall reporting is aggregated",
              body: "Your operating report covers shop-level and mall-level activity. It does not identify individual shoppers.",
            },
            {
              // Worded to match the Privacy Policy sentence exactly, then extended
              // with the mall-specific commitment. Claims register #12.
              title: "We do not sell shopper data",
              body: "We do not sell personal data. We do not share it with advertisers or data brokers, and we do not share it with other malls.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          MAANTA operates under the Kenya Data Protection Act 2019. Full detail is in our{" "}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-secondary">
            Privacy Policy
          </Link>
          , and data handling for a pilot is agreed in writing before it starts.
        </p>
      </Section>

      <Section id="stage">
        <SectionHeading>One mall. Deliberately.</SectionHeading>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary">
          {SCENARIO.isScenario ? (
            <>
              <p>
                MAANTA has been live at BBS Mall for{" "}
                <ScenarioStat value={SCENARIO.monthsLive} /> months. We are choosing the next
                three malls carefully rather than collecting logos.
              </p>
              <p>
                That is a deliberate constraint, and it is worth being direct about what it
                buys you. A mall that joins now gets our team on its floors, not a support
                queue. It gets the product shaped around problems its tenants actually have.
                And it gets an operating report written by the people who were in the
                building that month.
              </p>
              <p className="text-ink">
                There is a version of this business that signs twenty malls and serves none
                of them properly. We are not building it.
              </p>
            </>
          ) : (
            <p>
              MAANTA is live at {FACTS.launchMall} — our first node. We are choosing the next
              malls carefully rather than collecting logos. A mall that joins now gets our
              team on its floors, not a support queue, and a product shaped around problems
              its tenants actually have.
            </p>
          )}
        </div>
      </Section>

      <Section id="faq" tone="paper">
        <SectionHeading>Questions operators ask</SectionHeading>
        <FaqAccordion
          page="mall-operators"
          items={[
            {
              q: "Does this compete with our own marketing?",
              a: "No. It distributes it. Your campaigns bring people to the mall; MAANTA tells them what is worth walking to once they are deciding. Mall-level campaigns can be surfaced in the feed alongside tenant offers.",
            },
            {
              q: "What if our tenants don't take part?",
              a: "Participation costs a tenant nothing to try — no listing fee, and the success fee only applies when a code is verified at their own counter. In practice the harder problem is not persuasion, it is sitting with a shop owner while they publish their first offer. That is what activation is for.",
            },
            {
              q: "Do we need to change our POS or our systems?",
              a: "No. There is no integration of any kind. Staff verify a code on a phone.",
            },
            {
              q: "Who supports our tenants day to day?",
              a: "We do. WhatsApp support, plus a desk in the mall during activation and on request afterwards. Tenant support does not land on your team.",
            },
            {
              q: "What happens to the data if we stop?",
              a: "Your operating reports are yours to keep. We stop reporting, tenants can continue or close their accounts, and the terms of any data handling are set out in the pilot agreement before it starts.",
            },
            {
              q: "How long before we see anything meaningful?",
              a: "The first redemption usually happens within a day of a shop going live. A month of data is enough to see patterns by floor and by hour. A quarter is enough to see whether tenant behaviour has changed.",
            },
          ]}
        />
      </Section>

      <CtaBand
        title="Start with a conversation, not a contract."
        body="Tell us about your mall — floors, tenant mix, and what you have tried before. If it is not a fit, we will say so in the first call."
        primary={{ label: "Book a pilot conversation", href: "/contact?topic=mall-operator" }}
        secondary={{ label: "Join as a mall operator", href: "/waitlist?role=mall-operator" }}
        reassurance={
          <>
            Or write directly: {ENTITY.founder},{" "}
            <a
              href={`mailto:${ENTITY.email}`}
              className="underline underline-offset-4 hover:text-white"
            >
              {ENTITY.email}
            </a>
          </>
        }
      />
    </ScenarioNotice>
  );
}
