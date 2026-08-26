import { NextResponse } from "next/server";
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
 *  - the arrival goes through `record_shopper_arrival` on the SERVICE
 *    client: the RPC is deliberately not executable by authenticated
 *    (Codex P1 — a direct client call would stamp an arrival without the
 *    scanned token this route just validated), so THIS ROUTE is the only
 *    door, and the token check above is what it evidences. The RPC still
 *    enforces claim ownership against p_user_id, the merchant match, and
 *    pending/unexpired — which is why p_user_id below MUST stay the
 *    session-derived appUser.id and never anything from the request body;
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
// Shape-check the id too. A non-UUID reached the RPC and failed uuid
// coercion inside PostgREST, whose message matches none of the mapped
// branches below — so malformed input answered 500 instead of 400 and any
// signed-in shopper could emit those at the rate-limit ceiling. D199.
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!TOKEN_SHAPE.test(token) || !UUID_SHAPE.test(redemptionId)) {
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

  // Arrival — service client (the RPC is server-only; see the header
  // comment). p_user_id is the session-derived app user, never the body.
  const { data: arrival, error } = await service
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

  // The partial UNIQUE index covers EVERY waiting row, lapsed or not, so the
  // lookup must not filter by expiry — a lapsed row still occupies the slot
  // and a "fresh insert" would collide with it. Instead, decide by age:
  //
  //  - live row   -> extend it, keeping its original arrived_at (a re-scan
  //                  by someone already in the queue is not a new arrival);
  //  - lapsed row -> supersede it in place, stamping a NEW arrived_at. It
  //                  had dropped off the staff list; reviving it with the
  //                  old timestamp re-listed a shopper who scanned the
  //                  entrance at 10:00 and reached the till at 10:40 as
  //                  "arrived 40m ago", sorted ahead of everyone who checked
  //                  in between — jumping a queue whose whole purpose is
  //                  oldest-first (on a multi-day deal, "arrived 2d ago").
  //  - no row     -> insert.
  //
  // Every branch confirms what it actually wrote: an entry can be dismissed
  // or cancelled between the lookup and the write, and answering `checkedIn`
  // regardless told a shopper they were queued while staff never saw them
  // (D195). D197.
  const { data: existing } = await service
    .from("merchant_presentations")
    .select("id, expires_at")
    .eq("redemption_id", redemptionId)
    .eq("status", "waiting")
    .maybeSingle<{ id: string; expires_at: string }>();

  let queued = false;
  if (existing) {
    const lapsed = new Date(existing.expires_at).getTime() <= nowMs;
    const { data: written } = await service
      .from("merchant_presentations")
      .update(
        lapsed
          ? {
              expires_at: expiresAt,
              arrived_at: new Date(nowMs).toISOString(),
              fast_visit_eligible: arrival.fast_visit_eligible,
            }
          : { expires_at: expiresAt }
      )
      .eq("id", existing.id)
      .eq("status", "waiting")
      .select("id");
    queued = (written?.length ?? 0) > 0;
    // Only a still-live entry is a "renew" to the shopper; superseding a
    // lapsed one is a fresh check-in and reads as one.
    renewed = queued && !lapsed;
  }

  if (!queued) {
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
