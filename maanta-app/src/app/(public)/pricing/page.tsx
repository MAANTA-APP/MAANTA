import { formatKes } from "@/lib/ui";
import { SUCCESS_FEE_KES } from "@/lib/pricing";

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
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="text-center text-3xl font-black text-ink">Simple pricing</h1>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-6">
          <h2 className="text-lg font-bold text-ink">Standard</h2>
          <p className="mt-2 text-sm text-muted">
            1 standard deal · {fee} success fee per verified redemption
          </p>
          <p className="mt-6 text-3xl font-black text-ink">No monthly fee</p>
          <p className="mt-1 text-xs text-faint">
            you pay {fee} only when a redemption is verified
          </p>
        </div>
        <div className="rounded-card border-[3px] border-ink bg-ink p-6">
          <h2 className="text-lg font-bold text-brand">Elite</h2>
          <p className="mt-2 text-sm text-white/70">
            KES 3,500/mo + {fee}/redemption · 2 active deals · flash deals · boosts
          </p>
          <p className="mt-6 text-3xl font-black text-white">KES 3,500</p>
          <p className="mt-1 text-xs text-white/50">per month</p>
        </div>
      </div>
      <p className="mt-8 rounded-full bg-brand-tint px-5 py-3 text-center text-sm font-semibold text-ink">
        Launch offer: the first 100 BBS Mall merchants get a 30-day Elite trial
      </p>
      <p className="mt-2 text-center text-xs text-faint">
        The {fee} success fee still applies during the trial. After 30 days there is a
        7-day grace period, then the account stays on Standard unless you convert.
      </p>
    </main>
  );
}
