import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  ensureAppUser,
  currentClerkUserId,
  currentUserHasVerifiedContact,
} from "@/lib/auth";
import { convertWhat3WordsToCoordinates, distanceMeters } from "@/lib/what3words";
import { parseGpsCoords } from "@/lib/geo";
import { captureDealClaimed } from "@/lib/analytics";
import {
  checkRateLimit,
  CLAIM_RATE_LIMIT,
  CLAIM_RATE_WINDOW_SECONDS,
} from "@/lib/rate-limit";
import { VERIFIED_CONTACT_REQUIRED_AT_CLAIM } from "@/lib/launch-auth";
import { isValidCoordinatePair } from "@/lib/shop-location";

/**
 * The shop's own stored coordinates, or null.
 *
 * Canonical since D162 and preferred over a what3words lookup on the claim
 * path: one indexed read beats a call to a provider that has already been over
 * quota once (D162), and a shop onboarded since the ruling may have no words at
 * all. Enrichment either way — every failure returns null and the claim stands.
 */
async function merchantCoordinates(
  service: ReturnType<typeof createServiceClient>,
  merchantId: string
): Promise<{ lat: number; lng: number } | null> {
  try {
    const { data } = await service
      .from("merchants")
      .select("lat, lng")
      .eq("id", merchantId)
      .maybeSingle();
    if (!data || !isValidCoordinatePair(data.lat, data.lng)) return null;
    return { lat: data.lat as number, lng: data.lng as number };
  } catch {
    return null;
  }
}

/**
 * Ceiling on post-claim enrichment, in milliseconds.
 *
 * The redemption row is committed before any of this runs, so none of it can
 * change whether the shopper has a ticket — but until 2026-08-14 it could still
 * decide whether they were *told*. The block made an unbounded call to
 * what3words and three further round trips before the response was written, so
 * a slow provider ran the invocation into the platform timeout, and the shopper
 * received a non-JSON 504 that the client reported as a network error for a
 * claim that had already succeeded. See
 * docs/ops/claim-failure-investigation-2026-08-14.md.
 *
 * A bounded wait rather than fire-and-forget, deliberately. This runs on Node
 * serverless, where work not awaited before the response is frozen with the
 * invocation and usually never completes — so "return immediately and finish
 * later" would silently stop setting `review_required`, which is a fraud
 * control, not decoration. Waiting a strictly bounded moment keeps the control
 * working in the ordinary case and makes the pathological case impossible.
 *
 * 1200ms sits far below any function limit while comfortably covering a healthy
 * lookup. If the deadline is hit the response still goes out on time and the
 * enrichment is abandoned — identical to the pre-existing behavior when the
 * provider failed outright, which was already swallowed here.
 *
 * The durable fix is to move this off the request entirely once a deferred-work
 * primitive is available (Next 14.2's `unstable_after` is gated behind an
 * experimental flag, which is not something to switch on in a P0 on the money
 * path). Tracked in the fix report.
 */
const POST_CLAIM_ENRICHMENT_DEADLINE_MS = 1200;

/**
 * Run best-effort work under a hard deadline. Never throws, never rejects, and
 * never outlives `ms` from the caller's point of view.
 *
 * Abandoning is not cancelling: the underlying promise keeps running until the
 * invocation ends. That is acceptable here because every task inside is either
 * idempotent or a write the row can live without.
 */
async function withDeadline(ms: number, task: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.error("post-claim enrichment abandoned at deadline:", { ms });
      resolve();
    }, ms);
  });

  try {
    await Promise.race([task().catch(() => undefined), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const appUser = await ensureAppUser<{ id: string }>("id");
  if (!appUser) {
    // Typed so the client routes to sign-in and returns to the deal, rather
    // than printing a dead-end sentence at the bottom of the screen.
    return NextResponse.json(
      { error: "Sign in required.", code: "sign_in_required" },
      { status: 401 }
    );
  }

  // Verified-contact-at-claim gate. A claim requires proof the shopper controls
  // a contact channel — a verified phone OR a verified email.
  //
  // Founder ruling 2026-08-22 (decisions log) widened this from the S2 phone-only
  // gate of 2026-07-23, because Clerk SMS does not reach the Norwegian, Kenyan and
  // UK numbers the pilot has to test on. Under the Clerk strategy an email sign-in
  // IS an emailed one-time code, so a verified email is the same kind of proof over
  // a different channel. The gate did not weaken to "anyone signed in": a session
  // with no verified channel at all is still refused.
  //
  // A session with neither channel verified keeps the `phone_required` code, so the
  // client still routes it to the phone step — SMS remains the only OTP we can issue
  // on demand until an OTP provider is in place, which is when this ruling is to be
  // revisited.
  //
  // This route is the ONLY gate: `claim_deal` asserts no identity check of its own
  // (grep `phone` over its definition returns nothing). So the invariant holds for
  // the shipped shopper path, but it is app-layer, not RPC-enforced — a direct RPC
  // caller with a valid shopper JWT would claim without one. That is accepted for
  // the pilot (this gated route is the only caller); the durable form is an
  // RPC-level check, a founder call whose analysis is recorded as D84. Note too
  // that under the Supabase auth strategy (dev/CI) `currentUserHasVerifiedPhone()`
  // returns true unconditionally, so this gate is also strategy-dependent (D59).
  const hasVerifiedContact = await currentUserHasVerifiedContact();
  if (VERIFIED_CONTACT_REQUIRED_AT_CLAIM && !hasVerifiedContact) {
    return NextResponse.json(
      {
        error: "Verify your email or add a phone number to claim this deal.",
        code: "phone_required",
      },
      { status: 403 }
    );
  }

  const { dealId, lat, lng } = await request.json();
  if (!dealId) {
    return NextResponse.json({ error: "Missing dealId." }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `claim:${appUser.id}`,
    CLAIM_RATE_LIMIT,
    CLAIM_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many claim attempts — wait a moment and try again." },
      { status: 429 }
    );
  }

  const supabase = createClient();
  const service = createServiceClient();

  const gps = parseGpsCoords(lat, lng);
  const consumerGpsWkt = gps ? `SRID=4326;POINT(${gps.lng} ${gps.lat})` : null;

  const { data, error } = await supabase
    .rpc("claim_deal", {
      p_user_id: appUser.id,
      p_deal_id: dealId,
      p_consumer_device_id: null,
      p_consumer_gps: consumerGpsWkt,
    })
    .single<{
      redemption_id: string;
      otp_code: string;
      redemption_expires_at: string;
      merchant_id: string;
      /** Nullable since D162 — a coordinate-only shop is a normal shop. */
      what3words_address: string | null;
    }>();

  if (error || !data) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not start redemption. Please try again.";

    if (
      message.includes("deal_not_found") ||
      message.includes("merchant_not_available")
    ) {
      status = 404;
      userMessage = "This deal is no longer available.";
    } else if (message.includes("deal_not_active")) {
      // Raised by claim_deal since 20260720120000 and unmapped until
      // 2026-08-14, so an inactive deal reported as an unexplained server
      // error. Checked before `deal_paused`: both are "off right now", and
      // only this one has no other branch that could catch it.
      status = 410;
      userMessage = "This deal isn't running right now.";
    } else if (message.includes("deal_paused")) {
      status = 409;
      userMessage = "This deal is paused — no new claims right now.";
      return NextResponse.json(
        { error: userMessage, code: "deal_paused" },
        { status }
      );
    } else if (message.includes("deal_expired")) {
      status = 410;
      userMessage = "This deal has expired.";
      return NextResponse.json(
        { error: userMessage, code: "deal_expired" },
        { status }
      );
    } else if (message.includes("deal_claim_limit_reached")) {
      // D236. Nine of ten simultaneous claimants for a final slot land here,
      // and so does anyone whose page was rendered before the allocation ran
      // out. The code lets the client re-render the deal in its real
      // sold-out state instead of leaving a live Claim button and a stale
      // "N left" under an error message that contradicts them.
      status = 410;
      userMessage = "This deal is fully claimed.";
      return NextResponse.json(
        { error: userMessage, code: "deal_claim_limit_reached" },
        { status }
      );
    } else if (message.includes("active_claim_already_exists")) {
      status = 409;
      userMessage = "You already have an active claim on this deal.";
    } else if (
      message.includes("unauthorized") ||
      message.includes("permission denied")
    ) {
      // Two different roads to the same place, and both are session failures
      // rather than server faults.
      //
      // `unauthorized` is claim_deal refusing a caller it cannot resolve.
      // "permission denied for function claim_deal" is what Postgres says when
      // the request arrives as `anon` — the RPC grants EXECUTE to
      // `authenticated` and revokes it from `anon` — which is what a missing or
      // rejected Clerk token produces. That string matched nothing here before
      // 2026-08-14, so an expired session was reported as an internal error and
      // the shopper had no idea that signing in again would fix it.
      //
      // The DB's wording never reaches the client: it names a function and a
      // role, and the shopper gets a sentence and a route to act on.
      status = 401;
      userMessage = "Your session has expired — sign in again to claim.";
      console.error("claim_deal authorization failed:", {
        reason: message.includes("permission denied")
          ? "permission_denied"
          : "unauthorized",
      });
      return NextResponse.json(
        { error: userMessage, code: "sign_in_required" },
        { status }
      );
    } else {
      console.error("claim_deal RPC failed:", error);
    }

    return NextResponse.json({ error: userMessage }, { status });
  }

  // ── The claim is committed from here down. ────────────────────────────────
  // Everything below is enrichment: a geofence distance, fraud flags and an
  // analytics event. None of it decides whether the shopper has a ticket, so
  // none of it may decide whether the shopper is *told* they have one. It runs
  // under a hard deadline and every failure inside is swallowed.
  await withDeadline(POST_CLAIM_ENRICHMENT_DEADLINE_MS, async () => {
    let hasFraudFlags = false;

    if (gps) {
      try {
        // The shop's own stored coordinates come first (D162): they are the
        // canonical location, they cost one indexed read instead of a call to a
        // third party, and they are the only thing a coordinate-only shop has
        // — `claim_deal` returns the address, which is now nullable, so the
        // what3words lookup alone would silently stop producing a geofence
        // distance for exactly the shops onboarded since the ruling.
        //
        // what3words remains the fallback for older rows that carry words but
        // no GPS. Both paths are enrichment: a failure costs a null distance,
        // never the shopper's ticket.
        const shopCoords =
          (await merchantCoordinates(service, data.merchant_id)) ??
          (data.what3words_address
            ? await convertWhat3WordsToCoordinates(data.what3words_address)
            : null);
        const distance = shopCoords
          ? Math.round(distanceMeters(gps, shopCoords))
          : null;

        const { data: flags } = await service.rpc("guardian_check", {
          p_merchant_id: data.merchant_id,
          p_user_id: appUser.id,
          p_consumer_device: null,
          p_consumer_gps: consumerGpsWkt,
          p_merchant_device: null,
          p_distance_m: distance,
        });

        const fraudFlags = (flags as string[] | null) ?? [];
        hasFraudFlags = fraudFlags.length > 0;
        await service
          .from("redemptions")
          .update({
            distance_from_shop: distance,
            fraud_flags: fraudFlags.length > 0 ? fraudFlags : null,
            review_required: fraudFlags.length > 0,
          })
          .eq("id", data.redemption_id);
      } catch (err) {
        // Reason only. The shopper's coordinates and the shop's address stay
        // out of the log line.
        console.error("post-claim fraud pass failed:", {
          reason: err instanceof Error ? err.name : "unknown",
        });
      }
    }

    try {
      const clerkUserId = await currentClerkUserId();
      if (clerkUserId) {
        const { data: dealMeta } = await service
          .from("deals")
          .select("node")
          .eq("id", dealId)
          .maybeSingle();
        void captureDealClaimed({
          clerkUserId,
          redemptionId: data.redemption_id,
          dealId,
          merchantId: data.merchant_id,
          hadGps: !!gps,
          hasFraudFlags,
          node: dealMeta?.node,
        });
      }
    } catch (err) {
      console.error("post-claim analytics failed:", {
        reason: err instanceof Error ? err.name : "unknown",
      });
    }
  });

  return NextResponse.json({
    redemptionId: data.redemption_id,
    expiresAt: data.redemption_expires_at,
  });
}
