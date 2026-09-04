import { ogImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/marketing/og";
import { SUPPORT_REPLY_LINE } from "@/lib/marketing/live-claims";

/**
 * OG image for `/help`.
 *
 * The subline reads `SUPPORT_REPLY_LINE` rather than restating it, for the same
 * reason the page body does: a support line that exists in three places will
 * eventually say three things, and this is the copy of it nobody re-reads. It
 * carried a reply time until 2026-09-04; none may be published now (X9).
 */
export const runtime = "edge";
export const alt = "Help, and a person who replies.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    eyebrow: "Help",
    headline: "Help, and a person who replies.",
    subline: SUPPORT_REPLY_LINE,
  });
}
