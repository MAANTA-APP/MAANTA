import { NextResponse } from "next/server";
import { validateWaitlistSubmission } from "@/lib/waitlist";
import { waitlistConfirmationEmail } from "@/lib/waitlist-emails";
import { addWaitlistContact, sendWaitlistEmail } from "@/lib/resend";
import {
  checkRateLimit,
  WAITLIST_RATE_LIMIT,
  WAITLIST_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";

function waitlistClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `waitlist:${ip}`;
}

/**
 * Public waitlist signup. Stateless proxy to Resend: the contact (with
 * segment_type and consent fields) is the record — nothing is stored in
 * Supabase, per the 2026-07-10 decision in docs/maanta-decisions-log.md.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: the hidden "website" field is empty for humans. Pretend
  // success for bots and store nothing.
  if (typeof body === "object" && body !== null && (body as Record<string, unknown>).website) {
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
    console.error("waitlist: confirmation email failed for", result.data.email);
  }

  return NextResponse.json({ ok: true, alreadyJoined: contact === "already_exists" });
}
