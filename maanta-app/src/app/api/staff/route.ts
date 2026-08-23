import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getMerchantContext } from "@/lib/merchant";
import { normalizeStaffPhone } from "@/lib/phone";

/** Add a staff member (wireframe 10y/10ac/10aa). Owner only. */
export async function POST(request: Request) {
  const res = await getMerchantContext();
  if (res.status === "signed-out") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  if (res.status === "no-merchant" || !res.ctx.isOwner) {
    return NextResponse.json(
      { error: "Only the shop owner can manage staff." },
      { status: 403 }
    );
  }
  const { merchant } = res.ctx;

  const { staffName, phone, email, canVerify, canDeals, canTopup, canPurchase } =
    await request.json();
  if (!staffName || !String(staffName).trim()) {
    return NextResponse.json(
      { error: "Enter their name and one way to sign in." },
      { status: 400 }
    );
  }

  // Store the canonical E.164, not the raw typed string: getMerchantContext links
  // this seat by matching merchant_staff.phone against the Clerk-provisioned
  // users.phone exactly, so a non-canonical number would never link (see
  // normalizeStaffPhone). Rejecting an unnormalizable number here turns a silent
  // never-links row into a clear error at the point the owner can fix it.
  const rawPhone = typeof phone === "string" ? phone.trim() : "";
  const normalizedPhone = rawPhone ? normalizeStaffPhone(rawPhone) : null;
  if (rawPhone && !normalizedPhone) {
    return NextResponse.json(
      { error: "Enter a valid mobile number so they can sign in." },
      { status: 400 }
    );
  }

  // D154: email is the second linking key, on the same terms as the phone.
  // Lower-cased here because the seat links by exact `=` against `users.email`
  // and the column carries a lowercase CHECK (20260823120000) — a mixed-case
  // invite would insert fine and then never link, the silent failure D127 fixed
  // on the phone side. Deliberately a shape check, not a deliverability check:
  // the address only matters if it is the one Clerk verified, and Clerk decides
  // that, not us.
  const rawEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return NextResponse.json(
      { error: "Enter a valid email address so they can sign in." },
      { status: 400 }
    );
  }
  const normalizedEmail = rawEmail || null;

  // At least one channel, or the seat is created and can never link to anyone.
  // The database enforces this too (merchant_staff_contact_present); this is the
  // half that can say something useful to the owner.
  if (!normalizedPhone && !normalizedEmail) {
    return NextResponse.json(
      { error: "Add a mobile number or an email address so they can sign in." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("merchant_staff")
    .insert({
      merchant_id: merchant.id,
      staff_name: String(staffName).trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      can_verify: canVerify !== false,
      can_deals: !!canDeals,
      can_topup: !!canTopup,
      can_purchase: !!canPurchase,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      // Two uniqueness rules now: (merchant_id, phone) and (merchant_id, email).
      // Name the one the owner actually collided on rather than guessing.
      const onEmail = String(error.message ?? "").includes("email");
      return NextResponse.json(
        {
          error: onEmail
            ? "That email address is already on your staff list."
            : "That phone number is already on your staff list.",
        },
        { status: 409 }
      );
    }
    console.error("staff insert failed:", error);
    return NextResponse.json({ error: "Could not add staff." }, { status: 500 });
  }

  return NextResponse.json({ staffId: data.id });
}
