import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { FACTS } from "@/lib/marketing/facts";

/**
 * OG image for `/pricing`. Headline matches the page's `ogTitle`.
 *
 * `/pricing` and `/merchants/join` are the two commercial conversion pages, and
 * both shipped with `twitter:card=summary_large_image` and no image behind it —
 * an empty card, on the surface a merchant is most likely to be sent in a
 * WhatsApp forward.
 *
 * The fee reads from `FACTS` for the same reason it does on `/merchants`: an OG
 * image is rendered output nobody re-reads, so a literal here would outlive a
 * change to the frozen fee.
 */
export const runtime = "edge";
export const alt = "You pay when a customer walks in, not before.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "Pricing",
    headline: "You pay when a customer walks in, not before.",
    subline: `KES ${FACTS.successFeeKes} per verified redemption on every plan. No fee to join, no share of your sale.`,
  });
}
