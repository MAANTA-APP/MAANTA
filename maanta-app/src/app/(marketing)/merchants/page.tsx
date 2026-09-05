import type { Metadata } from "next";
import { formatKes } from "@/lib/ui";
import {
  FACTS,
  NODE_TEAM,
  OFFERS,
  OFFER_CONFIRMATION_LINE,
  OFFER_EYEBROW,
  OFFER_HEADING,
  RESPONSE_TIMES,
  isOfferShown,
} from "@/lib/marketing/facts";
import { CtaBand, Section, SectionHeading } from "@/components/marketing/sections";
import { SectionInView, TrackedLink } from "@/components/marketing/tracked";
import { Eyebrow, LoopSteps, ReplyTimes } from "@/components/marketing/acquisition";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { DEMO_FEED_HREF, PILOT_STATUS_SENTENCE, pilotBookingAction } from "@/lib/marketing/pilot-status";

/**
 * `/merchants` — the merchant landing, repositioned for the Nairobi pilot
 * (founder direction 2026-09-05). 301 target for `/for-merchants`.
 *
 * Economics up front: the fee, the two plan limits, the boost price with its
 * Elite qualifier, and "Pricing coming soon" for Elite — the founder's
 * 2026-08-24 ruling holds, and reintroducing a number fails
 * `pricing-copy.test.ts`. Every figure reads from `facts.ts`.
 *
 * One amber action: "Join the merchant waitlist" → the pilot-interest form
 * with the audience preselected. "Explore demo deals" is secondary and the
 * pilot conversation is tertiary. `/merchants/join` — the unit-level
 * registration for once a pilot is confirmed — stays reachable as a text link.
 *
 * Wallet top-up by M-Pesa or card is **not** described as available: it is
 * not operational. The three merchant steps are publish, verify, review.
 * The opening offer is framed as planned, with no date.
 */
export const metadata: Metadata = pageMetadata({
  path: "/merchants",
  title: "For shops in Nairobi — MAANTA",
  description: `Publish a time-limited deal from your phone. A fee of KES ${FACTS.successFeeKes} applies only when a shopper's one-time code is successfully verified at your counter. No listing fee, no cut of the sale. Nairobi pilot, location to be confirmed.`,
  ogTitle: "Turn an offer into a verified visit.",
  ogDescription: `Publish a deal from your phone. KES ${FACTS.successFeeKes} only when a shopper's code is verified at your counter.`,
});

const MERCHANT_WAITLIST_HREF = "/waitlist?role=merchant";
const REGISTER_HREF = "/merchants/join";

export default function MerchantsPage() {
  const fee = formatKes(FACTS.successFeeKes);
  const boost = formatKes(FACTS.boostPer24hKes);
  const creditShown = isOfferShown(OFFERS.openingCredit);
  const trialShown = isOfferShown(OFFERS.eliteTrial);
  const coveredRedemptions = Math.floor(OFFERS.openingCredit.amountKes / FACTS.successFeeKes);
  const booking = pilotBookingAction();

  const priceRows = [
    { label: "Active deals — Standard", value: String(FACTS.standardActiveDeals) },
    { label: "Active deals — Elite", value: String(FACTS.eliteActiveDeals) },
    {
      label: (
        <>
          Boost a deal for {FACTS.boostHours} hours <span className="text-muted">· Elite only</span>
        </>
      ),
      value: boost,
    },
    { label: "Elite subscription", value: "Pricing coming soon" },
  ] as const;

  return (
    <>
      <section className="bg-stone">
        <div className="mx-auto max-w-5xl px-5 py-12 sm:py-20">
          <Eyebrow>For shops in Nairobi</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-balance text-[34px] font-extrabold leading-[1.05] tracking-[-0.034em] text-ink sm:text-5xl lg:text-[52px]">
            Turn an offer into a verified visit.
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-secondary sm:text-lg">
            Publish a time-limited deal from your phone. A fee applies only when a shopper&apos;s
            one-time code is successfully verified at your counter.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
            <TrackedLink
              href={MERCHANT_WAITLIST_HREF}
              name="Join the merchant waitlist"
              location="hero"
              className="inline-flex h-12 items-center justify-center rounded-pill bg-brand px-7 text-base font-semibold text-black shadow-card transition hover:brightness-95 active:brightness-90"
            >
              Join the merchant waitlist
            </TrackedLink>
            <TrackedLink
              href={DEMO_FEED_HREF}
              name="Explore demo deals"
              location="hero"
              className="inline-flex h-12 items-center justify-center rounded-pill border border-ink bg-white px-6 text-base font-semibold text-ink transition hover:bg-stone"
            >
              Explore demo deals
            </TrackedLink>
            <TrackedLink
              href={booking.href}
              name={booking.label}
              location="hero"
              external={booking.external}
              className="text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
            >
              {booking.label} →
            </TrackedLink>
          </div>
          <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-muted">{PILOT_STATUS_SENTENCE}</p>
        </div>
      </section>

      <Section id="cost">
        <SectionInView name="cost">
          <Eyebrow>What it costs</Eyebrow>
          <SectionHeading>One fee, and only when it works.</SectionHeading>
          <div className="mt-8 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-10">
            <div className="rounded-card bg-ink p-6 text-white sm:p-8">
              <p className="text-[44px] font-extrabold leading-none tracking-[-0.04em]">{fee}</p>
              <p className="mt-2 text-lg text-white/85">per verified redemption</p>
              <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                Same on every plan. A deal nobody redeems costs you nothing.
              </p>
            </div>
            <div>
              <dl className="divide-y divide-line rounded-card bg-white shadow-card">
                {priceRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
                    <dt className="text-[15px] text-secondary">{row.label}</dt>
                    <dd className="text-[15px] font-bold text-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-sm leading-relaxed text-muted">
                We are not putting a monthly price on Elite before there is real merchant evidence
                of what MAANTA is worth to you.
              </p>
            </div>
          </div>
        </SectionInView>
      </Section>

      {/*
        The planned pilot opening offer. Framed as planned, with no date: it is
        not currently redeemable or contractually available, and final
        eligibility and dates are confirmed before onboarding.
      */}
      {creditShown || trialShown ? (
        <Section id="offer" tone="paper">
          <SectionInView name="offer">
            <Eyebrow>{OFFER_EYEBROW}</Eyebrow>
            <SectionHeading>{OFFER_HEADING}</SectionHeading>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {creditShown ? (
                <div className="flex gap-5 rounded-card bg-white p-6 shadow-card">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-ink font-mono text-xl font-bold text-white">
                    {OFFERS.openingCredit.amountKes}
                  </span>
                  <div>
                    <p className="text-lg font-bold text-ink">
                      {formatKes(OFFERS.openingCredit.amountKes)} MAANTA fee credit
                    </p>
                    <p className="mt-1 text-[15px] leading-relaxed text-secondary">
                      Covers the first {coveredRedemptions} verified redemptions at {fee} each.
                    </p>
                  </div>
                </div>
              ) : null}
              {trialShown ? (
                <div className="flex gap-5 rounded-card bg-white p-6 shadow-card">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-ink font-mono text-xl font-bold text-white">
                    {OFFERS.eliteTrial.days}
                  </span>
                  <div>
                    <p className="text-lg font-bold text-ink">{OFFERS.eliteTrial.days} days of Elite access</p>
                    <p className="mt-1 text-[15px] leading-relaxed text-secondary">
                      For the first {OFFERS.eliteTrial.cohortShops} eligible shops.{" "}
                      {FACTS.eliteActiveDeals} active deals and boosts, with{" "}
                      {OFFERS.eliteTrial.postTrialGraceDays} days&apos; grace after. The {fee}{" "}
                      success fee still applies during the trial.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            <p className="mt-5 text-[15px] leading-relaxed text-secondary">{OFFER_CONFIRMATION_LINE}.</p>
            <TrackedLink
              href={MERCHANT_WAITLIST_HREF}
              name="Join the merchant waitlist"
              location="offer"
              className="mt-4 inline-block text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
            >
              Join the merchant waitlist →
            </TrackedLink>
          </SectionInView>
        </Section>
      ) : null}

      <Section id="runs">
        <Eyebrow>How your shop runs it</Eyebrow>
        <SectionHeading lead="No till hardware, no printer, no separate device to keep charged.">
          Three things, all from a phone.
        </SectionHeading>
        <LoopSteps
          columns={3}
          steps={[
            {
              title: "Publish a deal",
              body: "Add a price, photo, quantity and expiry from your phone.",
            },
            {
              title: "Verify at the counter",
              body: "Staff enter the shopper's one-time code. A successful verification records the redemption.",
            },
            {
              title: "Review what moved",
              body: "See which deals produced verified counter visits.",
            },
          ]}
        />
      </Section>

      <Section id="reply" tone="paper">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <SectionHeading>When we&apos;ll get back to you</SectionHeading>
            <ReplyTimes
              rows={[
                { channel: "WhatsApp", time: RESPONSE_TIMES.whatsapp },
                { channel: "The contact form", time: RESPONSE_TIMES.form },
              ]}
            />
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-secondary">
              If a pilot is agreed, you would not have to work this out on your own. A node is
              designed to run with a node manager and up to {NODE_TEAM.agentsMax} agents who
              would come to your unit, set you up, and stay until a real code has been verified
              at your counter. Nobody is deployed anywhere yet.
            </p>
          </div>
          <div className="rounded-card bg-white p-6 shadow-card sm:p-8">
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">
              What we are not telling you
            </h2>
            <ul className="mt-5 flex flex-col gap-3 text-[15px] leading-relaxed text-secondary">
              <li>How many shoppers to expect. Nobody has redeemed a deal yet.</li>
              <li>Which other shops have signed. We will not use your neighbours as pressure.</li>
              <li>Where or when the pilot opens. Neither has been confirmed.</li>
            </ul>
            <p className="mt-5 border-t border-line pt-5 text-[15px] leading-relaxed text-ink">
              <strong className="font-bold">What we will tell you:</strong> exactly what a redemption
              costs, before you publish anything.
            </p>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Be publishing on day one of the pilot."
        body="Join the merchant waitlist for one message when a confirmed pilot location and opening date are ready."
        primary={{ label: "Join the merchant waitlist", href: MERCHANT_WAITLIST_HREF }}
        secondary={{ label: "See pricing", href: "/pricing" }}
        reassurance={
          <>
            Not a contract. Nothing is charged until you publish a deal and a shopper redeems it —{" "}
            {fee} per verified redemption. Have a specific unit to register?{" "}
            <TrackedLink
              href={REGISTER_HREF}
              name="Register your shop's details"
              location="cta"
              className="underline underline-offset-4 hover:text-white"
            >
              Register your shop&apos;s details
            </TrackedLink>
            .
          </>
        }
      />
    </>
  );
}
