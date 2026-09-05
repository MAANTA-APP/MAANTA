import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

/**
 * OG image for `/waitlist` — the pre-launch acquisition page, and the one most
 * likely to be shared before there is anything to redeem.
 *
 * The subline names no mall: the pilot location is not confirmed. `OG_STATUS_LINE`
 * at the foot of the image carries the pilot status while `DEMO_MODE` holds.
 */
export const runtime = "edge";
export const alt = "Be there when Nairobi's first MAANTA shops switch on.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "Waitlist",
    headline: "Be there when Nairobi's first MAANTA shops switch on.",
    subline: "One message when a pilot location and opening date are confirmed.",
  });
}
