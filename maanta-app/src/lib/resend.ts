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

/**
 * How long any single Resend call may take before it is abandoned.
 *
 * Without a deadline, `fetch` inherits the platform's — which on a hung TCP
 * connection is minutes. `/api/contact` awaits two of these calls before it
 * responds, so an unresponsive Resend held the request open until the serverless
 * function itself timed out, and the visitor watched a spinner and then got a
 * generic network error, with no way to tell whether their enquiry had been
 * delivered. Ten seconds is well beyond Resend's normal latency and well inside
 * any platform request budget.
 */
const RESEND_TIMEOUT_MS = 10_000;

/**
 * `fetch` with the deadline applied, and the abort surfaced as a normal
 * rejection so every caller's existing `catch` handles it.
 */
function resendFetch(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(RESEND_TIMEOUT_MS) });
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
      // Always written, never omitted when false: a missing property and an
      // explicit `false` read the same to a human and differently to a filter,
      // and the admin console's Real/Test split depends on the difference.
      is_test: submission.isTest,
      test_label: submission.testLabel ?? undefined,
    },
  };

  const post = (body: Record<string, unknown>) =>
    resendFetch(`${RESEND_API_URL}/audiences/${audienceId}/contacts`, {
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
    const res = await resendFetch(`${RESEND_API_URL}/emails`, {
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
    const res = await resendFetch(`${RESEND_API_URL}/emails`, {
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

/* ---------------------------------------------------------------------------
 * Read side — the admin Growth console.
 *
 * The waitlist record lives in a Resend audience and not in Supabase (founder
 * decision 2026-07-10, decisions log). `/admin/growth/waitlist` therefore reads
 * back out of Resend rather than out of a table, which keeps that decision
 * intact instead of quietly growing a second copy of the same data.
 *
 * One constraint shapes everything below: **the audience list endpoint does not
 * return custom properties.** It returns `id`, `email`, `first_name`,
 * `last_name`, `unsubscribed` and `created_at` only — while `segment_type`,
 * `phone`, `node_interest`, the `source_*` trio and the consent fields all live
 * in `properties`, written by `addWaitlistContact` above. Every column the
 * console shows besides name and join date therefore needs a second, per-contact
 * call. That is why the directory is capped and cached rather than streamed.
 * ------------------------------------------------------------------------- */

/** Core fields, as the list endpoint returns them. */
export type ResendContactSummary = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  unsubscribed: boolean;
  created_at: string;
};

/** A contact with whatever custom properties the account actually returns. */
export type ResendContactDetail = ResendContactSummary & {
  properties: Record<string, unknown> | null;
};

function resendConfig(): { apiKey: string; audienceId: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const audienceId = process.env.RESEND_AUDIENCE_ID?.trim();
  if (!apiKey || !audienceId) return null;
  return { apiKey, audienceId };
}

/** `true` when the console can talk to Resend at all. Surfaces as a read error. */
export function isResendConfigured(): boolean {
  return resendConfig() !== null;
}

/**
 * One page of the audience. `after` is a contact id, per Resend's cursor
 * pagination. Returns `null` on any failure — the caller renders a read-failure
 * state rather than an empty list, because "we could not read it" and "there is
 * nothing there" are different answers and only one of them is safe to quote.
 */
export async function listAudienceContacts(params: {
  limit?: number;
  after?: string;
}): Promise<{ contacts: ResendContactSummary[]; hasMore: boolean } | null> {
  const config = resendConfig();
  if (!config) return null;

  const url = new URL(`${RESEND_API_URL}/audiences/${config.audienceId}/contacts`);
  url.searchParams.set("limit", String(Math.min(params.limit ?? 100, 100)));
  if (params.after) url.searchParams.set("after", params.after);

  try {
    const res = await resendFetch(url.toString(), {
      method: "GET",
      headers: authHeaders(config.apiKey),
    });
    if (!res.ok) {
      console.error("Resend contact list failed:", res.status, await res.text());
      return null;
    }
    const body = (await res.json()) as { data?: unknown; has_more?: boolean };
    const rows = Array.isArray(body.data) ? body.data : [];
    return {
      contacts: rows.filter((r): r is ResendContactSummary => {
        const c = r as Partial<ResendContactSummary>;
        return typeof c?.id === "string" && typeof c?.email === "string";
      }),
      hasMore: Boolean(body.has_more),
    };
  } catch (err) {
    console.error("Resend contact list threw:", err);
    return null;
  }
}

/**
 * One contact, with properties. `null` on failure — and a failure here is
 * per-row, so the directory keeps the summary it already has and renders the
 * property-backed columns as unreadable rather than dropping the person.
 */
export async function getAudienceContact(id: string): Promise<ResendContactDetail | null> {
  const config = resendConfig();
  if (!config) return null;

  try {
    const res = await resendFetch(
      `${RESEND_API_URL}/audiences/${config.audienceId}/contacts/${encodeURIComponent(id)}`,
      { method: "GET", headers: authHeaders(config.apiKey) }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<ResendContactDetail>;
    if (typeof body?.id !== "string") return null;
    return {
      id: body.id,
      email: typeof body.email === "string" ? body.email : "",
      first_name: typeof body.first_name === "string" ? body.first_name : null,
      last_name: typeof body.last_name === "string" ? body.last_name : null,
      unsubscribed: Boolean(body.unsubscribed),
      created_at: typeof body.created_at === "string" ? body.created_at : new Date(0).toISOString(),
      // Guarded rather than asserted: whether this account's API returns custom
      // properties on the single-contact read is an account/API-version fact, not
      // something this repo can prove. If they are absent the console says the
      // column is unreadable — it never invents a segment or a source.
      properties:
        body.properties && typeof body.properties === "object"
          ? (body.properties as Record<string, unknown>)
          : null,
    };
  } catch {
    return null;
  }
}
