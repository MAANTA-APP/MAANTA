import { NextResponse } from "next/server";
import {
  autoresponderEmail,
  enquiryEmail,
  isEmailAddress,
  validateContactSubmission,
} from "@/lib/contact";
import { sendEmail } from "@/lib/resend";
import { checkRateLimit } from "@/lib/rate-limit";
import { ENTITY } from "@/lib/marketing/demo";

/**
 * Contact enquiries → Resend → monitored inbox, plus an autoresponder.
 *
 * **This route did not exist.** `/contact` rendered a form whose `onSubmit`
 * called `setSent(true)` and nothing else, then displayed "✓ We'll get back to
 * you within 24 hours". Every enquiry since that page shipped was discarded while
 * the sender was told it had arrived. Drift D28; `docs/ops/copy/contact.md` §0
 * puts it plainly — "a contact form that silently discards enquiries is worse
 * than having no contact page, and every trust claim on this site is undermined
 * by it".
 *
 * Two emails per submission:
 *   1. the enquiry to `ENTITY.email`, with `reply_to` set to the sender so a
 *      reply goes to them rather than to MAANTA's own from-address;
 *   2. the autoresponder to the sender, when they gave an email address.
 *
 * The autoresponder is the part that repairs the specific breach: it is the only
 * thing that proves to the sender that the message actually left the page.
 *
 * **Delivery failure is reported, never swallowed.** Returning 200 on a failed
 * send would recreate the original bug in a new place, so a failed enquiry send
 * returns 502 and the form says so. The autoresponder is best-effort by
 * comparison: if the enquiry landed, the enquiry landed, and failing the request
 * because the courtesy copy bounced would tell the sender to write in again for
 * a message that is already in the inbox.
 */

const CONTACT_RATE_LIMIT = 5;
const CONTACT_RATE_WINDOW_SECONDS = 3600;

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `contact:${ip}`;
}

/**
 * Honeypot, matching the waitlist route's approach: visually hidden, ignored by
 * password managers, so a real person's autofill cannot trip it. A false positive
 * here silently drops a genuine enquiry, which is the failure this endpoint
 * exists to end.
 */
function isHoneypotTripped(body: Record<string, unknown>): boolean {
  return Boolean(body.hp_url) || Boolean(body.website);
}

/** Config presence check, booleans only — never the values. Mirrors /api/waitlist. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("healthz") === "1") {
    return NextResponse.json({
      resendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
      resendFromEmail: Boolean(process.env.RESEND_FROM_EMAIL?.trim()),
      destination: Boolean(ENTITY.email),
    });
  }
  return new NextResponse(null, { status: 405, headers: { Allow: "GET, POST" } });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const record = (body ?? {}) as Record<string, unknown>;

  // Bots get a success shape and nothing is sent.
  if (isHoneypotTripped(record)) {
    return NextResponse.json({ ok: true });
  }

  const parsed = validateContactSubmission(record);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    clientKey(request),
    CONTACT_RATE_LIMIT,
    CONTACT_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many messages from this connection. Try again later, or use WhatsApp." },
      { status: 429 }
    );
  }

  const submission = parsed.value;
  const enquiry = enquiryEmail(submission);

  const delivered = await sendEmail({
    to: ENTITY.email,
    subject: enquiry.subject,
    text: enquiry.text,
    html: enquiry.html,
    replyTo: isEmailAddress(submission.contact) ? submission.contact : undefined,
  });

  if (!delivered) {
    // Do not claim receipt for a message that did not send — that is the bug.
    console.error("Contact enquiry failed to send.");
    return NextResponse.json(
      {
        error:
          "We could not send your message just now. Please try WhatsApp, or email " +
          `${ENTITY.email} directly.`,
      },
      { status: 502 }
    );
  }

  let autoresponded = false;
  if (isEmailAddress(submission.contact)) {
    const auto = autoresponderEmail(submission);
    autoresponded = await sendEmail({
      to: submission.contact,
      subject: auto.subject,
      text: auto.text,
      html: auto.html,
    });
    if (!autoresponded) {
      // Logged, not fatal — the enquiry itself is already in the inbox.
      console.warn("Contact autoresponder failed to send; enquiry was delivered.");
    }
  }

  return NextResponse.json({ ok: true, autoresponded });
}
