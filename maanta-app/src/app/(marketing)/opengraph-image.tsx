import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

/** OG image for `/`. Headline matches the page's copy deck. */
export const runtime = "edge";
export const alt = "Every deal in your mall, live on your phone.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "Every deal in your mall, live on your phone.",
    subline: "Claim on your phone. Show a 6-digit code at the counter.",
  });
}
