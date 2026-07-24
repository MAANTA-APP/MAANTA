import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAppUser, currentClerkUserId } from "@/lib/auth";
import { captureMerchantOnboarded } from "@/lib/analytics";
import {
  checkRateLimit,
  ONBOARD_RATE_LIMIT,
  ONBOARD_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{ id: string; role: string }>("id, role");
  if (!appUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const allowed = await checkRateLimit(
    `onboard:${appUser.id}`,
    ONBOARD_RATE_LIMIT,
    ONBOARD_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many onboarding attempts — try again later." },
      { status: 429 }
    );
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
    onboardingAgentId,
  } = await request.json();

  if (!merchantName || !what3wordsAddress || !phone) {
    return NextResponse.json(
      { error: "Shop name, what3words address, and phone are required." },
      { status: 400 }
    );
  }

  // Agent-assisted onboarding attribution (walkthrough G1; frozen 2026-07-02).
  // The merchant is always the authenticated submitter — the agent id captured
  // by the wizard is ATTRIBUTION ONLY, never the caller. "No agent" (or an
  // absent value) leaves it null, which the RPC records as self_serve. The RPC
  // validates the id against an active agents row and sets onboarding_mode =
  // agent_assisted + assisted_by_agent_id itself; we only forward what the
  // merchant selected.
  const onboardingAgentIdValue =
    typeof onboardingAgentId === "string" && onboardingAgentId.trim()
      ? onboardingAgentId.trim()
      : null;

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
    // G1 — agent-assisted onboarding attribution. The wizard's "Were you helped
    // by a Maanta agent?" step captures which agent assisted; we forward the
    // selected agents.id (or null for a self-serve "No"). The merchant-authored
    // onboard_merchant RPC (migration 20260702085628) treats this as attribution
    // only — it validates the id is an active agent and records agent_assisted +
    // assisted_by_agent_id, without ever letting the agent stand in as the
    // caller. See docs/skills/ui-walkthrough-roles.md (G1 closed).
    p_onboarding_agent_id: onboardingAgentIdValue,
  });

  if (error || !merchantId) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not complete onboarding. Please try again.";

    if (message.includes("already_merchant") || message.includes("merchant_exists")) {
      status = 409;
      userMessage = "You've already onboarded a shop.";
    } else if (message.includes("invalid_attribution")) {
      status = 400;
      userMessage = "That agent could not be verified — choose again or select “No”.";
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
