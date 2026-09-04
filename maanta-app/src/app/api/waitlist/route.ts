import { NextResponse } from "next/server";
import { validateWaitlistSubmission } from "@/lib/waitlist";
import { waitlistConfirmationEmail } from "@/lib/waitlist-emails";
import { addWaitlistContact, sendWaitlistEmail } from "@/lib/resend";
import {
  checkRateLimit,
  WAITLIST_RATE_LIMIT,
  WAITLIST_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";
import { CLOSED_FORM_API_MESSAGE, isFormCollecting } from "@/lib/marketing/forms";

function waitlistClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `waitlist:${ip}`;
}

/**
 * A submission is treated as a bot only if a honeypot field is filled.
 * The field is visually hidden and marked to be ignored by password
 * managers, so a real person's browser autofill must never trip it —
 * a false positive would silently drop a genuine lead. `website` is the
 * legacy field name, kept so any cached older page still works.
 */
function isHoneypotTripped(body: Record<string, unknown>): boolean {
  return Boolean(body.hp_url) || Boolean(body.website);
}

/**
 * GET /api/waitlist?healthz=1 — config presence check for launch
 * debugging. Returns booleans only, never secret values, so we can
 * confirm from outside that the running deployment has its Resend env
 * vars without exposing them. Any other GET stays 405 (POST-only route).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("healthz") === "1") {
    // Trim so a whitespace-only value reads as missing, not present.
    return NextResponse.json({
      resendApiKey: Boolean(process.env.RESEND_API_KEY?.trim()),
      resendAudienceId: Boolean(process.env.RESEND_AUDIENCE_ID?.trim()),
      resendFromEmail: Boolean(process.env.RESEND_FROM_EMAIL?.trim()),
    });
  }
  return new NextResponse(null, { status: 405, headers: { Allow: "GET, POST" } });
}

/**
 * Public waitlist signup. Stateless proxy to Resend: the contact (with
 * segment_type and consent fields) is the record — nothing is stored in
 * Supabase, per the 2026-07-10 decision in docs/maanta-decisions-log.md.
 */
export async function POST(request: Request) {
  // Form safety (founder ruling 2026-09-04, `lib/marketing/forms.ts`): while
  // the waitlist is closed nothing is written to Resend, whatever posts here.
  // Refused with the reason and the alternative, never a silent 200.
  if (!isFormCollecting("waitlist")) {
    return NextResponse.json({ error: CLOSED_FORM_API_MESSAGE.waitlist }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: pretend success for bots and store nothing.
  if (typeof body === "object" && body !== null && isHoneypotTripped(body as Record<string, unknown>)) {
    return NextResponse.json({ ok: true });
  }

  const result = validateWaitlistSubmission(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    waitlistClientKey(request),
    WAITLIST_RATE_LIMIT,
    WAITLIST_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many signup attempts — try again later." },
      { status: 429 }
    );
  }

  const contact = await addWaitlistContact(result.data);
  if (contact === "failed") {
    return NextResponse.json(
      { error: "Could not join the waitlist right now. Please try again in a minute." },
      { status: 502 }
    );
  }

  // The signup is captured; a confirmation-email failure is logged but
  // must not make the signup look broken to the user.
  const email = waitlistConfirmationEmail(result.data.segment, result.data.fullName);
  const sent = await sendWaitlistEmail(result.data.email, email);
  if (!sent) {
    // Log the segment, not the address. The failure is already non-fatal to the
    // request, so the address buys nothing a support person cannot get from the
    // waitlist table — and server logs are the wrong place to accumulate it
    // (SEC-011).
    console.error(
      "waitlist: confirmation email failed for a",
      result.data.segment,
      "signup"
    );
  }

  return NextResponse.json({ ok: true, alreadyJoined: contact === "already_exists" });
}
