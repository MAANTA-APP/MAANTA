import {
  WAITLIST_CONSENT_TEXT,
  WAITLIST_NODE_INTEREST,
  type WaitlistSubmission,
} from "@/lib/waitlist";
import type { WaitlistEmail } from "@/lib/waitlist-emails";

/**
 * Minimal Resend REST client (no SDK dependency). Resend is the email
 * platform per the 2026-07-10 decision — waitlist contacts live in a
 * Resend audience, not in Supabase.
 *
 * Env: RESEND_API_KEY, RESEND_AUDIENCE_ID, RESEND_FROM_EMAIL.
 */

// Overridable for local testing against a mock (same pattern as INTASEND_ENV).
const RESEND_API_URL = process.env.RESEND_BASE_URL || "https://api.resend.com";

function authHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

export type WaitlistContactResult = "created" | "already_exists" | "failed";

export async function addWaitlistContact(
  submission: WaitlistSubmission
): Promise<WaitlistContactResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    console.error("Resend is not configured (RESEND_API_KEY / RESEND_AUDIENCE_ID).");
    return "failed";
  }

  const [first, ...rest] = submission.fullName.split(/\s+/);
  const payload: Record<string, unknown> = {
    email: submission.email,
    first_name: first,
    last_name: rest.join(" ") || undefined,
    unsubscribed: false,
    // Field names are canonical per docs/maanta-waitlist-data-schema.md.
    properties: {
      segment_type: submission.segment,
      phone: submission.phone,
      node_interest: WAITLIST_NODE_INTEREST,
      business_name: submission.businessName ?? undefined,
      note: submission.note ?? undefined,
      source_channel: submission.utmSource ?? undefined,
      source_medium: submission.utmMedium ?? undefined,
      source_campaign: submission.utmCampaign ?? undefined,
      consent_at: new Date().toISOString(),
      consent_text: WAITLIST_CONSENT_TEXT,
    },
  };

  const post = (body: Record<string, unknown>) =>
    fetch(`${RESEND_API_URL}/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });

  try {
    let res = await post(payload);
    if (res.ok) return "created";

    const detail = await res.text();
    if (res.status === 409 || /already exist/i.test(detail)) {
      return "already_exists";
    }

    // If the audience rejects custom properties (e.g. properties not yet
    // created in Resend), don't lose the lead — retry with core fields only.
    if (res.status >= 400 && res.status < 500) {
      console.warn("Resend contact create rejected, retrying without properties:", res.status, detail);
      delete payload.properties;
      res = await post(payload);
      if (res.ok) return "created";
      const retryDetail = await res.text();
      if (res.status === 409 || /already exist/i.test(retryDetail)) return "already_exists";
      console.error("Resend contact create failed:", res.status, retryDetail);
      return "failed";
    }

    console.error("Resend contact create failed:", res.status, detail);
    return "failed";
  } catch (err) {
    console.error("Resend contact create threw:", err);
    return "failed";
  }
}

/**
 * Send one transactional email. The generic form of `sendWaitlistEmail`, added
 * for `/api/contact`, which needs to send two different messages (the enquiry to
 * the monitored inbox, and the autoresponder to the sender) rather than one
 * templated waitlist mail.
 *
 * `replyTo` matters for the enquiry copy: without it, replying to the message in
 * the inbox goes back to MAANTA's own from-address instead of to the person who
 * wrote in.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).");
    return false;
  }

  try {
    const res = await fetch(`${RESEND_API_URL}/emails`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });
    if (!res.ok) {
      console.error("Resend email send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend email send threw:", err);
    return false;
  }
}

export async function sendWaitlistEmail(
  to: string,
  email: WaitlistEmail
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.error("Resend is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).");
    return false;
  }

  try {
    const res = await fetch(`${RESEND_API_URL}/emails`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        from,
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!res.ok) {
      console.error("Resend email send failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend email send threw:", err);
    return false;
  }
}
