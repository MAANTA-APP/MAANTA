import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { NODE_OG_SUBLINE } from "@/lib/marketing/live-claims";

/** OG image for `/about`. Headline matches the page's copy deck. */
export const runtime = "edge";
export const alt = "What MAANTA is, and how it makes money.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "About",
    headline: "What MAANTA is, and how it makes money.",
    subline: NODE_OG_SUBLINE,
  });
}
