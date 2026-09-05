import type { Metadata } from "next";
import { formatKes } from "@/lib/ui";
import { FACTS, NODE_TEAM, OFFERS, RESPONSE_TIMES, isOfferLive } from "@/lib/marketing/facts";
import { CtaBand, Section, SectionHeading } from "@/components/marketing/sections";
import { SectionInView, TrackedLink } from "@/components/marketing/tracked";
import { Eyebrow, LoopSteps, ReplyTimes } from "@/components/marketing/acquisition";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { MERCHANT_CTA_TITLE } from "@/lib/marketing/live-claims";

/**
 * `/merchants` — the merchant landing, as design board 1 draws it (founder
 * ruling 2026-09-05: as drawn). 301 target for `/for-merchants`.
 *
 * Economics up front: the fee, the two plan limits, the boost price with its
 * Elite qualifier, and "Pricing coming soon" for Elite — the founder's
 * 2026-08-24 ruling holds, and reintroducing a number fails
 * `pricing-copy.test.ts`. Every figure reads from `facts.ts`; this is the page
 * where a pricing inconsistency does the most damage.
 *
 * The one action is "Register your shop's interest" → `/merchants/join`, which
 * since board 2 is interest capture for the growth board (an agent walks the
 * unit), not self-serve onboarding. The illustrated counter walkthrough
 * (2026-08-16) is retired by the same ruling.
 *
 * "What we are not telling you" is the merchant page's version of the honest
 * status block: no shopper numbers, no neighbour pressure.
 */
export const metadata: Metadata = pageMetadata({
  path: "/merchants",
  title: "For merchants — MAANTA",
  description: `Get your shop ready for launch. Publish a deal from your phone and pay KES ${FACTS.successFeeKes} only when a shopper's code is verified at your counter. No listing fee, no cut of the sale, no monthly minimum.`,
  ogTitle: "You only pay when a customer walks in.",
  ogDescription: `Publish a deal from your phone. KES ${FACTS.successFeeKes} when a customer's code is verified at your counter.`,
});

const JOIN_HREF = "/merchants/join";

/** `2026-10-31` → `31 October 2026`. */
function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function MerchantsPage() {
  const fee = formatKes(FACTS.successFeeKes);
  const boost = formatKes(FACTS.boostPer24hKes);
  const creditLive = isOfferLive(OFFERS.openingCredit);
  const trialLive = isOfferLive(OFFERS.eliteTrial);
  const coveredRedemptions = Math.floor(OFFERS.openingCredit.amountKes / FACTS.successFeeKes);

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
          <Eyebrow>For shops at {FACTS.launchMall}</Eyebrow>
          <h1 className="mt-3 max-w-3xl text-balance text-[34px] font-extrabold leading-[1.05] tracking-[-0.034em] text-ink sm:text-5xl lg:text-[52px]">
            {MERCHANT_CTA_TITLE}
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-secondary sm:text-lg">
            Publish a deal from your phone. You pay only when a shopper actually walks in and
            redeems it — verified at your own counter.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <TrackedLink
              href={JOIN_HREF}
              name="Register your shop's interest"
              location="hero"
              className="inline-flex h-12 items-center justify-center rounded-pill bg-brand px-7 text-base font-semibold text-black shadow-card transition hover:brightness-95 active:brightness-90"
            >
              Register your shop&apos;s interest
            </TrackedLink>
            <span className="text-sm text-muted">Two minutes. No commitment, no card.</span>
          </div>
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
        The opening offer. Time-bound and gated: absent rather than stale once
        the date passes. The Elite trial sentence carries the cap, the node and
        the fee caveat, because the offer is all three and the database enforces
        the cap (pricing-copy.test.ts).
      */}
      {creditLive || trialLive ? (
        <Section id="offer" tone="paper">
          <SectionInView name="offer">
            <Eyebrow>Opening offer · until {longDate(OFFERS.openingCredit.expiresOn)}</Eyebrow>
            <SectionHeading>
              For the first {OFFERS.openingCredit.cohortShops} shops that join at {FACTS.launchMall}.
            </SectionHeading>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {creditLive ? (
                <div className="flex gap-5 rounded-card bg-white p-6 shadow-card">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-ink font-mono text-xl font-bold text-white">
                    {OFFERS.openingCredit.amountKes}
                  </span>
                  <div>
                    <p className="text-lg font-bold text-ink">
                      {formatKes(OFFERS.openingCredit.amountKes)} opening credit
                    </p>
                    <p className="mt-1 text-[15px] leading-relaxed text-secondary">
                      Covers your first {coveredRedemptions} verified redemptions.
                    </p>
                  </div>
                </div>
              ) : null}
              {trialLive ? (
                <div className="flex gap-5 rounded-card bg-white p-6 shadow-card">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-ink font-mono text-xl font-bold text-white">
                    {OFFERS.eliteTrial.days}
                  </span>
                  <div>
                    <p className="text-lg font-bold text-ink">
                      {OFFERS.eliteTrial.days} days of Elite, free
                    </p>
                    <p className="mt-1 text-[15px] leading-relaxed text-secondary">
                      {FACTS.eliteActiveDeals} active deals and boosts, with{" "}
                      {OFFERS.eliteTrial.postTrialGraceDays} days&apos; grace after. The {fee}{" "}
                      success fee still applies during the trial.
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
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
              body: "Price, photo, how long it runs. It appears in the feed for shoppers in your mall.",
            },
            {
              title: "Verify at the counter",
              body: `Your staff type the shopper's ${FACTS.codeLength} digits into their own screen. Give each person only the permissions they need — on every plan.`,
              after: (
                <ul className="flex flex-wrap gap-1.5" aria-label="Staff permissions">
                  {["Verify", "Deals", "Top-up", "Purchase"].map((p) => (
                    <li
                      key={p}
                      className="rounded-[6px] border border-line bg-stone px-2 py-1 font-mono text-[11px] font-semibold text-secondary"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              title: "Top up your wallet",
              body: "You get an M-Pesa prompt on your own handset and enter your PIN. No paybill number to remember, no till numbers to type.",
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
                { channel: "This form", time: RESPONSE_TIMES.form },
              ]}
            />
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-secondary">
              You do not have to work this out on your own. Every node has a team in the mall —
              a node manager and up to {NODE_TEAM.agentsMax} agents — who come to your unit, set
              you up, and stay until a real code has been verified at your counter.
            </p>
          </div>
          <div className="rounded-card bg-white p-6 shadow-card sm:p-8">
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">
              What we are not telling you
            </h2>
            <ul className="mt-5 flex flex-col gap-3 text-[15px] leading-relaxed text-secondary">
              <li>How many shoppers to expect. Nobody has redeemed a deal yet.</li>
              <li>Which other shops have signed. We will not use your neighbours as pressure.</li>
            </ul>
            <p className="mt-5 border-t border-line pt-5 text-[15px] leading-relaxed text-ink">
              <strong className="font-bold">What we will tell you:</strong> exactly what a redemption
              costs, before you publish anything.
            </p>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Be publishing on day one."
        body={`Register your interest and an agent will walk your unit with you before ${FACTS.nodeLabel} opens.`}
        primary={{ label: "Register your shop's interest", href: JOIN_HREF }}
        secondary={{ label: "See pricing", href: "/pricing" }}
        reassurance={`Not a contract. Nothing is charged until you publish a deal and a shopper redeems it — ${fee} per verified redemption.`}
      />
    </>
  );
}
