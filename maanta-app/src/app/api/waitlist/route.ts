import { NextResponse } from "next/server";
import { validateWaitlistSubmission } from "@/lib/waitlist";
import { isWaitlistTestToken } from "@/lib/growth/waitlist-test-token";
import { mirrorWaitlistSignup } from "@/lib/growth/waitlist-mirror";
import { waitlistConfirmationEmail } from "@/lib/waitlist-emails";
import { addWaitlistContact, sendWaitlistEmail } from "@/lib/resend";
import {
  checkRateLimit,
  WAITLIST_RATE_LIMIT,
  WAITLIST_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";

/**
 * The rate-limit bucket.
 *
 * `x-forwarded-for`'s FIRST hop is whatever the client sent, so an IP-only key
 * is defeated by rotating one header — and every miss fell into a single shared
 * `waitlist:unknown` bucket. That was tolerable while a flood only produced junk
 * contacts in Resend. It is not tolerable now that these submissions become rows
 * in the table the admin console counts as traction (D261): unbounded
 * attacker-controlled rows in a traction figure is a different class of problem.
 *
 * So the key also carries the normalized email. Header rotation alone can no
 * longer mint unlimited distinct buckets for the same address, and the IP hint
 * still bounds a single client churning through addresses.
 */
function waitlistClientKey(request: Request, email: string | null): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `waitlist:${ip}:${email ?? "anon"}`;
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
 * Public waitlist signup.
 *
 * No longer a stateless proxy. Founder ruling 2026-09-04 (amending 2026-07-10,
 * D261): the signup is written to BOTH Resend and a Supabase mirror, because the
 * admin Growth console has to count and filter these people and Resend's list
 * endpoint returns no custom properties.
 *
 * **Resend goes first, and its failure is the user-visible one.** It owns
 * deliverability and duplicate detection; a mirror row for someone who never
 * reached the sending audience would be a signup that receives nothing. The
 * mirror is written after, and a mirror failure does NOT fail the request — the
 * person is on the list, and telling them otherwise would make them sign up
 * again. It is logged, and the sync pass reconciles it.
 */
export async function POST(request: Request) {
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

  // The TEST marker is derived here from a shared secret, never taken from the
  // body — see lib/growth/waitlist-test-token.ts.
  const isTest = isWaitlistTestToken((body as { testToken?: unknown })?.testToken);

  const result = validateWaitlistSubmission(body, { isTest });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    waitlistClientKey(request, result.data.email),
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
  if (contact.outcome === "failed") {
    return NextResponse.json(
      { error: "Could not join the waitlist right now. Please try again in a minute." },
      { status: 502 }
    );
  }

  // The mirror. Deliberately not awaited into the failure path: the person IS on
  // the list at this point, and a 502 here would make them sign up again.
  await mirrorWaitlistSignup(result.data, contact);

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

  // `alreadyJoined` stays derived from Resend's inference and is NOT recomputed
  // from the mirror. It already answers "is this address on MAANTA's waitlist?"
  // to any unauthenticated caller; making it authoritative from a database fact
  // would upgrade a fuzzy membership oracle into a reliable one.
  return NextResponse.json({ ok: true, alreadyJoined: contact.outcome === "already_exists" });
}
