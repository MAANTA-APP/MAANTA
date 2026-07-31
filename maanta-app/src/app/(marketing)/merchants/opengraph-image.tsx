import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

/** OG image for `/merchants`. Headline matches the page's copy deck. */
export const runtime = "edge";
export const alt = "You only pay when a customer walks in.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "For merchants",
    headline: "You only pay when a customer walks in.",
    subline: "KES 30 per verified redemption. No listing fee, no cut of the sale.",
  });
}
