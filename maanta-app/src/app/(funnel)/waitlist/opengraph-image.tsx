import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { FACTS } from "@/lib/marketing/facts";

/**
 * OG image for `/waitlist` — the pre-launch acquisition page, and the one most
 * likely to be shared before there is anything to redeem.
 *
 * The subline names the mall without asserting trading. `OG_STATUS_LINE` at the
 * foot of the image already carries the location while `DEMO_MODE` holds, so
 * this line stays about what the visitor is joining.
 */
export const runtime = "edge";
export const alt = "Be there when MAANTA opens.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "Waitlist",
    headline: "Be there when MAANTA opens.",
    subline: `Join as a shopper, a merchant, or a mall operator. Launching at ${FACTS.launchMall}.`,
  });
}
