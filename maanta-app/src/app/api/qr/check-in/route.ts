import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ensureAppUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { QUEUE_ENTRY_TTL_MINUTES } from "@/lib/queue";
import {
  captureMerchantArrivalRecorded,
  captureShopperQueueJoined,
} from "@/lib/analytics";

/**
 * Shopper check-in from a scanned merchant counter QR.
 *
 * The token identifies the merchant and authorizes nothing. Everything that
 * matters is re-derived server-side:
 *  - the merchant comes from the TOKEN, never from the request body, so
 *    "arrival at merchant A" can only ever land on a claim held at A;
 *  - the arrival itself goes through `record_shopper_arrival` on the
 *    AUTHENTICATED client (anon key + session JWT) — the RPC enforces that
 *    the caller owns the claim, the merchant matches, and the claim is
 *    pending and unexpired. Switching this to the service client would
 *    silently disable that check (the verify-route lesson) — don't.
 *  - the queue row is written with server-derived ids only, after the RPC
 *    has already vouched for the claim.
 *
 * Idempotent end to end: re-scans renew the existing waiting entry (the
 * partial UNIQUE index makes a race collapse into a renew), and arrival
 * evidence is first-wins inside the RPC. The scan never awards points.
 */

const QR_CHECKIN_RATE_LIMIT = 10;
const QR_CHECKIN_RATE_WINDOW_SECONDS = 60;
const TOKEN_SHAPE = /^[0-9a-f]{32}$/;

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{ id: string }>("id");
  if (!appUser) {
    return NextResponse.json(
      { error: "Sign in required.", code: "sign_in_required" },
      { status: 401 }
    );
  }

  let body: { token?: unknown; redemptionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const redemptionId =
    typeof body.redemptionId === "string" ? body.redemptionId.trim() : "";
  if (!TOKEN_SHAPE.test(token) || !redemptionId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `qr-checkin:${appUser.id}`,
    QR_CHECKIN_RATE_LIMIT,
    QR_CHECKIN_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts — wait a moment and try again." },
      { status: 429 }
    );
  }

  // Resolve the token server-side. A token for a suspended, hidden or
  // shadow-banned shop resolves to the same answer as a made-up token — the
  // response never separates "wrong token" from "shop you may not see".
  const service = createServiceClient();
  const { data: merchant } = await service
    .from("merchants")
    .select("id, merchant_name, node, status, is_visible, is_shadow_banned")
    .eq("qr_token", token)
    .maybeSingle<{
      id: string;
      merchant_name: string;
      node: string | null;
      status: string;
      is_visible: boolean;
      is_shadow_banned: boolean;
    }>();
  if (
    !merchant ||
    merchant.status !== "active" ||
    !merchant.is_visible ||
    merchant.is_shadow_banned
  ) {
    return NextResponse.json(
      { error: "This code doesn't match a MAANTA shop.", code: "shop_not_found" },
      { status: 404 }
    );
  }

  // Arrival — authenticated client, so the RPC's caller check is live.
  const supabase = createClient();
  const { data: arrival, error } = await supabase
    .rpc("record_shopper_arrival", {
      p_user_id: appUser.id,
      p_merchant_id: merchant.id,
      p_redemption_id: redemptionId,
    })
    .single<{
      arrived_at: string;
      fast_visit_eligible: boolean;
      first_arrival: boolean;
    }>();

  if (error || !arrival) {
    const message = error?.message ?? "";
    if (message.includes("arrival_claim_not_found")) {
      return NextResponse.json(
        { error: "No matching claim.", code: "claim_not_found" },
        { status: 404 }
      );
    }
    if (message.includes("arrival_merchant_mismatch")) {
      return NextResponse.json(
        { error: "This claim belongs to a different shop.", code: "merchant_mismatch" },
        { status: 409 }
      );
    }
    if (message.includes("arrival_claim_not_pending")) {
      return NextResponse.json(
        { error: "This claim has already been redeemed.", code: "claim_not_pending" },
        { status: 409 }
      );
    }
    if (message.includes("arrival_claim_expired")) {
      return NextResponse.json(
        { error: "This claim has expired.", code: "claim_expired" },
        { status: 410 }
      );
    }
    if (message.includes("unauthorized") || message.includes("permission denied")) {
      return NextResponse.json(
        { error: "Sign in required.", code: "sign_in_required" },
        { status: 401 }
      );
    }
    console.error("record_shopper_arrival RPC failed:", error);
    return NextResponse.json(
      { error: "Could not check you in. Please try again." },
      { status: 500 }
    );
  }

  // Queue: renew the live entry or create one. Server-derived ids only.
  const nowMs = Date.now();
  const expiresAt = new Date(
    nowMs + QUEUE_ENTRY_TTL_MINUTES * 60_000
  ).toISOString();
  let renewed = false;

  const { data: existing } = await service
    .from("merchant_presentations")
    .select("id, expires_at")
    .eq("redemption_id", redemptionId)
    .eq("status", "waiting")
    .maybeSingle<{ id: string; expires_at: string }>();

  if (existing) {
    renewed = true;
    await service
      .from("merchant_presentations")
      .update({ expires_at: expiresAt })
      .eq("id", existing.id)
      .eq("status", "waiting");
  } else {
    const { error: insertError } = await service
      .from("merchant_presentations")
      .insert({
        merchant_id: merchant.id,
        redemption_id: redemptionId,
        shopper_id: appUser.id,
        fast_visit_eligible: arrival.fast_visit_eligible,
        expires_at: expiresAt,
      });
    if (insertError) {
      // 23505 = the partial unique index: a concurrent check-in won the
      // insert, which is exactly a renew. Anything else is a real failure —
      // but the ARRIVAL succeeded, so the shopper is told the truth rather
      // than shown an error for a queue-row hiccup.
      if (insertError.code === "23505") {
        renewed = true;
      } else {
        console.error("queue insert failed:", insertError.code);
      }
    }
  }

  void captureMerchantArrivalRecorded({
    userId: appUser.id,
    redemptionId,
    merchantId: merchant.id,
    fastVisitEligible: arrival.fast_visit_eligible,
    firstArrival: arrival.first_arrival,
    node: merchant.node,
  });
  void captureShopperQueueJoined({
    userId: appUser.id,
    redemptionId,
    merchantId: merchant.id,
    renewed,
    node: merchant.node,
  });

  return NextResponse.json({
    checkedIn: true,
    renewed,
    merchantName: merchant.merchant_name,
    arrivedAt: arrival.arrived_at,
    fastVisitEligible: arrival.fast_visit_eligible,
    firstArrival: arrival.first_arrival,
  });
}

/** Shopper cancels their own check-in. The claim is untouched. */
export async function DELETE(request: Request) {
  const appUser = await ensureAppUser<{ id: string }>("id");
  if (!appUser) {
    return NextResponse.json(
      { error: "Sign in required.", code: "sign_in_required" },
      { status: 401 }
    );
  }

  let body: { redemptionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const redemptionId =
    typeof body.redemptionId === "string" ? body.redemptionId.trim() : "";
  if (!redemptionId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Doubly scoped: the row must be this shopper's own waiting entry.
  const service = createServiceClient();
  const { data } = await service
    .from("merchant_presentations")
    .update({ status: "cancelled" })
    .eq("redemption_id", redemptionId)
    .eq("shopper_id", appUser.id)
    .eq("status", "waiting")
    .select("id");

  return NextResponse.json({ cancelled: (data?.length ?? 0) > 0 });
}
