import { formatCode } from "@/lib/ui";

/**
 * Pre-launch email delivery of the claim code — a TESTER convenience, not a
 * launch feature (founder instruction 2026-08-05; sunset tracked as D74 in
 * docs/maanta-drift-register.md).
 *
 * Until launch, a shopper claiming a deal may opt in to also receive their
 * 6-digit code at their account email. The ticket screen stays the source of
 * truth for the code; the email is a copy, never a replacement — a send
 * failure must never fail or delay-block the claim itself.
 *
 * Gate: server-only env `MAANTA_EMAIL_CODE_DELIVERY`. Unset means ON, because
 * the whole point is that testers get it today without a config step; an
 * explicit `off` / `false` / `0` turns it off. Turning this off is a launch
 * step (set the env var and redeploy) — see docs/ops/email-code-delivery.md.
 */
export function emailCodeDeliveryEnabled(): boolean {
  const raw = process.env.MAANTA_EMAIL_CODE_DELIVERY?.trim().toLowerCase();
  return !(raw === "off" || raw === "false" || raw === "0");
}

/**
 * The claim-code email, built once here so the copy cannot fork per caller.
 *
 * Deliberately minimal and in the product's closed vocabulary: the code, the
 * deal, the shop, the validity. No prices (frozen UI rule 6: no price next to
 * the code), no colour on money-adjacent content, no celebration.
 */
export function claimCodeEmail(params: {
  code: string;
  dealTitle: string;
  merchantName: string | null;
  expiresAt: string;
}): { subject: string; html: string; text: string } {
  const code = formatCode(params.code);
  const shop = params.merchantName ? ` at ${params.merchantName}` : "";
  const validUntil = formatNairobi(params.expiresAt);

  const subject = `Your MAANTA code for ${params.dealTitle}`;
  const text = [
    `Your MAANTA code: ${code}`,
    ``,
    `Deal: ${params.dealTitle}${shop}`,
    validUntil ? `Valid until: ${validUntil}` : ``,
    ``,
    `Show this code at the till to redeem. It is also in My deals in the app.`,
    ``,
    `If you did not claim this deal, ignore this email — the code only works once, in person, at the shop.`,
  ]
    .filter((line, i, arr) => !(line === `` && arr[i - 1] === ``))
    .join(`\n`);

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 14px; margin: 0 0 4px;">Your MAANTA code</p>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 0.12em; margin: 0 0 16px;">${escapeHtml(code)}</p>
      <p style="font-size: 14px; margin: 0 0 4px;"><strong>${escapeHtml(params.dealTitle)}</strong>${escapeHtml(shop)}</p>
      ${validUntil ? `<p style="font-size: 14px; margin: 0 0 16px;">Valid until ${escapeHtml(validUntil)}</p>` : ""}
      <p style="font-size: 14px; margin: 0 0 16px;">Show this code at the till to redeem. It is also in My deals in the app.</p>
      <p style="font-size: 12px; color: #555; margin: 0;">If you did not claim this deal, ignore this email — the code only works once, in person, at the shop.</p>
    </div>
  `;

  return { subject, html, text };
}

/** Ticket expiry in Nairobi local time; empty string if the date is invalid. */
function formatNairobi(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
