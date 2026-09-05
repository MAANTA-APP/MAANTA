import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { FACTS } from "@/lib/marketing/facts";
import { POTENTIAL_LOCATION_EYEBROW } from "@/lib/marketing/pilot-status";

/**
 * OG image for `/malls/bbs-mall` — the potential first location.
 *
 * The card names the mall only as a candidate, because an unfurled card
 * travels without the page that would qualify a stronger claim.
 */
export const runtime = "edge";
export const alt = `${FACTS.candidateMall} — a potential location for MAANTA's first Nairobi pilot.`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: POTENTIAL_LOCATION_EYEBROW,
    headline: `${FACTS.candidateMall}.`,
    subline: "A potential location for the first Nairobi pilot. Not confirmed.",
  });
}
