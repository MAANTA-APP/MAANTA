import type { Metadata } from "next";
import Link from "next/link";
import { formatKes } from "@/lib/ui";
import { FACTS } from "@/lib/marketing/facts";
import { FaqAccordion, Section, SectionHeading } from "@/components/marketing/sections";
import { JsonLd } from "@/components/marketing/JsonLd";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { PILOT_STATUS_SENTENCE } from "@/lib/marketing/pilot-status";
import { faqPageSchema, jsonLdDocument } from "@/lib/marketing/structured-data";
import { FIRST_RESULTS_ANSWER } from "@/lib/marketing/live-claims";

/**
 * `/faq` — restructured by audience (`website-footer-legal-docs-plan.md` §3:
 * "split into Shoppers / Merchants / Mall operators and source shared answers
 * from the same constants the pages use").
 *
 * Every number now reads from `facts.ts`. This page previously hardcoded
 * "KES 30" and "15-minute" as prose strings with no constant behind them — the
 * last place on the marketing site where a frozen number was typed rather than
 * imported, and the reason `/faq` was flagged as an open issue in the first
 * implementation report.
 *
 * Answers are kept consistent with the audience pages rather than reworded, so a
 * shopper who reads `/shoppers` `#faq` and then `/faq` is told the same thing
 * twice. Where the two would diverge, the audience page is the one to change.
 *
 * The two held claims stay held here too: no enforcement promise, and no
 * statement about what happens to a remaining wallet balance.
 */

export const metadata: Metadata = pageMetadata({
  path: "/faq",
  title: "FAQ — MAANTA",
  description:
    "Answers for shoppers, merchants and mall operators. What MAANTA costs, how a code is verified at the counter, and where the first Nairobi pilot stands.",
});

export default function FaqPage() {
  const fee = formatKes(FACTS.successFeeKes);
  const boost = formatKes(FACTS.boostPer24hKes);

  /**
   * The three groups are named rather than written inline so the `FAQPage`
   * markup below is generated from the same array the accordion renders. An
   * answer that exists twice — once for people, once for Google — is an answer
   * that will eventually say two different things, which is worse than no
   * markup at all.
   *
   * The three answers carrying a link supply `plain` for the same reason, since
   * schema.org needs a string: see `lib/marketing/structured-data.ts` for why
   * the text is duplicated deliberately instead of derived from the JSX.
   */
  const shopperFaqs = [
    {
      q: "Is it really free?",
      a: `Yes. Shops pay MAANTA a flat ${fee} when a code is verified at their counter. Shoppers pay nothing at any point.`,
    },
    {
      q: "Do I need to give card or M-Pesa details?",
      a: "No. MAANTA does not collect card details or process your payment. You pay the shop directly, using a payment method the shop accepts.",
    },
    {
      q: "Do I need to download an app?",
      a: (
        <>
          No — MAANTA runs in your browser. For a faster home-screen experience, see{" "}
          <Link href="/download" className="underline underline-offset-4 hover:text-ink">
            how to install it
          </Link>
          .
        </>
      ),
      plain:
        "No — MAANTA runs in your browser. For a faster home-screen experience, you can install it to your home screen.",
    },
    {
      q: "What's the grace period?",
      a: `A claimed code stays valid until the deal expires, plus a ${FACTS.graceMinutes}-minute grace period so you have time to reach the counter.`,
    },
    {
      q: "Do I need an account?",
      a: `Not to look around. To claim a deal you need a MAANTA account, so a ${FACTS.codeLength}-digit one-time code can be tied to one shopper and used once. For the controlled pilot, email is the primary sign-in method.`,
    },
    {
      q: "What if the shop will not honour it?",
      a: "Tell us. Every code is tied to a deal that shop published themselves, so we can see exactly what was promised. You are never charged either way.",
    },
  ];

  const merchantFaqs = [
    {
      q: "What is a success fee?",
      a: `Merchants pay ${fee} only when a customer's code is verified in-store. Expired or rejected codes cost nothing — there are no listing fees or commissions.`,
    },
    {
      q: "What does it cost per sale?",
      a: `Nothing beyond the ${fee}. The fee is the same whether the customer spends ${formatKes(200)} or ${formatKes(20_000)} — we do not take a percentage, and there is no monthly minimum.`,
    },
    {
      q: "What is the difference between Standard and Elite?",
      a: (
        <>
          Standard has {FACTS.standardActiveDeals} active deal and no monthly fee.
          Elite adds {FACTS.eliteActiveDeals} active deals, flash deals, and boosts at{" "}
          {boost} per {FACTS.boostHours}h; its monthly price is not set yet. The {fee}{" "}
          success fee applies on both.{" "}
          <Link href="/pricing" className="underline underline-offset-4 hover:text-ink">
            Full pricing
          </Link>
          .
        </>
      ),
      plain: `Standard has ${FACTS.standardActiveDeals} active deal and no monthly fee. Elite adds ${FACTS.eliteActiveDeals} active deals, flash deals, and boosts at ${boost} per ${FACTS.boostHours}h; its monthly price is not set yet. The ${fee} success fee applies on both.`,
    },
    {
      q: "Can my staff verify codes?",
      a: "Yes, on any plan. Add the people who work your counter and they verify codes with their own login — not your phone and not your password.",
    },
    {
      q: "How is the fee settled?",
      a: `The ${fee} success fee is recorded against your account when a code is verified. How fees are settled will be confirmed with pilot merchants before onboarding.`,
    },
    {
      q: "Can I stop?",
      a: "Yes. End your deals and stop publishing. There is no notice period, no contract length and no exit fee.",
    },
  ];

  const mallOperatorFaqs = [
    {
      q: "Where will the first pilot run?",
      a: `${PILOT_STATUS_SENTENCE} ${FACTS.candidateMallProse} is a potential location — not a confirmed partner or launch site.`,
    },
    {
      q: "Do we need to change our POS or our systems?",
      a: "No. There is no integration of any kind. Staff verify a code on a phone they already own.",
    },
    {
      q: "What does it cost the mall?",
      a: (
        <>
          Nothing. MAANTA earns the {fee} success fee from tenants only, and the mall
          is not billed at any point during a pilot.{" "}
          <Link
            href="/mall-operators"
            className="underline underline-offset-4 hover:text-ink"
          >
            How a node works
          </Link>
          .
        </>
      ),
      plain: `Nothing. MAANTA earns the ${fee} success fee from tenants only, and the mall is not billed at any point during a pilot.`,
    },
    {
      q: "How long before we see anything meaningful?",
      a: FIRST_RESULTS_ANSWER,
    },
  ];

  return (
    <>
      <JsonLd
        data={jsonLdDocument(
          faqPageSchema([...shopperFaqs, ...merchantFaqs, ...mallOperatorFaqs])
        )}
      />

      <Section>
        <h1 className="text-3xl font-black leading-tight text-ink sm:text-4xl">Questions</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-secondary">
          Grouped by who is asking. If yours is not here,{" "}
          <Link href="/contact" className="underline underline-offset-4 hover:text-ink">
            talk to us
          </Link>
          .
        </p>
      </Section>

      <Section id="shoppers" tone="paper">
        <SectionHeading eyebrow="For shoppers">Using MAANTA</SectionHeading>
        <FaqAccordion page="faq-shoppers" items={shopperFaqs} />
      </Section>

      <Section id="merchants">
        <SectionHeading eyebrow="For merchants">Listing your shop</SectionHeading>
        <FaqAccordion page="faq-merchants" items={merchantFaqs} />
      </Section>

      <Section id="mall-operators" tone="paper">
        <SectionHeading eyebrow="For mall operators">Running a node</SectionHeading>
        <FaqAccordion page="faq-mall-operators" items={mallOperatorFaqs} />
      </Section>
    </>
  );
}
