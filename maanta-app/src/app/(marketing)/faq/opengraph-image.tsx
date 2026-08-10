import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

/**
 * OG image for `/faq`.
 *
 * The FAQ is the page most often sent as an answer to a specific question —
 * "what does it actually cost?" — so it is shared more than its traffic
 * suggests, and it was unfurling as an empty card.
 */
export const runtime = "edge";
export const alt = "Questions, answered.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "FAQ",
    headline: "Questions, answered.",
    subline: "For shoppers, for merchants, and for mall operators.",
  });
}
