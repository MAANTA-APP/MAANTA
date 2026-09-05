import type { WaitlistSegment } from "@/lib/waitlist";
import { escapeHtml } from "@/lib/escape-html";

/**
 * Segment-specific waitlist confirmation emails (email #1 of each
 * sequence in docs/maanta-email-segmentation-plan.md). Guardrail from
 * that plan: merchant copy states the KES 30 success fee plainly.
 */

export type WaitlistEmail = { subject: string; html: string; text: string };

function firstName(fullName: string | null): string {
  return (fullName ?? "").trim().split(/\s+/)[0] || "there";
}

function renderHtml(paragraphs: string[]): string {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1a1a1a;">${p}</p>`
    )
    .join("\n      ");
  return `<div style="background:#faf8f3;padding:24px 12px;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 20px;font-size:18px;font-weight:800;letter-spacing:0.5px;color:#1a1a1a;">MAANTA</p>
      ${body}
      <p style="margin:24px 0 0;font-size:13px;color:#777;">You're receiving this because you joined the MAANTA waitlist. If this wasn't you, just ignore this email.</p>
    </div>
  </div>`;
}

const COPY: Record<
  WaitlistSegment,
  { subject: string; paragraphs: (name: string) => string[] }
> = {
  shopper: {
    subject: "You're on the MAANTA waitlist",
    paragraphs: (name) => [
      `Hi ${name},`,
      `You're on the Nairobi pilot list. MAANTA brings time-limited shop deals into one feed: you claim a deal on your phone and redeem it in person at the counter with a one-time code.`,
      `We'll email you when a pilot location and opening date are confirmed. No location or date has been confirmed yet, and there is no spam in between.`,
      `— The MAANTA team`,
    ],
  },
  merchant: {
    subject: "You're on the MAANTA merchant launch list",
    paragraphs: (name) => [
      `Hi ${name},`,
      `Thanks for your interest in MAANTA for your shop. You publish a time-limited deal from your phone, shoppers claim it, and they redeem in person at your counter with a one-time code.`,
      `You pay only for results — <strong>KES 30 per verified redemption</strong>. No redemption, no fee.`,
      `We'll email you when a pilot location and opening date are confirmed, with what onboarding involves. No location or date has been confirmed yet. Want to talk sooner? Just reply to this email.`,
      `— The MAANTA team`,
    ],
  },
  mall_operator: {
    subject: "MAANTA — thanks for your interest",
    paragraphs: (name) => [
      `Hi ${name},`,
      `Thanks for registering interest in MAANTA for your property. MAANTA is designed to put participating tenant offers into one feed and record the redemptions their staff verify at the counter — footfall a mall can account for.`,
      `MAANTA is preparing its first Nairobi pilot; no location or launch date has been confirmed. We'd welcome a conversation about hosting a pilot — reply to this email and we'll set it up.`,
      `— The MAANTA team`,
    ],
  },
};

export function waitlistConfirmationEmail(
  segment: WaitlistSegment,
  fullName: string | null
): WaitlistEmail {
  const { subject, paragraphs } = COPY[segment];
  const parts = paragraphs(escapeHtml(firstName(fullName)));
  return {
    subject,
    html: renderHtml(parts),
    text: parts.map((p) => p.replace(/<[^>]+>/g, "")).join("\n\n"),
  };
}
