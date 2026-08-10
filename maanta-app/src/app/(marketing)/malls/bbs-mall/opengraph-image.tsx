import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { FACTS } from "@/lib/marketing/facts";

/**
 * OG image for `/malls/bbs-mall` — the Node 0 page, linked from every footer.
 *
 * The subline states what the node is, not that it is trading: the page is
 * about a mall MAANTA is launching in, and the footer disclosure that would
 * qualify a stronger claim does not travel with an unfurled card.
 */
export const runtime = "edge";
export const alt = `${FACTS.launchMall} — MAANTA's launch mall.`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: FACTS.nodeLabel,
    headline: `${FACTS.launchMall}.`,
    subline: "The mall MAANTA opens in first. See what its shops are offering.",
  });
}
