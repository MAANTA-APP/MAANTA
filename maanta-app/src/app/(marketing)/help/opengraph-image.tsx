import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { RESPONSE_TIMES } from "@/lib/marketing/facts";

/**
 * OG image for `/help`.
 *
 * The subline reads the published commitment from `RESPONSE_TIMES` rather than
 * restating it, for the same reason the page body does: a support promise that
 * exists in three places will eventually say three things, and this is the copy
 * of it nobody re-reads.
 */
export const runtime = "edge";
export const alt = "Help, and a person who replies.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "Help",
    headline: "Help, and a person who replies.",
    subline: `WhatsApp answered ${RESPONSE_TIMES.whatsapp}. Email within ${RESPONSE_TIMES.form}.`,
  });
}
