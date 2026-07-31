import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

/** OG image for `/shoppers`. Headline matches the page's copy deck. */
export const runtime = "edge";
export const alt = "The deals in your mall, before you get there.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "For shoppers",
    headline: "The deals in your mall, before you get there.",
    subline: "Free. No card. Nothing to download.",
  });
}
