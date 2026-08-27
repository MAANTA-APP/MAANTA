"use client";

import { QRCodeSVG } from "qrcode.react";

/**
 * The merchant's counter QR, rendered locally as inline SVG.
 *
 * ## What this code is, and is not
 *
 * It encodes exactly one thing: the shop's `/qr/<token>` check-in URL. The
 * token identifies the merchant and AUTHORIZES NOTHING — scanning it records
 * an arrival and, when the shopper has a live claim, puts them on the staff
 * queue. It cannot redeem, cannot charge, and cannot award Points: those
 * require staff to verify the 6-digit code through the keypad, which is
 * untouched by anything here.
 *
 * ONE token per merchant, deliberately (founder ruling, PR C): the same sheet
 * goes at the entrance and at the till. The shopper's own state — no claim,
 * one claim, several, already checked in — decides what the landing page
 * does, so a code at the door and a code at the counter behave identically
 * and neither needs to know where it was printed.
 *
 * ## Why rendered here rather than fetched
 *
 * `qrcode.react` (pinned, zero runtime dependencies) draws the SVG in-process.
 * No hosted QR-image service is used and none may be: handing a production
 * check-in token to a third-party image API would leak it off-platform and
 * would leave a merchant unable to print without a working connection.
 * Inline SVG also prints at any size without going fuzzy.
 *
 * Error correction level M with a quiet margin: high enough to survive a
 * scuffed sticker on a counter, without inflating the module count so far
 * that a phone camera struggles at arm's length.
 */
export function CounterQr({
  url,
  size = 180,
  className,
}: {
  url: string;
  size?: number;
  className?: string;
}) {
  return (
    <QRCodeSVG
      value={url}
      size={size}
      level="M"
      marginSize={2}
      // Explicit, token-free colours: the frozen palette forbids raw hex in
      // components, but a QR is not decoration — contrast is what makes it
      // scan, so it is deliberately pure black on pure white in both the
      // screen and print contexts.
      bgColor="#FFFFFF"
      fgColor="#000000"
      className={className}
      role="img"
      aria-label="MAANTA check-in QR code for this shop"
    />
  );
}
