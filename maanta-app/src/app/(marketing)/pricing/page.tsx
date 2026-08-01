import type { Metadata } from "next";
import { formatKes } from "@/lib/ui";
import { SUCCESS_FEE_KES } from "@/lib/pricing";
import { FACTS } from "@/lib/marketing/facts";
import { pageMetadata } from "@/lib/marketing/page-metadata";

/**
 * Authored metadata, replacing the root default this route used to inherit
 * (GAP-02) — it is in the primary nav and was the only nav destination without
 * its own title, description or canonical.
 *
 * Deliberately carries **no figures**. Every number on this page is rendered from
 * `SUCCESS_FEE_KES` or `FACTS`, and a price typed into a metadata string is a
 * second source that no guard reads at render time. The page body still owes the
 * Step 6a expansion and a page-specific `opengraph-image`.
 */
export const metadata: Metadata = pageMetadata({
  path: "/pricing",
  title: "Pricing — MAANTA",
  description:
    "Standard and Elite for shops on MAANTA. You pay the success fee only when a customer's code is verified at your counter — no listing fee, no cut of the sale.",
  ogTitle: "You pay when a customer walks in, not before.",
  ogDescription:
    "Standard and Elite plans for shops at BBS Mall, Eastleigh. No listing fee, no cut of the sale.",
});

/**
 * 12e Pricing — Standard vs Elite.
 *
 * Every number here is a public commercial promise, so it is either imported
 * from the single frozen constant (`SUCCESS_FEE_KES`) or stated in the exact
 * terms of the frozen "Launch offer" rule. Two things this page must never do:
 *
 *  1. Print "Free" as Standard's price. Standard has no subscription, but a
 *     Standard merchant still pays the success fee on every verified redemption
 *     — "Free" reads as "costs nothing" and is a forbidden framing.
 *  2. State the Elite trial without its qualifications. The frozen rule is
 *     capped and node-scoped ("first 100 BBS Mall merchants") and the success
 *     fee is still charged during the trial. Dropping either turns a bounded
 *     promo into an unbounded promise the product does not keep.
 *
 * Enforced by `src/lib/__tests__/pricing-copy.test.ts`.
 */
export default function PricingPage() {
  const fee = formatKes(SUCCESS_FEE_KES);
  const elite = formatKes(FACTS.elitePerMonthKes);
  const boost = formatKes(FACTS.boostPer24hKes);
  return (
    <div className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="text-center text-3xl font-black text-ink">Simple pricing</h1>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-6">
          <h2 className="text-lg font-bold text-ink">Standard</h2>
          <p className="mt-2 text-sm text-muted">
            {FACTS.standardActiveDeals} standard deal · {fee} success fee per verified
            redemption
          </p>
          <p className="mt-6 text-3xl font-black text-ink">No monthly fee</p>
          <p className="mt-1 text-xs text-faint">
            you pay {fee} only when a redemption is verified
          </p>
        </div>
        <div className="rounded-card border-[3px] border-ink bg-ink p-6">
          <h2 className="text-lg font-bold text-brand">Elite</h2>
          <p className="mt-2 text-sm text-white/70">
            {elite}/mo + {fee}/redemption · {FACTS.eliteActiveDeals} active deals · flash
            deals · boosts
          </p>
          <p className="mt-6 text-3xl font-black text-white">{elite}</p>
          <p className="mt-1 text-xs text-white/50">per month</p>
          {/*
            The boost price belonged here and was not stated on this page at all —
            it appeared only on /merchants, which is how the two pages came to
            disagree on both price and availability (drift D34). Boosts are an
            Elite feature, so the price belongs in the Elite card where the plan
            context is, not in a bullet a Standard merchant reads first.
          */}
          <p className="mt-3 border-t border-white/15 pt-3 text-xs text-white/50">
            Boosts {boost} per {FACTS.boostHours}h, charged from your wallet
          </p>
        </div>
      </div>
      <p className="mt-8 rounded-full bg-brand-tint px-5 py-3 text-center text-sm font-semibold text-ink">
        Launch offer: the first 100 BBS Mall merchants get a 30-day Elite trial
      </p>
      <p className="mt-2 text-center text-xs text-faint">
        The {fee} success fee still applies during the trial. After 30 days there is a
        7-day grace period, then the account stays on Standard unless you convert.
      </p>
    </div>
  );
}
