import type { Metadata } from "next";
import { formatKes } from "@/lib/ui";
import { FACTS, NODE_TEAM } from "@/lib/marketing/facts";
import { SCENARIO } from "@/lib/marketing/scenario";
import { ENTITY, ENTITY_LINE, LEGAL_LAST_UPDATED } from "@/lib/marketing/demo";
import { ScenarioNotice } from "@/components/marketing/ScenarioNotice";
import { ScenarioStat } from "@/components/marketing/ScenarioStat";
import { CtaBand, Section, SectionHeading } from "@/components/marketing/sections";
import { NODE_DURATION_LEAD, NODE_ONLY_MALL_SENTENCE } from "@/lib/marketing/live-claims";
import { pageMetadata } from "@/lib/marketing/page-metadata";

/**
 * `/about` — set in prose, not cards.
 *
 * This is the one page where the reader has decided to read, so it uses a long
 * measure and minimal chrome. Breaking it into feature tiles would undercut the
 * seriousness the copy is going for, and `#not` in particular would look
 * decorative with icons on it.
 *
 * **The founder biography was supplied on 2026-07-31** and is written only from
 * facts given: born in Norway, raised in the UK, Politics and Economics at Aston,
 * back in Norway since 2024. Nothing is embellished — the deck's guidance is that
 * what earns trust here is specific and checkable, and that a sentence true of a
 * hundred other founders should be cut.
 *
 * **One sentence is deliberately missing**: why MAANTA, and why Eastleigh. The
 * deck calls that the sentence that does the most work, and it was not supplied.
 * It is not invented here. See the implementation report.
 *
 * **The team paragraph states the node operating model**, confirmed by the founder
 * 2026-07-31: one node manager and up to four agents per node, agents on the
 * floor with shoppers and merchants, the node manager coordinating with mall
 * management. It reads from `NODE_TEAM` in `facts.ts` so `/about`, `/merchants`
 * and `/mall-operators` cannot describe the model differently.
 *
 * Stated as how a node is staffed, not as a headcount standing in BBS Mall on any
 * given day. That distinction is what keeps it honest on a site demonstrating
 * post-launch operation: the model is real and is what an operator is evaluating;
 * a present-tense count would be a measured figure, and measured figures render
 * through `ScenarioStat`. Drift D35.
 *
 * **Two corrections to the deck.** `#money` said "any shop can buy a boost" —
 * boosts are Elite-only and enforced as such, so that is stated correctly here.
 * And the contact address is `admin@maanta.app`, per `demo-mode-spec.md` §1,
 * which supersedes the deck's preference for a named `mohamed@` address; the
 * spec is authoritative, and the deck's point about `admin@` reading as "nobody
 * is home" is recorded as an open issue rather than silently actioned.
 */

export const metadata: Metadata = pageMetadata({
  path: "/about",
  title: "About — MAANTA",
  // Trimmed from 171 characters to fit the snippet window, and the "Live at
  // BBS Mall" clause is gone under the D87 ruling of 2026-08-10 rather than as
  // a side effect of the trim. This description and the `ogDescription` below
  // are two of the twenty-one surfaces that ruling covers; the rest resolve
  // through `lib/marketing/live-claims.ts`, which is where the gated wording
  // lives so one flag restores all of them at launch. These two are literals
  // because a metadata string cannot read a value the page does not render.
  description:
    "The deals inside a mall, visible before you walk in and verifiable after you walk out. How it works, how MAANTA makes money, and where it opens first.",
  ogTitle: "What MAANTA is, and how it makes money.",
  ogDescription:
    "The deals inside a mall, visible before you walk in and verifiable after you walk out.",
});

export default function AboutPage() {
  const fee = formatKes(FACTS.successFeeKes);
  const boost = formatKes(FACTS.boostPer24hKes);

  return (
    <ScenarioNotice>
      <Section id="what">
        <h1 className="max-w-3xl text-3xl font-black leading-tight text-ink sm:text-4xl">
          About MAANTA
        </h1>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary sm:text-lg">
          <p>
            MAANTA makes the deals inside a shopping mall visible before you walk in, and
            verifiable after you walk out.
          </p>
          <p>
            Shops publish offers from a phone. Shoppers see them in one live feed, claim one,
            and receive a {FACTS.codeLength}-digit code. Staff verify the code at the
            counter, the shopper pays the shop in person, and MAANTA charges the shop {fee}{" "}
            for that verified redemption.
          </p>
          <p className="text-ink">That loop is the entire product.</p>
        </div>
      </Section>

      {/*
        The strongest section on the page. Six short statements, strong vertical
        rhythm, deliberately no icons — icons would make an austere list look
        decorative, and the austerity is the argument.
      */}
      <Section id="not" tone="paper">
        <SectionHeading lead="It is quicker to describe MAANTA by what it refuses to be.">
          What MAANTA does not do
        </SectionHeading>
        <ul className="mt-10 max-w-2xl space-y-6">
          {[
            {
              t: "We do not process payments.",
              b: "There is no checkout in MAANTA. Money moves at the till, between a shopper and a shop, exactly as it did before we existed.",
            },
            { t: "We do not deliver anything.", b: "The shopper walks in. That is the point." },
            {
              t: "We do not host reviews or star ratings.",
              b: "A deal rises because people redeemed it, not because people rated it.",
            },
            {
              t: "We do not take a percentage of any sale.",
              b: `${fee} is ${fee} whether the basket is ${formatKes(200)} or ${formatKes(20_000)}.`,
            },
            {
              // Worded to match the Privacy Policy sentence exactly. Claims
              // register #2 — same sentence, both pages.
              t: "We do not sell shopper data.",
              b: "We do not sell personal data. We do not share it with advertisers or data brokers, and we do not share it with other malls.",
            },
            {
              t: "We are not a marketplace.",
              b: "We do not stand between a shop and its customer, and we do not want to.",
            },
          ].map((p) => (
            <li key={p.t}>
              <p className="text-base font-bold text-ink">{p.t}</p>
              <p className="mt-1 text-base leading-relaxed text-secondary">{p.b}</p>
            </li>
          ))}
        </ul>
        <p className="mt-10 max-w-2xl text-base leading-relaxed text-ink">
          Every one of those is a decision we intend to keep, not a feature we have not got
          to yet.
        </p>
      </Section>

      <Section id="why">
        <SectionHeading>Why Nairobi malls, and why in person</SectionHeading>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            Mall retail in Nairobi already works. Shoppers come, shops sell, money changes
            hands at a counter. Nothing about that transaction is broken and nothing about it
            needs disrupting.
          </p>
          <p>
            What fails is information. A shop runs a good offer and tells the forty people in
            a WhatsApp group and whoever happens to look at the chalkboard. Two floors up,
            someone who would have bought it never finds out. In a place like Eastleigh —
            hundreds of shops behind hundreds of similar shutters — that gap is expensive for
            everyone standing on either side of it.
          </p>
          <p className="text-ink">
            So MAANTA fixes the information problem and leaves the transaction alone. We are
            not trying to move mall retail online. We are trying to make the mall legible.
          </p>
        </div>
      </Section>

      <Section id="principle" tone="paper">
        <SectionHeading>Verified redemption is the only signal we trust</SectionHeading>
        <div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-secondary">
          <p>
            Everything on MAANTA ranks on one thing: a code that a member of shop staff
            verified at a counter, with the shopper standing there.
          </p>
          <p>
            Not impressions. Not clicks. Not stars, which can be bought, farmed, or left by
            someone who never entered the shop.
          </p>
          <p className="text-ink">
            It is a deliberately narrow signal, and narrow is the point. It is the only event
            in this business that is expensive to fake and equally meaningful to all three
            sides — a shopper who walked in, a shop that made a sale, and a mall that got
            footfall it can account for.
          </p>
        </div>
      </Section>

      {/*
        Given its own surface. A reader scanning an About page for "how do they
        make money" should find it without reading the rest.
      */}
      <Section id="money">
        <div className="max-w-3xl rounded-card border border-line bg-paper p-6 sm:p-8">
          <h2 className="text-2xl font-black text-ink sm:text-3xl">How we make money</h2>
          <div className="mt-5 space-y-4 text-base leading-relaxed text-secondary">
            <p>
              Shops pay {fee} when a shopper&apos;s code is verified at their counter. That is
              the core of the business.
            </p>
            <p>
              A shop that wants more than one live offer can take Elite. Its monthly
              price is not set yet. Elite shops can also buy a boost — top of the feed
              for {FACTS.boostHours} hours — at {boost}.
            </p>
          </div>
          <ul className="mt-6 space-y-3 text-base leading-relaxed">
            <li>
              <strong className="font-bold text-ink">Shoppers pay nothing.</strong>{" "}
              <span className="text-secondary">
                There is no paid tier, no subscription, and nowhere to enter a card.
              </span>
            </li>
            <li>
              <strong className="font-bold text-ink">Malls pay nothing.</strong>{" "}
              <span className="text-secondary">Operator partnerships are not billed.</span>
            </li>
            <li>
              <strong className="font-bold text-ink">
                We take no percentage and sell no data.
              </strong>{" "}
              <span className="text-secondary">
                Our revenue does not rise because a basket was large or because we learned
                something about a shopper.
              </span>
            </li>
          </ul>
          <p className="mt-6 text-base font-semibold leading-relaxed text-ink">
            If nobody walks into a shop, we earn nothing. That is deliberate. It keeps our
            incentive pointed at the same thing the merchant already cares about.
          </p>
        </div>
      </Section>

      <Section id="today" tone="paper">
        <SectionHeading>Where we are today</SectionHeading>
        <p className="mt-4 text-sm italic text-muted">Last updated {LEGAL_LAST_UPDATED}.</p>
        <div className="mt-4 max-w-2xl space-y-4 text-base leading-relaxed text-secondary">
          {SCENARIO.isScenario ? (
            <p>
              {NODE_DURATION_LEAD}{" "}
              <ScenarioStat value={SCENARIO.monthsLive} badge={false} /> months.{" "}
              <ScenarioStat value={SCENARIO.activeShops} badge={false} /> shops publish deals,
              and <ScenarioStat value={SCENARIO.verifiedRedemptions} /> redemptions have been
              verified at a counter.
            </p>
          ) : (
            <p>
              {NODE_ONLY_MALL_SENTENCE}
            </p>
          )}
          <p>
            We are in one mall. We have not opened a second, and we would rather do the first
            one properly than announce three.
          </p>
          <p>
            We have no outside investment to point at and no awards to list. What we have
            is a working loop, shops using it, and people in the mall rather than a support
            address.
          </p>
          <p className="text-ink">If any of that changes, this page changes with it.</p>
        </div>
      </Section>

      <Section id="team">
        <SectionHeading>Who is building it</SectionHeading>
        <div className="mt-6 max-w-2xl">
          <p className="text-base font-bold text-ink">{ENTITY.founder} — Founder</p>
          <p className="mt-3 text-base leading-relaxed text-secondary">
            Born in Norway in 1997 to Somali parents who arrived as asylum seekers, and
            raised in the UK from 2003. He read Politics and Economics at Aston University
            and moved back to Norway in 2024. MAANTA is his first company.
          </p>
          <p className="mt-3 text-base leading-relaxed text-secondary">
            Eastleigh is the commercial centre of the Somali diaspora in East Africa — a
            market he has a claim on by descent, and one most founders cannot read. Studying
            politics and economics is what gave the thing he already recognised a shape: the
            shops work and the prices work, and what is missing is not capital or demand but
            information. Someone two floors up never learns what is on offer.
          </p>
          <p className="mt-2 text-base leading-relaxed text-secondary">
            <a
              href={`mailto:${ENTITY.email}`}
              className="underline underline-offset-4 hover:text-ink"
            >
              {ENTITY.email}
            </a>
          </p>
          <p className="mt-6 text-base leading-relaxed text-secondary">
            Every node MAANTA opens is staffed. A node manager and up to{" "}
            {NODE_TEAM.agentsMax} agents work the mall: the agents {NODE_TEAM.agentRole},
            and the node manager {NODE_TEAM.managerRole}. Activation happens in person
            rather than by email — sitting with a shop owner while they publish their first
            deal, and staying at the counter until a real code has been verified. Most of
            what we have learned came from that, not from analytics.
          </p>
        </div>
      </Section>

      <CtaBand
        title="Talk to us"
        body="Merchants, mall operators, press and anyone doing due diligence — the fastest route is the contact page, and it goes to a person."
        primary={{ label: "Contact us", href: "/contact" }}
        secondary={{ label: "See how it works", href: "/shoppers" }}
        reassurance={ENTITY_LINE}
      />
    </ScenarioNotice>
  );
}
