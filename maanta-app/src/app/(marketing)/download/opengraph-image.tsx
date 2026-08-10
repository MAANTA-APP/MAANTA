import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

/**
 * OG image for `/download`.
 *
 * The page every "get the app" link points at, and the one most likely to be
 * forwarded to someone standing in the mall. The subline states the thing that
 * surprises people — there is nothing to download.
 */
export const runtime = "edge";
export const alt = "Add MAANTA to your home screen.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "Install",
    headline: "Add MAANTA to your home screen.",
    subline: "No app store and nothing to download — it runs in your browser.",
  });
}
