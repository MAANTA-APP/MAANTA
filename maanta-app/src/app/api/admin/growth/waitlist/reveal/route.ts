import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/**
 * Reveal one waitlist phone number, and record that it happened.
 *
 * The audit write is not best-effort here the way `logAdminOp` normally is: it
 * runs before the number is returned, so a reveal that could not be logged is a
 * reveal that does not happen. Reading someone's number off a shared screen is
 * the act being audited — if the trail is unavailable, the safe answer is no.
 *
 * Reads the Supabase mirror rather than Resend (founder ruling 2026-09-04): the
 * id is now our own primary key, so the UUID guard below is a real check instead
 * of an assumption about a third party's id format, and an admin path no longer
 * makes an external round trip to show one column.
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
  // `admin_ops_log.target_id` is a UUID column and this id is now the mirror's
  // own primary key, so the check is exact rather than a bet on a third party's
  // id format. A malformed id names itself here instead of surfacing as an
  // opaque insert error one layer down that reads like the database is broken.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contactId)) {
    return NextResponse.json(
      { error: "That contact id is not in the expected format." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: contact, error: readError } = await service
    .from("waitlist_signups")
    .select("id, email, phone")
    .eq("id", contactId)
    .maybeSingle();

  if (readError) {
    // Code only: this table's unique key is an email address (SEC-011).
    console.error("growth: reveal read failed", { code: readError.code });
    return NextResponse.json({ error: "Could not read that contact." }, { status: 502 });
  }
  if (!contact) {
    return NextResponse.json({ error: "No such contact." }, { status: 404 });
  }
  if (!contact.phone) {
    return NextResponse.json({ error: "No number on that contact." }, { status: 404 });
  }
  const phone = contact.phone as string;

  const { error } = await service.from("admin_ops_log").insert({
    admin_user_id: auth.user.id,
    action: "growth.waitlist.reveal_number",
    target_type: "waitlist_contact",
    target_id: contactId,
    // The number itself is deliberately NOT in the details: an audit trail that
    // accumulates the personal data it exists to protect is a second copy of the
    // exposure (SEC-011). Who looked at which contact, and when, is the record.
    details: { email_domain: String(contact.email).split("@")[1] ?? null },
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
