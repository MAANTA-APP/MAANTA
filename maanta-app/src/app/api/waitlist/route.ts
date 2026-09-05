import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { validateWaitlistSubmission } from "@/lib/waitlist";
import { isWaitlistTestToken } from "@/lib/growth/waitlist-test-token";
import { WAITLIST_CLOSED_MESSAGE, collectionAllowed } from "@/lib/marketing/collection-gate";
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
 * Keyed on the client IP AND a digest of the normalized email, for two reasons
 * that pull in different directions.
 *
 * On Vercel the platform overwrites `x-forwarded-for` with the connecting
 * client's address and does not forward an external value, so on this
 * deployment the first hop is not client-spoofable. Anywhere else it is, and
 * every miss used to fall into a single shared `waitlist:unknown` bucket. The
 * email component makes the key hold either way: header rotation alone cannot
 * mint unlimited buckets for one address, and the IP still bounds one client
 * churning through addresses. That matters now that these submissions become
 * rows in the table the admin console counts as traction (D261).
 *
 * The address itself is never the key. `api_rate_limit_buckets` keeps its rows
 * after the window closes and has no reaper, so a raw-email key would be a
 * second, unmanaged copy of the waitlist in a table nobody thinks of as holding
 * personal data (SEC-011). A digest bounds the key's length too, so a 254-byte
 * address cannot be used to bloat a primary key.
 */
function waitlistClientKey(request: Request, email: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const rawIp =
    forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  // Bounded and character-restricted: this string becomes a primary key.
  const ip = rawIp.replace(/[^0-9a-f.:]/gi, "").slice(0, 45) || "unknown";
  const address = createHash("sha256").update(email, "utf8").digest("hex").slice(0, 32);
  return `waitlist:${ip}:${address}`;
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

  // The collection gate (D274): refused before validation, before the rate
  // limit, before any write. A verified test entry passes.
  if (!collectionAllowed(isTest)) {
    return NextResponse.json({ error: WAITLIST_CLOSED_MESSAGE }, { status: 403 });
  }

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
  // the list at this point, and a 502 here would make them sign up again. Only a
  // contact Resend just CREATED is written from this body — on already_exists
  // the lib returns "skipped" and the sync pass imports Resend's own record.
  await mirrorWaitlistSignup(result.data, contact);

  // The signup is captured; a confirmation-email failure is logged but
  // must not make the signup look broken to the user.
  //
  // A TEST signup sends nothing (board 2, M8): consent is recorded for the
  // shape of the data, and the whole point of a test entry is that no real
  // message reaches a real inbox. The row still lands in Resend and the mirror
  // so the console can be tested against it.
  const sent = result.data.isTest
    ? true
    : await sendWaitlistEmail(
        result.data.email,
        waitlistConfirmationEmail(result.data.segment, result.data.fullName)
      );
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
