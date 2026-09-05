import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";

/** OG image for `/contact`. Headline matches the page's copy deck. */
export const runtime = "edge";
export const alt = "Talk to us.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "Contact",
    headline: "Talk to us.",
    subline: "WhatsApp, email, and a person who replies.",
  });
}
