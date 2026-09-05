import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { PILOT_SHORT_LINE } from "@/lib/marketing/pilot-status";

/** OG image for `/`. Headline matches the page's copy deck. */
export const runtime = "edge";
export const alt = "Find real offers from Nairobi shops before you make the trip.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "Find real offers from Nairobi shops before you make the trip.",
    subline: PILOT_SHORT_LINE,
  });
}
