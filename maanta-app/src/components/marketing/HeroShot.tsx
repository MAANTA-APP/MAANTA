import { formatKes } from "@/lib/ui";
import { FACTS } from "@/lib/marketing/facts";

/**
 * Hero device mockup — the shopper feed, drawn rather than screenshotted.
 *
 * **This is an illustration, and it says so on the page.** The shops and prices
 * below are invented. That is a deliberate, founder-approved choice
 * (2026-08-01) and it is the one place on the marketing site where synthetic
 * deal rows render, which is why it carries a visible "Illustration" label and
 * an `alt`-equivalent description rather than passing silently as a capture.
 * Tracked as drift row **D49** — the demo-data banner is deliberately kept off
 * marketing routes on the premise that no synthetic rows render there, and this
 * component is the exception to that premise.
 *
 * Two things follow from that and must not be quietly dropped:
 *
 *  - **The label is not decoration.** Remove it and the hero becomes fabricated
 *    merchant offers presented as real, on the page that argues the product
 *    works. `marketing-hero-shot.test.ts` fails if it goes.
 *  - **No name here may be a real BBS Mall tenant.** Inventing a plausible
 *    Eastleigh shop is the risk this trades against; a name that collides with
 *    a real business turns an illustration into a claim about that business.
 *
 * Drawn in CSS rather than shipped as a PNG: it stays sharp at every density,
 * costs no image bytes on mall wifi, restyles with the tokens instead of going
 * stale the first time the feed changes, and needs no decision about whether a
 * capture of demo data can be committed to the repo.
 *
 * Frozen UI rules apply here as everywhere — it depicts the product. Money is
 * ink and never amber, the only amber is the live-status dot, and there is no
 * second amber action competing with the hero CTA beside it.
 */

/** Invented. See the docblock — no name here is a real BBS Mall tenant. */
const SAMPLE_DEALS = [
  {
    shop: "Riverside Fabrics",
    deal: "3 metres of cotton print",
    was: 2_000,
    now: 1_200,
    away: "40 m",
  },
  {
    shop: "Junction Shoes",
    deal: "Leather sandals",
    was: 1_400,
    now: 850,
    away: "1st floor",
  },
  {
    shop: "Amana Electronics",
    deal: "Wireless earbuds",
    was: 3_200,
    now: 2_400,
    away: "80 m",
  },
] as const;

export function HeroShot() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      {/*
        aria-hidden with a single visually-hidden description beside it: the
        mockup is dozens of decorative nodes, and letting a screen reader walk
        invented shop names one by one reads as a real product listing. One
        honest sentence is the accessible equivalent of an alt text.
      */}
      <p className="sr-only">
        Illustration of the MAANTA shopper feed showing example deals. The shops and
        prices shown are invented examples, not real offers.
      </p>

      <div
        aria-hidden="true"
        className="overflow-hidden rounded-[2rem] border border-line bg-stone shadow-modal"
      >
        {/* Device chrome — the shopper top bar, simplified. */}
        <div className="flex items-center justify-between border-b border-line/80 bg-stone/90 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-white px-2.5 py-1 text-[11px] font-semibold text-ink">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            {FACTS.launchMall.split(",")[0]}
          </span>
          <span className="text-[11px] font-medium text-muted">Deals near you</span>
        </div>

        <div className="space-y-2.5 p-3">
          {SAMPLE_DEALS.map((d) => (
            <div
              key={d.shop}
              className="flex gap-3 rounded-card border border-line bg-white p-2.5 shadow-card"
            >
              {/* Image placeholder. A drawn mockup should not pretend to
                  photography it does not have. */}
              <div className="h-14 w-14 shrink-0 rounded-xl bg-cream-dark" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-medium text-muted">{d.shop}</p>
                <p className="truncate text-[13px] font-bold leading-tight text-ink">
                  {d.deal}
                </p>
                <p className="mt-1 flex items-baseline gap-1.5">
                  {/* Money is ink, never amber — frozen rule 3. */}
                  <span className="tnum text-[13px] font-black text-ink">
                    {formatKes(d.now)}
                  </span>
                  <span className="tnum text-[11px] text-muted line-through">
                    {formatKes(d.was)}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-faint">{d.away}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/*
        The disclosure. Visible, adjacent to the thing it describes, and in the
        same visual weight as a caption rather than hidden behind a hover or an
        asterisk — a disclosure nobody reads is not a disclosure.
      */}
      <p className="mt-3 text-center text-[11px] leading-relaxed text-faint">
        Illustration · example shops and prices
      </p>
    </div>
  );
}
