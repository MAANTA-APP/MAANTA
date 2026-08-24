import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAppUser, currentClerkUserId } from "@/lib/auth";
import { captureMerchantOnboarded } from "@/lib/analytics";
import { isValidKenyanPhone } from "@/lib/phone";
import { isOwnerPhoneRequired } from "@/lib/merchant-onboarding";
import { isValidCoordinatePair } from "@/lib/shop-location";
import { convertTo3Words, normalizeWhat3Words } from "@/lib/what3words";
import {
  checkRateLimit,
  ONBOARD_RATE_LIMIT,
  ONBOARD_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{
    id: string;
    role: string;
    email: string | null;
  }>("id, role, email");
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

  if (!merchantName) {
    return NextResponse.json({ error: "Shop name is required." }, { status: 400 });
  }

  // D158 (founder ruling 2026-08-23, option B) — owner phone is OPTIONAL when
  // the submitting account already has a verified email.
  //
  // This is the real gate; the wizard's disabled-Continue is a convenience that
  // reads the same predicate. `hasVerifiedEmail` is derived HERE from the
  // session-resolved `users.email`, never from the request body — a client that
  // simply omits `phone` gets a 400 unless the account genuinely carries a
  // verified address. `users.email` is written from `verifiedPrimaryEmail()`
  // alone and frozen by D142, so its presence is the proof (the same signal
  // D154 links staff seats on).
  const hasVerifiedEmail =
    typeof appUser.email === "string" && appUser.email.trim().length > 0;
  const suppliedPhone = typeof phone === "string" ? phone.trim() : "";

  if (!suppliedPhone && isOwnerPhoneRequired(hasVerifiedEmail)) {
    return NextResponse.json(
      { error: "A phone number is required to onboard this account." },
      { status: 400 }
    );
  }

  // A phone that IS given is still format-checked (SEC-013). Optional does not
  // mean unvalidated: this is the merchant-authored wizard, filled in by an
  // owner standing in BBS Mall, where a foreign number is more likely a typo
  // than a fact. The admin-assisted route is deliberately wider — see
  // `isValidInternationalPhone`.
  //
  // The column itself is contact detail, not an access-control input: it is
  // displayed as the shop's contact and it *prefills* the M-Pesa top-up field —
  // a prefill only, since `/api/topup` re-validates the submitted number.
  // Staff linking keys on `users.phone`/`users.email`, a different table, and
  // no notification path reads `merchants.phone` at all (drift D109 corrected
  // the comment that claimed otherwise).
  if (suppliedPhone && !isValidKenyanPhone(suppliedPhone)) {
    return NextResponse.json(
      { error: "Enter a valid Kenyan mobile number (e.g. 07XX XXX XXX)." },
      { status: 400 }
    );
  }

  // Keep every shop reachable. When no phone is given, the account's verified
  // address becomes the shop contact unless the merchant typed one of their
  // own, which is what satisfies the `merchants_contact_present` CHECK added
  // alongside this ruling.
  //
  // This is INTERNAL contact data, not storefront data. `merchants.email` is
  // absent from `merchants_public_browse` and from `DEAL_SELECT`, and D147
  // revoked anon/authenticated SELECT on the base table, so a shopper cannot
  // read it — which is the only reason falling back to a private login address
  // is acceptable here. Both facts are guarded (see the D158 vitest and SQL
  // suites). If a contact should ever appear on a storefront, that needs the
  // merchant's explicit consent and its own column; do not promote this one.
  const typedEmail = typeof email === "string" ? email.trim() : "";
  const contactEmail = typedEmail || (suppliedPhone ? null : appUser.email);

  // D162 (founder ruling 2026-08-24) — the shop's coordinates ARE its location.
  //
  // Until this ruling the wizard blocked on a what3words lookup, so when the
  // what3words account went over quota (HTTP 402) self-serve onboarding could
  // not be completed at all. Coordinates come from the merchant's own device
  // while they stand at their entrance, cost nothing per lookup, and depend on
  // no third party's billing state. They are required here, and what3words is
  // no longer required anywhere on this path.
  //
  // What the wizard sends is the pin the merchant CONFIRMED, which may be one
  // they dragged after a poor reading — not the device's first fix. The server
  // cannot tell those apart and does not try: it validates the numbers it is
  // given and stores exactly those.
  if (!isValidCoordinatePair(rawLat, rawLng)) {
    return NextResponse.json(
      {
        error:
          "Your shop's location is required — use “Locate my shop”, or place the pin on the map.",
        code: "location_required",
      },
      { status: 400 }
    );
  }
  const lat = rawLat as number;
  const lng = rawLng as number;

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

  // what3words is enrichment now, and enrichment only (D162). The wizard no
  // longer asks for it; we derive it from the confirmed pin so the admin
  // console, the ticket screen and the shop page keep the human-readable
  // address where the provider is willing to give one. EVERY failure — no key,
  // over quota, provider down, slow — collapses to null and onboarding
  // continues, which is the entire point of the ruling: the shop is already
  // findable from its coordinates. Bounded tightly because nobody is waiting on
  // the words: a merchant is waiting on their shop.
  const W3W_ENRICHMENT_TIMEOUT_MS = 1500;
  const suppliedW3w =
    typeof what3wordsAddress === "string" ? normalizeWhat3Words(what3wordsAddress) : null;
  let w3wAddress: string | null = suppliedW3w;
  if (!w3wAddress) {
    try {
      const derived = await convertTo3Words(lat, lng, W3W_ENRICHMENT_TIMEOUT_MS);
      w3wAddress = derived.ok ? derived.words : null;
    } catch {
      w3wAddress = null;
    }
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
    p_phone: suppliedPhone || null,
    p_email: contactEmail || null,
    p_whatsapp: whatsapp || null,
    p_node: "BBS Mall",
    p_w3w_address: w3wAddress,
    // D162 — written in the same statement as the shop row. It used to be an
    // UPDATE after the insert whose failure was logged and swallowed, so a shop
    // with no location at all was one swallowed error away; the DB now refuses
    // that row outright (merchants_location_present).
    p_lat: lat,
    p_lng: lng,
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
    } else if (message.includes("contact_required")) {
      status = 400;
      userMessage = "Add a phone number or an email so shoppers can reach you.";
    } else if (
      message.includes("location_required") ||
      message.includes("invalid_coordinates")
    ) {
      // The route validated the pair before calling, so reaching this means a
      // caller that is not the wizard. Answer it honestly rather than as a 500.
      status = 400;
      userMessage =
        "Your shop's location is required — use “Locate my shop”, or place the pin on the map.";
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
    void captureMerchantOnboarded({
      clerkUserId,
      merchantId,
      node: "BBS Mall",
    });
  }

  return NextResponse.json({ merchantId });
}
