import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const {
    merchantName,
    floor,
    unitNumber,
    what3wordsAddress,
    phone,
    email,
    whatsapp,
  } = await request.json();

  if (!merchantName || !what3wordsAddress || !phone) {
    return NextResponse.json(
      { error: "Shop name, what3words address, and phone are required." },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data: appUser } = await service
    .from("users")
    .select("id, role")
    .eq("auth_uid", authUser.id)
    .maybeSingle();

  if (!appUser) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  // onboard_merchant is a self-authorizing, atomic RPC: it checks the
  // caller is either the merchant being onboarded or an admin, guards
  // against double-onboarding, inserts the merchants row, and promotes the
  // user's role to merchant_admin — all inside the DB. Node 0 is BBS Mall
  // only; mall_name/entrance_notes aren't collected by this form and the
  // RPC has no mall_name parameter (mall_name stays NULL, matching the
  // RPC's existing schema).
  const { data: merchantId, error } = await supabase.rpc("onboard_merchant", {
    p_user_id: appUser.id,
    p_merchant_name: merchantName,
    p_phone: phone,
    p_email: email || null,
    p_whatsapp: whatsapp || null,
    p_node: "BBS Mall",
    p_w3w_address: what3wordsAddress,
    p_floor: floor || null,
    p_unit_number: unitNumber || null,
    p_entrance_notes: null,
    p_onboarding_agent_id: null,
  });

  if (error || !merchantId) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not complete onboarding. Please try again.";

    if (message.includes("already_merchant") || message.includes("merchant_exists")) {
      status = 409;
      userMessage = "You've already onboarded a shop.";
    } else if (message.includes("unauthorized")) {
      status = 403;
      userMessage = "Not authorized.";
    } else if (message.includes("user_not_found")) {
      status = 404;
      userMessage = "Account not found.";
    } else {
      console.error("onboard_merchant RPC failed:", error);
    }

    return NextResponse.json({ error: userMessage }, { status });
  }

  return NextResponse.json({ merchantId });
}
