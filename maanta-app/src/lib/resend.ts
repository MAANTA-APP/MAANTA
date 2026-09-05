import {
  WAITLIST_CONSENT_TEXT,
  type WaitlistSubmission,
} from "@/lib/waitlist";
import type { WaitlistEmail } from "@/lib/waitlist-emails";

/**
 * Minimal Resend REST client (no SDK dependency).
 *
 * Resend is the email platform per the 2026-07-10 decision. Since the founder's
 * 2026-09-04 mirror ruling it is the SENDER of record rather than the only
 * record: it owns deliverability and the join date, while `public.waitlist_signups`
 * owns counting.
 *
 * **The TEST marker is deliberately NOT sent to Resend.** `is_test` and
 * `test_label` are not among the ten contact properties this account has
 * configured (verified 2026-09-04: segment_type, phone, node_interest,
 * business_name, note, source_channel, source_medium, source_campaign,
 * consent_at, consent_text). Sending an unconfigured property risks the 4xx that
 * triggers the strip-and-retry below — which would drop EVERY property from the
 * contact, not just the unknown one, so one internal test signup could silently
 * cost a real signup its segment and consent record. The mirror owns the
 * population split now, so Resend has no need of it.
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

export type WaitlistContactOutcome = "created" | "already_exists" | "failed";

/**
 * What `addWaitlistContact` learned, not just whether it worked.
 *
 * `propertiesWritten` is the one that matters downstream: the strip-and-retry
 * below drops every custom property on ANY 4xx — including a 429 — and retries
 * with core fields only. That succeeds, so the contact exists, but Resend then
 * holds no `segment_type`, no consent and no UTM for that person. Without this
 * flag the admin console cannot tell that apart from a person who declined to
 * provide them, and renders our own retry as their compliance defect.
 */
export type WaitlistContactResult = {
  outcome: WaitlistContactOutcome;
  /** Resend's id, when the create response carried one. Opportunistic. */
  contactId: string | null;
  propertiesWritten: boolean;
};

const FAILED: WaitlistContactResult = {
  outcome: "failed",
  contactId: null,
  propertiesWritten: false,
};

/** Pull an id out of a create response without asserting its shape. */
async function contactIdFrom(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { id?: unknown };
    return typeof body?.id === "string" && body.id ? body.id : null;
  } catch {
    return null;
  }
}

export async function addWaitlistContact(
  submission: WaitlistSubmission
): Promise<WaitlistContactResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    console.error("Resend is not configured (RESEND_API_KEY / RESEND_AUDIENCE_ID).");
    return FAILED;
  }

  const [first, ...rest] = (submission.fullName ?? "").split(/\s+/);
  const payload: Record<string, unknown> = {
    email: submission.email,
    first_name: first || undefined,
    last_name: rest.join(" ") || undefined,
    unsubscribed: false,
    // Field names are canonical per docs/maanta-waitlist-data-schema.md.
    properties: {
      segment_type: submission.segment,
      phone: submission.phone,
      node_interest: submission.nodeInterest,
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
    resendFetch(`${RESEND_API_URL}/audiences/${audienceId}/contacts`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify(body),
    });

  try {
    let res = await post(payload);
    if (res.ok) {
      return { outcome: "created", contactId: await contactIdFrom(res), propertiesWritten: true };
    }

    const detail = await res.text();
    if (res.status === 409 || /already exist/i.test(detail)) {
      return { outcome: "already_exists", contactId: null, propertiesWritten: false };
    }

    // If the audience rejects custom properties (e.g. properties not yet
    // created in Resend), don't lose the lead — retry with core fields only.
    //
    // This fires on ANY 4xx, a 429 included, so it is not rare and it is not
    // always about the properties being invalid. The retry succeeding means the
    // CONTACT exists while Resend holds none of its metadata — which is why the
    // result now reports `propertiesWritten: false` rather than a bare
    // "created" that hides it.
    if (res.status >= 400 && res.status < 500) {
      console.warn("Resend contact create rejected, retrying without properties:", res.status, detail);
      delete payload.properties;
      res = await post(payload);
      if (res.ok) {
        return { outcome: "created", contactId: await contactIdFrom(res), propertiesWritten: false };
      }
      const retryDetail = await res.text();
      if (res.status === 409 || /already exist/i.test(retryDetail)) {
        return { outcome: "already_exists", contactId: null, propertiesWritten: false };
      }
      console.error("Resend contact create failed:", res.status, retryDetail);
      return FAILED;
    }

    console.error("Resend contact create failed:", res.status, detail);
    return FAILED;
  } catch (err) {
    console.error("Resend contact create threw:", err);
    return FAILED;
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
  /**
   * Null when Resend did not return one. It used to be substituted with the
   * Unix epoch, which is a date and therefore a lie: downstream it read as a
   * 1970 signup, dropped the person out of every chart, and — if a join date is
   * ever merged monotonically — would have pinned the row there permanently.
   */
  created_at: string | null;
};

/**
 * Read one custom property, whatever shape the account returns it in.
 *
 * Resend is asymmetric here, and it cost a bug: `addWaitlistContact` WRITES
 * properties flat (`{segment_type: "merchant"}`), but the read endpoints return
 * them TYPED — verified against this account's live audience on 2026-09-04:
 *
 *   {"segment_type":{"value":"merchant","type":"string"}, ...}
 *
 * A reader doing `typeof props.segment_type === "string"` therefore sees `false`
 * for every field, and every backfilled contact lands with a null segment, null
 * phone and null consent — while `properties_unreadable` stays FALSE, because the
 * object is not empty. That is the worst of both: the console would render two
 * real people as consent defects, which is exactly the "we could not read it" vs
 * "they did not provide it" confusion the mirror exists to keep apart.
 *
 * Accepting both shapes is correct whichever one a given endpoint or API version
 * hands back, and costs nothing.
 */
export function resendPropertyValue(
  properties: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const raw = properties?.[key];
  if (typeof raw === "string") return raw.trim() || null;
  if (raw && typeof raw === "object" && "value" in raw) {
    const value = (raw as { value?: unknown }).value;
    if (typeof value === "string") return value.trim() || null;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return null;
}

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
      created_at: typeof body.created_at === "string" ? body.created_at : null,
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
