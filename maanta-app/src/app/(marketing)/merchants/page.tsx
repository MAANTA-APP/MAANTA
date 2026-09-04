import type { Metadata } from "next";
import Link from "next/link";
import { formatKes } from "@/lib/ui";
import { FACTS, OFFERS, PAYMENT_AVAILABILITY, isOfferLive } from "@/lib/marketing/facts";
import { ENTITY } from "@/lib/marketing/demo";
import {
  AudienceHero,
  CtaBand,
  FaqAccordion,
  LiveDot,
  PointGrid,
  Section,
  SectionHeading,
  TrustBar,
} from "@/components/marketing/sections";
import { MerchantWalkthrough } from "@/components/marketing/MerchantWalkthrough";
import { SectionInView } from "@/components/marketing/tracked";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { NODE_STAFFING_MODEL, NODE_STATUS_LINE } from "@/lib/marketing/live-claims";

/**
 * `/merchants` — merchant marketing page. 301 target for `/for-merchants`.
 *
 * Consolidates the two colliding pages: `/for-merchants` (six good sections) and
 * the old `/merchants` (short block plus the lead form). The form relocated to
 * `/merchants/join` first, so acquisition was never dark (risk R2).
 *
 * Headings kept verbatim from the live page per `copy/merchants.md` — "Your first
 * 10 are on us" and "A code always verifies" are better than anything invented,
 * and every heading is a plain statement that survives translation into Swahili or
 * Somali without a rewrite.
 *
 * **Four deck items were marked VERIFY and are resolved from the migrations:**
 *  - boosts are Elite-only (`BOOST_ELITE_ONLY`, migration 20260715194145), so the
 *    deck's line "Boosts can also be bought on Standard at KES 500 for 24 hours"
 *    is **not published** — it is false, and claims-register #4 asked for exactly
 *    this resolution before stating one answer everywhere;
 *  - staff accounts are on all plans (`merchant_staff` has no tier column);
 *  - the planned top-up rail is M-Pesa STK push, not paybill
 *    (`initiateMpesaStkPush`) — **planned, not available**: no payment exists
 *    inside MAANTA today, so the page describes none. The mechanism copy
 *    ("top up by M-Pesa", "card also works", "your wallet") and the refund
 *    claim that depended on it came off by founder ruling 2026-09-04 (X4); the
 *    payment model now reads from `PAYMENT_AVAILABILITY` and is GD1-neutral.
 *    The KES 300 opening-credit offer is untouched — that is a separate,
 *    unruled question (GD1) and must not be edited in the same pass.
 *
 * Every number reads from `facts.ts`. This is the page where a pricing
 * inconsistency does the most damage.
 */

// Metadata is rendered output too — it is what a search result and a shared
// link say — so the fee reads from FACTS here for the same reason it does in
// the body. These two strings were literals until 2026-08-01.
//
// The D40 branch this was reconciled with predates that change and had them as
// typed "KES 30" literals. Resolved toward FACTS: taking the branch verbatim
// would have reintroduced a second declaration of the frozen fee in rendered
// output, which is the D34 failure the marketing hard rule exists to stop.
export const metadata: Metadata = pageMetadata({
  path: "/merchants",
  title: "For merchants — MAANTA",
  description: `List your shop on MAANTA. KES ${FACTS.successFeeKes} when a customer's code is verified at your counter. No fee to join, no share of your sale, no monthly minimum.`,
  ogTitle: "You only pay when a customer walks in.",
  ogDescription: `List your shop on MAANTA. KES ${FACTS.successFeeKes} when a customer's code is verified at your counter.`,
});

export default function MerchantsPage() {
  const fee = formatKes(FACTS.successFeeKes);
  const boost = formatKes(FACTS.boostPer24hKes);
  const credit = formatKes(OFFERS.openingCredit.amountKes);

  // Time-bound offers render only while live. Both expiries are unset today, so
  // this section is absent rather than stale — risk R7. Filling the date in
  // facts.ts is the only change needed to bring it back.
  const openingCreditLive = isOfferLive(OFFERS.openingCredit);
  const eliteTrialLive = isOfferLive(OFFERS.eliteTrial);

  return (
    <>
      <AudienceHero
        eyebrow="For merchants"
        title="You only pay when a customer walks in."
        sub={
          <>
            Post a deal from your phone. A shopper claims it and gets a{" "}
            {FACTS.codeLength}-digit code. Your staff check the code at the counter, the
            customer pays you in person, and MAANTA charges you {fee}. Nothing else.
          </>
        }
        primary={{ label: "List your shop", href: "/merchants/join" }}
        secondary={{ label: "See how it works at your counter", href: "#counter" }}
        status={
          <span className="inline-flex items-center gap-2 font-semibold text-ink">
            <LiveDot />
            {NODE_STATUS_LINE}
          </span>
        }
      />

      {/*
        The whole commercial offer, before the merchant has scrolled once. This
        is the page where a pricing inconsistency does the most damage, so every
        figure here is the same `fee` binding that #cost and the FAQ render —
        there is no second number to keep in step.

        Deliberately no shop count. That is a measured figure, it is modelled
        until BBS is live, and it would have to go through ScenarioStat.
      */}
      <TrustBar
        items={[
          {
            title: <>{fee} per verified redemption</>,
            body: "No fee to join, no share of your sale, no monthly minimum.",
          },
          {
            title: "Nothing for a code that fails",
            body: "If a code expires or your staff reject it, you are not charged.",
          },
          {
            title: "You keep the payment",
            body: "The customer pays you at your till, in full. MAANTA never touches the money.",
          },
        ]}
      />

      <Section id="cost" tone="paper">
        <SectionInView name="cost">
        <SectionHeading lead={<>{fee} for each verified redemption. That is the whole price.</>}>
          What it costs
        </SectionHeading>
        <PointGrid
          points={[
            {
              title: "No fee to join.",
              body: "Putting your shop and your deals on MAANTA costs nothing.",
            },
            {
              title: "No share of your sale.",
              body: (
                <>
                  The fee is {fee} whether the customer spends {formatKes(200)} or{" "}
                  {formatKes(20_000)}. We never take a share of your sale.
                </>
              ),
            },
            {
              title: "No monthly minimum.",
              body: "A quiet month costs you nothing. There is no floor to hit.",
            },
            {
              title: "Nothing for a code that fails.",
              body: "If a code expires, or your staff reject it, you are not charged. You pay for customers who arrived and bought.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          The money for the sale goes straight into your till, the way it does today.
          MAANTA never touches the payment.
        </p>
      </SectionInView>
      </Section>

      {/*
        Opening credit and Elite trial. Both are time-bound and both are gated:
        an offer with no end date is an unbounded promise, and a closed offer left
        on the page is worse than one that was never there.
      */}
      {openingCreditLive || eliteTrialLive ? (
        <Section id="first-ten">
          <SectionHeading>Your first 10 are on us</SectionHeading>
          <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary">
            {openingCreditLive ? (
              <p>
                The first {OFFERS.openingCredit.cohortShops} shops we activate at{" "}
                {FACTS.launchMall} start with {credit} of opening credit. That is ten
                verified redemptions before you spend anything of your own.
              </p>
            ) : null}
            {eliteTrialLive ? (
              <p>
                The first {OFFERS.eliteTrial.cohortShops} also get {OFFERS.eliteTrial.days}{" "}
                days of Elite. Two active deals, flash deals and boosts, at no monthly cost.
                The {fee} success fee still applies during the trial. When it ends you have{" "}
                {OFFERS.eliteTrial.postTrialGraceDays} days to decide, and if you do nothing
                you go back to Standard. Nothing is charged automatically.
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section id="counter" tone="paper">
        <SectionHeading lead="Four steps. Your staff learn it once.">
          How it works at your counter
        </SectionHeading>
        {/*
          The same four steps, each under a drawing of the screen it describes.
          The fee panel is the one that earns this: "we show the fee before the
          button that charges it" is a sentence nobody believes and a picture
          everybody reads.
        */}
        <MerchantWalkthrough
          steps={[
            {
              title: "Post a deal",
              body: "Two minutes on a phone. Set the price, how many you will honour, and when it ends. You decide all three.",
            },
            {
              title: "A shopper claims it",
              body: `The deal is held for them and a ${FACTS.codeLength}-digit code goes to their phone. They come to you.`,
            },
            {
              title: "Your staff verify the code",
              body: `Open MAANTA, type the ${FACTS.codeLength} digits, check the deal on screen matches what the customer is asking for. Accept or reject.`,
            },
            {
              title: `They pay you, we charge ${fee}`,
              body: `The customer pays the deal price at your till, in cash or however you normally take money. ${fee} comes off your MAANTA balance.`,
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          The customer is standing in front of you for every step that matters. Nothing is
          agreed online and no money moves before they arrive.
        </p>
      </Section>

      <Section id="verify">
        <SectionHeading lead="Every code is one use only, tied to one deal, at one shop. Yours.">
          A code always verifies
        </SectionHeading>
        <PointGrid
          points={[
            {
              title: "A code cannot be used twice.",
              body: "Once your staff accept it, it is spent.",
            },
            {
              title: "A code cannot be used at another shop.",
              body: "It only opens against the deal you published.",
            },
            {
              title: "An expired code will not verify.",
              body: (
                <>
                  A claimed code stays valid until your deal ends, plus a{" "}
                  {FACTS.graceMinutes}-minute grace period so the customer can reach the
                  counter. After that it fails, and it costs you nothing.
                </>
              ),
            },
            {
              title: "Your staff can always reject.",
              body: "If something is wrong — a different item, a screenshot, an argument — reject it. You are not charged for a rejected code, and you are not obliged to honour anything you did not publish.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          You keep the final say at your own counter. MAANTA does not overrule it.
        </p>
      </Section>

      <Section id="operations" tone="paper">
        <SectionHeading>Running it while you run the shop</SectionHeading>
        <PointGrid
          points={[
            {
              title: "Your staff, their own logins.",
              // Resolved: merchant_staff carries per-permission booleans and no
              // tier column, so this is available on every plan.
              body: "Add the people who work your counter, on any plan. They verify codes without your phone and without your password.",
            },
            {
              title: "Deals you can repost.",
              body: "A deal that worked once can be published again without typing it in from scratch. Old deals stay in your archive.",
            },
            {
              title: "Alerts when something needs you.",
              body: "A claim comes in, a deal is about to end, your balance is getting low. You are told, you do not have to check.",
            },
            {
              title: "Boosts when you want the traffic.",
              // Resolved: Elite-only, enforced in purchase_boost. Stated with the
              // qualifier rather than as a general capability.
              body: (
                <>
                  On Elite, {boost} puts a deal at the top of the feed for{" "}
                  {FACTS.boostHours} hours. Use it on a slow Tuesday, not every day.
                </>
              ),
            },
          ]}
        />
      </Section>

      {/*
        The payment model, from one source. No payment exists inside MAANTA
        today, so this section says so and describes none — the M-Pesa prompt
        and "card also works" it used to promise were mechanisms that do not
        exist (founder ruling 2026-09-04, X4). `PAYMENT_AVAILABILITY.note` is
        the paragraph that changes on the day a rail goes live.
      */}
      <Section id="paying">
        <SectionHeading
          lead={
            <>
              MAANTA works from a balance. Each verified redemption takes {fee} off it, and
              a code that fails takes nothing.
            </>
          }
        >
          Your balance
        </SectionHeading>
        <p className="mt-6 max-w-3xl text-base leading-relaxed text-ink">
          {PAYMENT_AVAILABILITY.note}
        </p>
        <PointGrid
          columns={3}
          points={[
            {
              title: "Nothing to pay up front.",
              body: "There is no minimum to hold and no subscription taken from your balance.",
            },
            {
              title: "You can see every deduction.",
              body: "Each charge shows which deal, which code and what time. If a redemption should not have been charged, tell us and we will look at it.",
            },
            {
              title: "Running low does not switch you off.",
              body: "We warn you before it becomes a problem.",
            },
          ]}
        />
        <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink">
          Money for the sale itself never enters this balance. Customers pay you directly at
          the till. The balance only covers the {fee} fees.
        </p>
      </Section>

      <Section id="plans" tone="paper">
        <SectionInView name="plans">
        <SectionHeading lead="Most shops never need to leave Standard. Elite is for shops that want to run more than one offer at a time.">
          Plans
        </SectionHeading>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-card bg-white shadow-card p-6">
            <h3 className="text-lg font-bold text-ink">Standard</h3>
            <p className="mt-1 text-2xl font-black text-ink">No monthly fee</p>
            <ul className="mt-4 space-y-2 text-sm text-secondary">
              <li>{FACTS.standardActiveDeals} active deal</li>
              <li>{fee} per verified redemption</li>
              <li>Staff accounts</li>
            </ul>
          </div>
          <div className="rounded-card border-[3px] border-ink bg-ink p-6">
            <h3 className="text-lg font-bold text-brand">Elite</h3>
            <p className="mt-1 text-2xl font-black text-white">Pricing coming soon</p>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              <li>{FACTS.eliteActiveDeals} active deals</li>
              <li>Flash deals — short-window offers at the top of the feed</li>
              <li>
                Boosts — {boost} per {FACTS.boostHours}h, recorded against your balance
              </li>
              <li>{fee} per verified redemption still applies</li>
            </ul>
          </div>
        </div>
        <p className="mt-6 text-sm text-secondary">
          Boosts are an Elite feature. Full detail on the{" "}
          <Link href="/pricing" className="underline underline-offset-4 hover:text-ink">
            pricing page
          </Link>
          .
        </p>
      </SectionInView>
      </Section>

      <Section id="start">
        <SectionHeading>Start at BBS Mall</SectionHeading>
        <div className="mt-6 max-w-3xl space-y-4 text-base leading-relaxed text-secondary">
          {/*
            No "they will come to your shop" — nobody is on the floor to come
            (D5 is open), and a visit promised with no operator behind it is the
            same failure as a response time nobody owns (founder ruling
            2026-09-04, X-JOIN). The staffing model is stated as the design it
            is, from NODE_STAFFING_MODEL.
          */}
          <p>{NODE_STAFFING_MODEL}</p>
          <p>
            Today you set your shop up yourself, from your phone — a shop name is enough to
            start — and we are on WhatsApp and email while you do.
          </p>
        </div>
      </Section>

      <Section id="faq" tone="paper">
        <SectionHeading>Questions shop owners ask</SectionHeading>
        <FaqAccordion
          page="merchants"
          items={[
            {
              q: "Will this take customers who would have paid full price?",
              a: "You choose the deal, the discount and how many you will honour. Set ten and only ten are claimable. A deal is a decision you make each time, not a permanent price change.",
            },
            {
              q: "What if nobody claims my deal?",
              a: "Then it costs you nothing. There is no fee for publishing, and no penalty for a deal that does not move.",
            },
            {
              q: "Do I need a smartphone or a computer at the counter?",
              a: "A phone with a browser is enough. There is nothing to download and nothing to install on a till.",
            },
            {
              q: "How quickly do I get the money?",
              a: "Immediately. The customer pays you at your counter. MAANTA is never between you and the payment.",
            },
            {
              q: "What if I am busy and cannot honour a deal right then?",
              a: "Your staff can reject a code, and you are not charged. If it is going to be a busy day, end the deal early or do not publish one.",
            },
            {
              // The refund sentence ("credit you topped up yourself … is
              // refundable on request", released 2026-07-31 against Merchant
              // Terms 7.6) is withdrawn with the rest of the top-up mechanism
              // copy: there is no way to top up, so there is nothing it can be
              // true of yet. Restore it with the rail, not before.
              q: "Can I stop?",
              a: "Yes. End your deals and stop publishing. There is no notice period, no contract length and no exit fee.",
            },
            {
              q: "Who do I call when something goes wrong?",
              a: (
                <>
                  WhatsApp support, and agents in the mall. You are not filing a ticket and
                  waiting.{" "}
                  <a
                    href={ENTITY.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4 hover:text-ink"
                  >
                    Message us on WhatsApp
                  </a>
                  .
                </>
              ),
            },
          ]}
        />
      </Section>

      <CtaBand
        title="List your shop."
        body="A shop name is enough to start. You finish setting up on your phone."
        primary={{ label: "List your shop", href: "/merchants/join" }}
        secondary={{ label: "See pricing", href: "/pricing" }}
        reassurance={`No fee to join. No contract. ${fee} when a customer's code is verified at your counter.`}
      />
    </>
  );
}
