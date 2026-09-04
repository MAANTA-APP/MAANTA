import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { getAudienceContact } from "@/lib/resend";
import { normalizeWaitlistPhone } from "@/lib/waitlist";

export const dynamic = "force-dynamic";

/**
 * Reveal one waitlist phone number, and record that it happened.
 *
 * The audit write is not best-effort here the way `logAdminOp` normally is: it
 * runs before the number is returned, so a reveal that could not be logged is a
 * reveal that does not happen. Reading someone's number off a shared screen is
 * the act being audited — if the trail is unavailable, the safe answer is no.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const contactId = (body as { contactId?: unknown })?.contactId;
  if (typeof contactId !== "string" || !contactId.trim()) {
    return NextResponse.json({ error: "A contact id is required." }, { status: 400 });
  }
  // `admin_ops_log.target_id` is a UUID column and Resend contact ids are UUIDs,
  // so this holds today. Checked rather than assumed: if Resend ever changes its
  // id format the failure should name itself here, not surface as an opaque
  // insert error one layer down that reads like the database is broken.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId)) {
    return NextResponse.json(
      { error: "That contact id is not in the expected format." },
      { status: 400 }
    );
  }

  const contact = await getAudienceContact(contactId);
  if (!contact) {
    return NextResponse.json({ error: "Could not read that contact." }, { status: 502 });
  }

  const phone = normalizeWaitlistPhone(contact.properties?.phone);
  if (!phone) {
    return NextResponse.json({ error: "No number on that contact." }, { status: 404 });
  }

  const service = createServiceClient();
  const { error } = await service.from("admin_ops_log").insert({
    admin_user_id: auth.user.id,
    action: "growth.waitlist.reveal_number",
    target_type: "waitlist_contact",
    target_id: contactId,
    // The number itself is deliberately NOT in the details: an audit trail that
    // accumulates the personal data it exists to protect is a second copy of the
    // exposure (SEC-011). Who looked at which contact, and when, is the record.
    details: { email_domain: contact.email.split("@")[1] ?? null },
  });
  if (error) {
    console.error("growth: reveal audit write failed:", error.message);
    return NextResponse.json(
      { error: "Could not record the reveal, so the number is withheld." },
      { status: 503 }
    );
  }

  return NextResponse.json({ phone });
}
