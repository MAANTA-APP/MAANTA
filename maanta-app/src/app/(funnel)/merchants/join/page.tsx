import type { Metadata } from "next";
import { SUCCESS_FEE_KES } from "@/lib/pricing";
import { isWaitlistTestToken } from "@/lib/growth/waitlist-test-token";
import { collectionAllowed } from "@/lib/marketing/collection-gate";
import { CollectionClosed } from "@/components/funnel/collection-closed";
import { pageMetadata } from "@/lib/marketing/page-metadata";
import { FACTS, OFFERS, OFFER_CONFIRMATION_LINE, RESPONSE_TIMES, isOfferShown } from "@/lib/marketing/facts";

import { FunnelShell, NodeBadge } from "@/components/funnel/funnel-shell";
import { MerchantJoinForm } from "./join-form";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * `/merchants/join` — merchant interest (board 2, M6 and M7d).
 *
 * Founder ruling 2026-09-05: this page captures INTEREST for the growth board,
 * where it used to hand off into self-serve account onboarding. If a pilot is
 * agreed, a node team would walk the floor unit by unit, so the form asks for
 * the unit. Nothing is deployed anywhere yet, and the copy says so.
 * The onboarding path is still one link away for a shop that already has an
 * account.
 *
 * Reads `searchParams` for the TEST token, so the route is dynamic and its
 * metadata comes from `generateMetadata` — `check-server-forms` lists it under
 * the dynamic routes for that reason.
 */
export async function generateMetadata({ searchParams }: { searchParams?: Params }): Promise<Metadata> {
  const test = Boolean(first(searchParams?.test));
  return pageMetadata({
    path: "/merchants/join",
    title: "Register your shop — MAANTA",
    description: `Register your shop's details for the first Nairobi pilot. No listing fee and no cut of the sale — you pay KES ${SUCCESS_FEE_KES} only when a customer's code is verified at your counter. Pilot location to be confirmed.`,
    ...(test ? { robots: { index: false, follow: false } } : {}),
  });
}

export default function MerchantJoinPage({ searchParams }: { searchParams?: Params }) {
  const testToken = first(searchParams?.test) ?? "";
  const isTest = isWaitlistTestToken(testToken);
  const creditLive = isOfferShown(OFFERS.openingCredit);
  const trialLive = isOfferShown(OFFERS.eliteTrial);

  // The collection gate (D274). Same rule as /waitlist: closed means no form;
  // a verified test entry still passes.
  if (!collectionAllowed(isTest)) {
    return (
      <FunnelShell back={{ href: "/merchants", label: "Back to merchants" }}>
        <CollectionClosed audience="merchant" />
      </FunnelShell>
    );
  }

  return (
    <FunnelShell
      back={{ href: "/merchants", label: "Back to merchants" }}
      test={isTest}
      aside={<MerchantAside creditLive={creditLive} trialLive={trialLive} />}
    >
      <MerchantJoinForm
        testToken={testToken}
        isTest={isTest}
        offer={{
          creditLive,
          trialLive,
          creditUntil: OFFER_CONFIRMATION_LINE,
        }}
      />
    </FunnelShell>
  );
}

/**
 * "What you are signing up to." Every number reads from `facts.ts`; the two
 * offers render only while `isOfferShown` says so, framed as planned.
 */
function MerchantAside({ creditLive, trialLive }: { creditLive: boolean; trialLive: boolean }) {
  const coveredRedemptions = Math.floor(OFFERS.openingCredit.amountKes / SUCCESS_FEE_KES);
  return (
    <div>
      <div className="mb-7">
        <NodeBadge />
      </div>
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
        What you are signing up to
      </p>
      <p className="mt-4 text-[44px] font-extrabold leading-none tracking-[-0.04em] text-white">
        KES {SUCCESS_FEE_KES}
      </p>
      <p className="mt-1 text-lg text-white/85">per verified redemption</p>
      <p className="mt-1 text-[15px] text-white/60">A deal nobody redeems costs you nothing.</p>

      {creditLive || trialLive ? (
        <ul className="mt-8 flex flex-col gap-4 border-t border-white/15 pt-6">
          {creditLive ? (
            <li>
              <p className="text-[15px] font-bold text-white">
                KES {OFFERS.openingCredit.amountKes} MAANTA fee credit · planned pilot offer
              </p>
              <p className="mt-0.5 text-sm leading-snug text-white/60">
                For the first {OFFERS.openingCredit.cohortShops} eligible shops in the first confirmed
                pilot. Covers {coveredRedemptions} verified redemptions. {OFFER_CONFIRMATION_LINE}.
              </p>
            </li>
          ) : null}
          {trialLive ? (
            <li>
              <p className="text-[15px] font-bold text-white">
                {OFFERS.eliteTrial.days} days of Elite access · planned pilot offer
              </p>
              <p className="mt-0.5 text-sm leading-snug text-white/60">
                {FACTS.eliteActiveDeals} active deals and boosts, {OFFERS.eliteTrial.postTrialGraceDays}{" "}
                days&apos; grace after.
              </p>
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-8 border-t border-white/15 pt-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
          When we reply
        </p>
        <dl className="mt-3 flex flex-col gap-2 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-white/70">WhatsApp</dt>
            <dd className="font-semibold text-white">{RESPONSE_TIMES.whatsapp}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-white/70">This form</dt>
            <dd className="font-semibold text-white">{RESPONSE_TIMES.form}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
