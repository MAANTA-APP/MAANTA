import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

/** OG image for `/mall-operators`. Headline matches the page's copy deck. */
export const runtime = "edge";
export const alt = "Your mall runs hundreds of promotions a month.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "For mall operators",
    headline: "Your mall runs hundreds of promotions a month.",
    subline: "None of them are measured.",
  });
}
