import type { WaitlistSegment } from "@/lib/waitlist";
import { escapeHtml } from "@/lib/escape-html";

/**
 * Segment-specific waitlist confirmation emails (email #1 of each
 * sequence in docs/maanta-email-segmentation-plan.md). Guardrail from
 * that plan: merchant copy states the KES 30 success fee plainly.
 */

export type WaitlistEmail = { subject: string; html: string; text: string };

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || "there";
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
      `You're on the list. MAANTA is launching at <strong>BBS Mall, Eastleigh</strong> — real, verified deals from shops inside the mall. You claim a deal on your phone and redeem it in person at the counter with a one-time code.`,
      `We'll email you as launch gets close, and you'll get access on day one. No spam in between — just the launch.`,
      `— The MAANTA team`,
    ],
  },
  merchant: {
    subject: "You're on the MAANTA merchant launch list",
    paragraphs: (name) => [
      `Hi ${name},`,
      `Thanks for your interest in MAANTA for your business at <strong>BBS Mall, Eastleigh</strong>. MAANTA brings shoppers to your door: you publish deals, shoppers claim them in the app, and they redeem in person at your counter with a one-time code.`,
      `You pay only for results — <strong>KES 30 per verified redemption</strong>, from a prepaid wallet. No redemption, no fee.`,
      `Before launch we'll email you what onboarding involves (approval, wallet top-up, getting your first deal live) so you're ready on day one. Want to talk sooner? Just reply to this email.`,
      `— The MAANTA team`,
    ],
  },
  mall_operator: {
    subject: "MAANTA — thanks for your interest",
    paragraphs: (name) => [
      `Hi ${name},`,
      `Thanks for registering interest in MAANTA for your property. MAANTA is an in-mall deals and redemption platform launching at <strong>BBS Mall, Eastleigh</strong> — it drives measurable footfall to tenants and gives operators visibility into deal activity and traction inside the mall.`,
      `We'll keep you posted as the launch progresses, and we'd welcome a conversation about a pilot for your mall — reply to this email and we'll set it up.`,
      `— The MAANTA team`,
    ],
  },
};

export function waitlistConfirmationEmail(
  segment: WaitlistSegment,
  fullName: string
): WaitlistEmail {
  const { subject, paragraphs } = COPY[segment];
  const parts = paragraphs(escapeHtml(firstName(fullName)));
  return {
    subject,
    html: renderHtml(parts),
    text: parts.map((p) => p.replace(/<[^>]+>/g, "")).join("\n\n"),
  };
}
