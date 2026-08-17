import { ImageResponse } from "next/og";
import { markDataUri, MARK_COLORS } from "@/lib/brand/mark";

/**
 * The iOS "Add to Home Screen" icon.
 *
 * **This file exists because that flow was broken.** The built HTML carried only
 * `<link rel="icon" href="/favicon.ico">` and `<link rel="icon" href="/icon.svg">`.
 * iOS Safari ignores the web manifest when adding to the Home Screen and looks
 * for `apple-touch-icon`; finding none, it screenshots the page and uses that.
 * So a shopper who installed MAANTA got a thumbnail of whatever page they were
 * on instead of the logo — on the launch surface the product tells people to
 * install. Next emits the `apple-touch-icon` link automatically for this route.
 *
 * 180×180 is the size current iPhones request. iOS applies its own rounding, so
 * the badge is drawn square-cornered here and rounded by the platform; drawing
 * our own radius as well would show a hairline of background in the corners.
 *
 * Generated rather than committed as a PNG on purpose: the geometry lives in
 * `@/lib/brand/mark`, so replacing the artwork is one edit and this icon follows.
 * A committed binary is a second copy that nothing checks.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          // iOS rounds the corners itself; a transparent gap would show through.
          background: MARK_COLORS.badge,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={markDataUri()} alt="" width={180} height={180} />
      </div>
    ),
    size
  );
}
