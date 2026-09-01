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
// signed-in shopper could emit those at the rate-limit ceiling. D201.
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server-authoritative queue-membership confirmation (D217).
 *
 * A client clock may decide when confirmation is due, but never whether the
 * shopper is still queued. The token, session user, queue row, and live claim
 * must all name the same merchant/redemption chain.
 */
export async function GET(request: Request) {
  const appUser = await ensureAppUser<{ id: string }>("id");
  if (!appUser) {
    return NextResponse.json(
      { error: "Sign in required.", code: "sign_in_required" },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const redemptionId = (url.searchParams.get("redemptionId") ?? "").trim();
  if (!TOKEN_SHAPE.test(token) || !UUID_SHAPE.test(redemptionId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: merchant, error: merchantError } = await service
    .from("merchants")
    .select("id")
    .eq("qr_token", token)
    .eq("status", "active")
    .eq("is_visible", true)
    .eq("is_shadow_banned", false)
    .maybeSingle<{ id: string }>();
  if (merchantError) {
    return NextResponse.json(
      { error: "Could not confirm your queue status.", code: "queue_confirm_failed" },
      { status: 503 }
    );
  }
  if (!merchant) return NextResponse.json({ checkedIn: false });

  const nowIso = new Date().toISOString();
  const [{ data: waiting, error: waitingError }, { data: claim, error: claimError }] =
    await Promise.all([
      service
        .from("merchant_presentations")
        .select("expires_at, status, called_at")
        .eq("redemption_id", redemptionId)
        .eq("shopper_id", appUser.id)
        .eq("merchant_id", merchant.id)
        .in("status", ["waiting", "called"])
        .gt("expires_at", nowIso)
        .maybeSingle<{ expires_at: string; status: "waiting" | "called"; called_at: string | null }>(),
      service
        .from("redemptions")
        .select("id")
        .eq("id", redemptionId)
        .eq("user_id", appUser.id)
        .eq("merchant_id", merchant.id)
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .maybeSingle<{ id: string }>(),
    ]);

  if (waitingError || claimError) {
    return NextResponse.json(
      { error: "Could not confirm your queue status.", code: "queue_confirm_failed" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    checkedIn: Boolean(waiting && claim),
    expiresAt: waiting && claim ? waiting.expires_at : null,
    queueStatus: waiting && claim ? waiting.status : null,
    calledAt: waiting && claim ? waiting.called_at : null,
  });
}

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
  // (D197). D199.
  const { data: existing } = await service
    .from("merchant_presentations")
    .select("id, expires_at, status, called_at")
    .eq("redemption_id", redemptionId)
    .in("status", ["waiting", "called"])
    .maybeSingle<{
      id: string;
      expires_at: string;
      status: "waiting" | "called";
      called_at: string | null;
    }>();

  let queued = false;
  let queueStatus: "waiting" | "called" = "waiting";
  let calledAt: string | null = null;
  if (existing) {
    const lapsed = new Date(existing.expires_at).getTime() <= nowMs;
    const { data: written, error: updateError } = await service
      .from("merchant_presentations")
      .update(
        lapsed
          ? {
              status: "waiting",
              expires_at: expiresAt,
              arrived_at: new Date(nowMs).toISOString(),
              fast_visit_eligible: arrival.fast_visit_eligible,
              called_at: null,
              called_by: null,
            }
          : { expires_at: expiresAt }
      )
      .eq("id", existing.id)
      .eq("status", existing.status)
      .select("id");
    if (updateError) {
      console.error("queue renew failed:", updateError.code);
    }
    queued = !updateError && (written?.length ?? 0) > 0;
    if (queued && !lapsed && existing.status === "called") {
      queueStatus = "called";
      calledAt = existing.called_at;
    }
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
      // insert, so a waiting row exists even though this request lost the
      // race. Anything else means arrival evidence was recorded but the
      // shopper is NOT safely visible in the staff queue.
      if (insertError.code === "23505") {
        // The UNIQUE index includes lapsed waiting rows, so 23505 alone does
        // NOT prove the shopper is visible to staff. Re-read and require a
        // still-live row before acknowledging queue membership.
        const { data: racedLive } = await service
          .from("merchant_presentations")
          .select("id, status, called_at")
          .eq("redemption_id", redemptionId)
          .in("status", ["waiting", "called"])
          .gt("expires_at", new Date(nowMs).toISOString())
          .maybeSingle<{
            id: string;
            status: "waiting" | "called";
            called_at: string | null;
          }>();
        queued = Boolean(racedLive);
        if (racedLive?.status === "called") {
          queueStatus = "called";
          calledAt = racedLive.called_at;
        }
        renewed = queued;
      } else {
        console.error("queue insert failed:", insertError.code);
      }
    } else {
      queued = true;
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
  if (!queued) {
    return NextResponse.json(
      {
        error:
          "Your arrival was recorded, but we could not add you to the shopper queue. Please scan again.",
        code: "queue_not_joined",
        arrivalRecorded: true,
      },
      { status: 503 }
    );
  }

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
    queueExpiresAt: expiresAt,
    queueStatus,
    calledAt,
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
  if (!UUID_SHAPE.test(redemptionId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Doubly scoped: the row must be this shopper's own waiting entry.
  // DELETE is idempotent: if the row is already absent, the desired
  // postcondition ("not waiting") already holds. A database error is
  // different and must never be presented as a successful leave.
  const service = createServiceClient();
  const { data, error } = await service
    .from("merchant_presentations")
    .update({ status: "cancelled", called_at: null, called_by: null })
    .eq("redemption_id", redemptionId)
    .eq("shopper_id", appUser.id)
    .in("status", ["waiting", "called"])
    .select("id");

  if (error) {
    console.error("queue cancel failed:", error.code);
    return NextResponse.json(
      { error: "Could not leave the queue. Please try again.", code: "queue_cancel_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    cancelled: true,
    changed: (data?.length ?? 0) > 0,
  });
}
