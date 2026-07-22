import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAppUser, currentClerkUserId } from "@/lib/auth";
import { captureMerchantOnboarded } from "@/lib/analytics";

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{ id: string; role: string }>("id, role");
  if (!appUser) {
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
    entranceNotes,
  } = await request.json();

  if (!merchantName || !what3wordsAddress || !phone) {
    return NextResponse.json(
      { error: "Shop name, what3words address, and phone are required." },
      { status: 400 }
    );
  }

  const supabase = createClient();

  // onboard_merchant is a self-authorizing, atomic RPC: it checks the
  // caller is either the merchant being onboarded or an admin, guards
  // against double-onboarding, inserts the merchants row, and promotes the
  // user's role to merchant_admin — all inside the DB. Node 0 is BBS Mall
  // only; mall_name isn't collected by this form and the RPC has no
  // mall_name parameter (mall_name stays NULL, matching the RPC's schema).
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
    // G3 — the wizard's floor step collects entrance notes; persist them
    // (the RPC already has this parameter).
    p_entrance_notes: entranceNotes || null,
    // TODO(agent-tools): agent-assisted onboarding attribution is not wired up.
    // The RPC + schema already support it (onboard_merchant `agent_assisted`
    // path; merchants.onboarding_mode / onboarded_by_agent_id, migration
    // 20260702083812), but it needs an agent-facing onboarding surface where a
    // signed-in agent onboards a merchant and passes their own agents.id here.
    // This self-serve route correctly sends null. Tracked as an "agent tools"
    // feature ticket — see docs/skills/ui-walkthrough-roles.md (G1).
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

  const clerkUserId = await currentClerkUserId();
  if (clerkUserId && typeof merchantId === "string") {
    void captureMerchantOnboarded({ clerkUserId, merchantId });
  }

  return NextResponse.json({ merchantId });
}
