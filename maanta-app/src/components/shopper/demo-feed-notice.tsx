import Link from "next/link";
import { isDemoModeEnabled } from "@/lib/demo-mode";
import { DEMO_FEED_BANNER } from "@/lib/marketing/pilot-status";
import { unstable_noStore as noStore } from "next/cache";

/**
 * The demonstration feed's own disclosure, above the first deal.
 *
 * The layout's `DemoModeBanner` is a thin strip at the very top of the app
 * shell; this is the sentence the marketing site promises a visitor who taps
 * "Explore demo deals" — it names the feed as a demonstration, says nothing in
 * it can be redeemed, and gives an obvious route back to the site. It renders
 * before any deal, so the disclosure is on screen before a shopper can
 * interact with a card (founder direction 2026-09-05).
 *
 * Renders nothing when demo mode is off, so there is no launch-mode footprint
 * to remember to remove. `noStore()` for the same reason as the banner: the
 * flag is read per request, never baked in at build time.
 */
export async function DemoFeedNotice() {
  noStore();
  if (!(await isDemoModeEnabled())) return null;

  return (
    <section
      aria-label="Demonstration feed"
      className="mx-4 mb-3 mt-3 rounded-card border border-rust/30 bg-white p-4"
    >
      <p className="text-[13px] font-semibold leading-relaxed text-rust">{DEMO_FEED_BANNER}</p>
      <Link
        href="/"
        className="mt-2 inline-block text-[13px] font-bold text-ink underline underline-offset-4 hover:text-secondary"
      >
        Back to the MAANTA site
      </Link>
    </section>
  );
}
