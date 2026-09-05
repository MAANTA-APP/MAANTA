import Link from "next/link";
import { NodePill } from "@/components/marketing/acquisition";
import { FACTS } from "@/lib/marketing/facts";
import { NODE_PRESENCE_LEAD } from "@/lib/marketing/live-claims";

/**
 * What a visitor sees on `/waitlist` and `/merchants/join` while the collection
 * gate is closed (D274). No form, no field, no "notify me" — a notify-me is
 * collection by another name. It says plainly that nothing is being taken yet
 * and points at the pages that explain the product. No amber: there is no
 * action to take.
 */
export function CollectionClosed({ audience }: { audience: "shopper" | "merchant" }) {
  const merchant = audience === "merchant";
  return (
    <section aria-labelledby="closed-title">
      <NodePill />
      <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Not open yet
      </p>
      <h1
        id="closed-title"
        className="mt-2 text-balance text-[30px] font-extrabold leading-[1.08] tracking-[-0.034em] text-ink lg:text-[36px]"
      >
        {merchant ? "We\u2019re not registering shops yet." : "We\u2019re not taking names yet."}
      </h1>
      <p className="mt-3 text-pretty text-base leading-relaxed text-secondary lg:text-[17px]">
        {NODE_PRESENCE_LEAD} {FACTS.launchMall}.{" "}
        {merchant
          ? `Before ${FACTS.nodeLabel} opens, an agent will walk the floor unit by unit. Interest registration opens with that, and not before.`
          : `We will open the waitlist when we are ready to send the first message, and not before.`}{" "}
        Nothing is collected here until then.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Link
          href={merchant ? "/merchants" : "/shoppers"}
          className="inline-flex h-12 items-center justify-center rounded-pill border border-ink bg-white px-6 text-base font-semibold text-ink hover:bg-stone"
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
