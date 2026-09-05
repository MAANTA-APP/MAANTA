import type { Metadata } from "next";
import { formatKes } from "@/lib/ui";
import { SUCCESS_FEE_KES } from "@/lib/pricing";
import { FACTS, OFFERS, PLAN_AVAILABILITY, isOfferShown, OFFER_CONFIRMATION_LINE, OFFER_EYEBROW, OFFER_HEADING } from "@/lib/marketing/facts";
import { IconCheck } from "@/components/ui/icons";
import { CtaBand, Section } from "@/components/marketing/sections";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { MERCHANT_CTA_TITLE } from "@/lib/marketing/live-claims";


/**
 * 12e Pricing — Standard vs Elite.
 *
 * Every number here is a public commercial promise, so it is either imported
 * from the single frozen constant (`SUCCESS_FEE_KES`) or read from
 * `lib/marketing/facts.ts`. Two things this page must never do:
 *
 *  1. Print "Free" as Standard's price. Standard has no subscription, but a
 *     Standard merchant still pays the success fee on every verified redemption
 *     — "Free" reads as "costs nothing" and is a forbidden framing.
 *  2. State the Elite trial without its qualifications. The frozen rule is
 *     capped and node-scoped, and the success fee is still charged during the
 *     trial. Dropping either turns a bounded promo into an unbounded promise.
 *
 * Enforced by `src/lib/__tests__/pricing-copy.test.ts`.
 *
 * **Both plans state the success fee on the card.** The old layout put the fee
 * in Standard's small print and left Elite showing a bare monthly price, which
 * reads as "Elite is the paid plan, so the fee is included". It is not — the fee
 * is identical on both plans, and that is the whole pricing model. A merchant
 * who learns this after signing up learns it as something withheld.
 *
 * **The accent is spent on the action, not on the plan name.** This page
 * previously had amber on the Elite heading and an amber-tinted offer banner,
 * and no call to action anywhere — the accent decorated a page a merchant could
 * not act on. Amber is now on one CTA, which is the frozen rule.
 *
 * **The launch offer is gated and single-sourced** (drift D51). `/merchants`
 * already read it from `OFFERS.eliteTrial` and hid it once expired; this page
 * typed the numbers and stated it unconditionally, so the two would have
 * disagreed the day the offer closed.
 */

export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "Pricing — MAANTA",
  description: `Two plans, one fee. Every plan pays KES ${SUCCESS_FEE_KES} when a customer's code is verified at your counter. No listing fee, no cut of the sale, no monthly minimum.`,
  ogTitle: "You pay when a customer walks in, not before.",
  ogDescription: `Standard and Elite for shops in the Nairobi pilot. The success fee is the same on both plans; the plan decides how many deals you can run.`,
});

/**
 * One feature row. The icon carries the meaning, never colour alone.
 *
 * **The tick is neutral, not `text-verified`.** It was the success green on the
 * Standard card and `text-white/60` on Elite, which was wrong twice over. First,
 * the same element rendered in two different colours, so two identical lists read
 * as two different kinds of thing — the green was only ever chosen because green
 * on the dark card would have been unreadable, which is a contrast workaround
 * driving a semantic decision. Second, `verified` is the **status-success** token
 * (`#0A5C34`), and "1 active deal at a time" is a plan feature, not a success
 * state. Spending a status colour on a bullet is how the token stops meaning
 * anything where it does carry state — a redemption verified at a counter.
 *
 * Both tones now sit one step lighter than the body text beside them, which is
 * what a list marker should do: `text-muted` against `text-secondary` on white,
 * `text-white/60` against `text-white/80` on ink. Same relationship, same
 * meaning, no colour doing work the glyph already does.
 *
 * **No size class here, deliberately — see drift D54.** This passed
 * `h-4 w-4 shrink-0`, and none of it did anything: `Svg` in
 * `@/components/ui/icons` applies `cn("h-5 w-5 shrink-0", className)`, `cn()` is
 * a plain join with no Tailwind conflict resolution, and `h-5` wins the cascade.
 * The tick measured 20px while the code asked for 16px. Passing a size that is
 * silently discarded is worse than passing none, because the next reader trusts
 * it. The icon renders at its 20px default and the code now says so.
 */
function Feature({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <li className="flex gap-2.5">
      <IconCheck className={`mt-0.5 ${tone === "light" ? "text-white/60" : "text-muted"}`} />
      <span
        className={`text-sm leading-relaxed ${tone === "light" ? "text-white/80" : "text-secondary"}`}
      >
        {children}
      </span>
    </li>
  );
}

export default function PricingPage() {
  const fee = formatKes(SUCCESS_FEE_KES);
  const boost = formatKes(FACTS.boostPer24hKes);
  const trial = OFFERS.eliteTrial;
  const trialLive = isOfferShown(trial);

  return (
    <>
      <Section className="border-b border-line">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Pricing</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-black leading-[1.1] text-ink sm:text-4xl">
          One fee. Two plans. No cut of your sale.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-secondary sm:text-lg">
          Every plan pays {fee} when a shopper&apos;s code is verified at your counter. The
          plan decides how many deals you can run — never what a redemption costs.
        </p>

        <div className="mt-10 grid items-start gap-5 lg:grid-cols-2">
          {/* Standard */}
          <div className="rounded-card bg-white p-6 shadow-card sm:p-7">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Standard</h2>
            <p className="mt-4 text-3xl font-black leading-none text-ink">No monthly fee</p>
            {/*
              The fee sits directly under the price on both cards, in the same
              position and the same words, so the two are read as one number
              rather than compared as different offers.
            */}
            <p className="mt-2 text-sm font-semibold text-ink">
              {fee} per verified redemption
            </p>
            <p className="mt-1 text-xs leading-relaxed text-faint">
              Charged from your wallet when staff verify a code. A code that expires or is
              rejected costs nothing.
            </p>
            <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
              <Feature>
                {FACTS.standardActiveDeals} active deal at a time
              </Feature>
              <Feature>
                Staff accounts with their own permissions
                {PLAN_AVAILABILITY.staff === "all" ? " — on every plan" : null}
              </Feature>
              <Feature>Staff verify codes on a phone they already own</Feature>
              <Feature>No listing fee, no percentage of the sale, no monthly minimum</Feature>
            </ul>
          </div>

          {/* Elite — dark, so it reads as the upgrade without spending the accent. */}
          <div className="rounded-card border border-ink bg-ink p-6 shadow-card sm:p-7">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white/60">Elite</h2>
            {/* Elite's monthly price is deliberately absent — founder ruling
                2026-08-24. It is not set, and publishing a number before there is
                merchant evidence anchors both sides to a figure nobody has tested.
                The success fee below is NOT affected and stays explicit. */}
            <p className="mt-4 text-2xl font-black leading-none text-white">
              Pricing coming soon
            </p>
            <p className="mt-2 text-sm font-semibold text-white">
              {fee} per verified redemption, the same as Standard
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/50">
              The fee is the same on both plans. Elite buys capacity, not a cheaper
              redemption.
            </p>
            <ul className="mt-6 space-y-2.5 border-t border-white/15 pt-5">
              <Feature tone="light">Everything in Standard</Feature>
              <Feature tone="light">
                {FACTS.eliteActiveDeals} active deals at a time
              </Feature>
              <Feature tone="light">Flash deals — short windows, top of the feed</Feature>
              {/*
                The boost price belongs in the Elite card: boosts raise
                BOOST_ELITE_ONLY for any non-Elite merchant (migration
                20260715194145), and stating the price outside the plan context is
                how /pricing and /merchants came to disagree (drift D34).
              */}
              <Feature tone="light">
                Boosts — {boost} per {FACTS.boostHours}h, charged from your wallet
              </Feature>
            </ul>
          </div>
        </div>
      </Section>

      {/*
        Time-bound, and gated the same way /merchants gates it (D51). When
        `expiresOn` passes this block disappears rather than promising a closed
        offer. The cap, the node and the fee caveat are all stated, which
        pricing-copy.test.ts requires of any page that mentions the trial.
      */}
      {trialLive ? (
        <Section tone="paper">
          <h2 className="text-2xl font-black text-ink sm:text-3xl">{OFFER_EYEBROW}</h2>
          <div className="mt-4 max-w-3xl space-y-3 text-base leading-relaxed text-secondary">
            <p>
              {OFFER_HEADING} The first {trial.cohortShops} eligible shops would get {trial.days}{" "}
              days of Elite access, at no monthly cost. {OFFER_CONFIRMATION_LINE}.
            </p>
            <p className="text-ink">
              The {fee} success fee still applies throughout the trial. When the{" "}
              {trial.days} days end there is a {trial.postTrialGraceDays}-day grace period,
              then the account stays on Standard unless you convert.
            </p>
          </div>
        </Section>
      ) : null}

      <CtaBand
        title={MERCHANT_CTA_TITLE}
        body="No listing fee to join, and nothing to pay until a shopper's code is verified at your counter."
        primary={{ label: "Join the merchant waitlist", href: "/waitlist?role=merchant" }}
        secondary={{ label: "How it works at your counter", href: "/merchants#counter" }}
      />
    </>
  );
}
