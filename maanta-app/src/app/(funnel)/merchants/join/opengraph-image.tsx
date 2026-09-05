import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { FACTS } from "@/lib/marketing/facts";

/**
 * OG image for `/merchants/join` — the merchant sign-up itself, and the link a
 * shop owner is most likely to be sent directly rather than reaching through
 * `/merchants`.
 *
 * A nested route does not inherit its parent's image: `/merchants` has one and
 * `/merchants/join` did not, so the deeper page — the one with the form on it —
 * was the one unfurling blank.
 */
export const runtime = "edge";
export const alt = "List your shop in two fields.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "For merchants",
    headline: "List your shop in two fields.",
    subline: `Shop name and a phone number. You pay KES ${FACTS.successFeeKes} only when a code is verified at your counter.`,
  });
}
