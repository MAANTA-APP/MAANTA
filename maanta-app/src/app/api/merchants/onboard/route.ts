import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAppUser, currentClerkUserId } from "@/lib/auth";
import { captureMerchantOnboarded } from "@/lib/analytics";
import { validatePhoneField } from "@/lib/phone/e164";
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
    lat: rawLat,
    lng: rawLng,
  } = await request.json();

  if (!merchantName || !what3wordsAddress) {
    return NextResponse.json(
      { error: "Shop name, what3words address, and phone are required." },
      { status: 400 }
    );
  }

  const phoneCheck = validatePhoneField(phone, { label: "owner phone" });
  if (!phoneCheck.ok) {
    return NextResponse.json({ error: phoneCheck.error }, { status: 400 });
  }

  const lat =
    typeof rawLat === "number" && Number.isFinite(rawLat) ? rawLat : null;
  const lng =
    typeof rawLng === "number" && Number.isFinite(rawLng) ? rawLng : null;
  if ((lat == null) !== (lng == null)) {
    return NextResponse.json(
      { error: "Latitude and longitude must both be set or both omitted." },
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

  // p_onboarding_agent_id is a uuid column: a malformed value would surface as a
  // Postgres 22P02 (generic 500) instead of the explicit invalid-attribution
  // 400, so reject a non-UUID here up front.
  if (
    onboardingAgentIdValue &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      onboardingAgentIdValue
    )
  ) {
    return NextResponse.json(
      { error: "That agent could not be verified — choose again or select “No”." },
      { status: 400 }
    );
  }

  // Run onboard_merchant as the trusted server (service client). This route is
  // the trust boundary: ensureAppUser has already authenticated the caller, and
  // we pass p_user_id = appUser.id, so the merchant can only ever onboard
  // THEMSELVES — never another user. The service client is required because
  // onboard_merchant promotes the user's role to merchant_admin, and the
  // prevent_self_role_escalation trigger only permits a role change for
  // service_role/admin (a user-session call would be rejected). This mirrors the
  // fee-reversal route's authenticate-then-execute-as-service pattern. Under
  // service_role the RPC derives attribution purely from the params supplied:
  // a valid active agent id → agent_assisted + assisted_by_agent_id, else
  // self_serve; onboarded_by_user_id = p_user_id (the merchant). Node 0 is BBS
  // Mall only; mall_name isn't collected here and the RPC has no such param.
  const supabase = createServiceClient();

  const { data: merchantId, error } = await supabase.rpc("onboard_merchant", {
    p_user_id: appUser.id,
    p_merchant_name: merchantName,
    p_phone: phoneCheck.e164,
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

  // Persist GPS derived from the wizard's w3w validate step (coords are not
  // part of onboard_merchant's RPC signature — update after insert).
  if (typeof merchantId === "string" && lat != null && lng != null) {
    const { error: locError } = await supabase
      .from("merchants")
      .update({ lat, lng, updated_at: new Date().toISOString() })
      .eq("id", merchantId);
    if (locError) {
      console.error("onboard lat/lng update failed:", locError);
    }
  }

  const clerkUserId = await currentClerkUserId();
  if (clerkUserId && typeof merchantId === "string") {
    void captureMerchantOnboarded({
      clerkUserId,
      merchantId,
      node: "BBS Mall",
    });
  }

  return NextResponse.json({ merchantId });
}
