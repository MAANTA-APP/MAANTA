import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { FACTS } from "@/lib/marketing/facts";

/**
 * OG image for `/merchants`. Headline matches the page's copy deck.
 *
 * The fee reads from `FACTS`, like every other rendered number. An OG image is
 * still rendered output — arguably the most quoted output on the site, since it
 * is what gets pasted into WhatsApp — and a literal here would have survived a
 * change to the frozen fee silently, in the one surface nobody re-reads.
 */
export const runtime = "edge";
export const alt = "You only pay when a customer walks in.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "For merchants",
    headline: "You only pay when a customer walks in.",
    subline: `KES ${FACTS.successFeeKes} per verified redemption. No fee to join, no share of your sale.`,
  });
}
