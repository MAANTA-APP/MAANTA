import Link from "next/link";
import { NodePill } from "@/components/marketing/acquisition";
import { DEMO_FEED_HREF, PILOT_STATUS_SENTENCE } from "@/lib/marketing/pilot-status";

/**
 * What a visitor sees on `/waitlist` and `/merchants/join` while the collection
 * gate is closed (D274). No form, no field, no "notify me" — a notify-me is
 * collection by another name.
 *
 * The wording (founder direction 2026-09-05): registration is temporarily
 * unavailable while the data-handling process is verified. That is the true
 * reason today — the form-safety gate found no in-product deletion path and a
 * draft privacy notice — and the collection gate stays closed until the
 * founder's separate decision to open it. Demo access is offered instead. No
 * amber: there is no collecting action to take.
 */
export const WAITLIST_UNAVAILABLE_MESSAGE =
  "Waitlist registration is temporarily unavailable while we verify the data-handling process.";
export const MERCHANT_UNAVAILABLE_MESSAGE =
  "Shop registration is temporarily unavailable while we verify the data-handling process.";

export function CollectionClosed({ audience }: { audience: "shopper" | "merchant" }) {
  const merchant = audience === "merchant";
  return (
    <section aria-labelledby="closed-title">
      <NodePill />
      <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Temporarily unavailable
      </p>
      <h1
        id="closed-title"
        className="mt-2 text-balance text-[26px] font-extrabold leading-[1.12] tracking-[-0.034em] text-ink lg:text-[32px]"
      >
        {merchant ? MERCHANT_UNAVAILABLE_MESSAGE : WAITLIST_UNAVAILABLE_MESSAGE}
      </h1>
      <p className="mt-3 text-pretty text-base leading-relaxed text-secondary lg:text-[17px]">
        {PILOT_STATUS_SENTENCE} Nothing is collected here until registration reopens. Demo access
        is available now.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={DEMO_FEED_HREF}
          className="inline-flex h-12 items-center justify-center rounded-pill border border-ink bg-white px-6 text-base font-semibold text-ink hover:bg-stone"
        >
          Explore demo deals
        </Link>
        <Link
          href={merchant ? "/merchants" : "/shoppers"}
          className="text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary"
        >
          See how it will work
        </Link>
        <Link href="/" className="text-sm font-bold text-ink underline underline-offset-4 hover:text-secondary">
          Back to site
        </Link>
      </div>
    </section>
  );
}
