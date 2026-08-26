import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { isValidOtpCode } from "@/lib/otp";
import { checkRateLimit, OTP_CHECK_RATE_LIMIT, OTP_CHECK_RATE_WINDOW_SECONDS } from "@/lib/rate-limit";
import { captureFastVisitAwarded, captureGuardianOutcome } from "@/lib/analytics";
import { maskPhone } from "@/lib/phone-mask";

export async function POST(request: Request) {
  const auth = await requireMerchant("can_verify");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const { otpCode, override, overrideReason } = await request.json();
  if (!isValidOtpCode(otpCode)) {
    return NextResponse.json({ error: "Invalid code format." }, { status: 400 });
  }

  const allowed = await checkRateLimit(
    `otp-check:${merchant.id}`,
    OTP_CHECK_RATE_LIMIT,
    OTP_CHECK_RATE_WINDOW_SECONDS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many attempts — wait a moment and try again." },
      { status: 429 }
    );
  }

  const supabase = createClient();
  const service = createServiceClient();

  const { data, error } = await supabase
    .rpc("verify_redemption", {
      p_merchant_id: merchant.id,
      p_otp_code: otpCode,
      p_merchant_device_id: null,
      p_override: override === true,
      p_override_reason:
        override === true && typeof overrideReason === "string" && overrideReason
          ? overrideReason.slice(0, 500)
          : null,
    })
    .single<{
      redemption_id: string;
      redemption_status: "success" | "held" | "blocked";
      fee_charge_status: "charged" | "owed" | "unknown" | null;
      fee_amount: number | null;
      new_balance: number | null;
      new_arrears: number | null;
      deal_id: string;
      deal_claims_count: number | null;
      disputed: boolean;
      guardian_recommendation: "clear" | "flag" | "soft_block" | "hard_block" | null;
      guardian_severity: "info" | "warn" | "block" | null;
    }>();

  if (error || !data) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not complete redemption.";

    if (message.includes("redemption_not_found_or_already_used")) {
      status = 404;
      userMessage = "Invalid or already-used code.";
    } else if (message.includes("redemption_expired")) {
      status = 410;
      userMessage = "This code has expired.";
    } else if (message.includes("redemption_already_verified")) {
      status = 409;
      userMessage = "This code has already been redeemed.";
      // Award repair (Codex P2, 2026-08-26): verify_redemption committed on
      // an earlier call, so if THAT call died between verify and award the
      // reward would otherwise wait for the shopper to reopen their ticket.
      // A merchant retry lands here — re-run the idempotent award for the
      // most recent success under this code so the retry itself heals the
      // gap. The UNIQUE reference makes a double call a no-op, and the RPC
      // pays only a redemption that genuinely holds the persisted
      // arrival-time qualification, so a wrong or historical row match can
      // never mint an undeserved award. Best-effort: the 409 is returned
      // unchanged either way.
      try {
        const { data: verified } = await service
          .from("redemptions")
          .select("id")
          .eq("merchant_id", merchant.id)
          .eq("otp_code", otpCode)
          .eq("status", "success")
          .order("redeemed_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string }>();
        if (verified?.id) {
          await service.rpc("award_fast_visit_points", {
            p_redemption_id: verified.id,
          });
        }
      } catch {
        // The ticket success screen's self-heal call remains the backstop.
      }
    } else if (message.includes("unauthorized")) {
      status = 403;
      userMessage = "Not authorized.";
    } else {
      console.error("verify_redemption RPC failed:", error);
    }

    return NextResponse.json({ error: userMessage }, { status });
  }

  // Guardian analytics (docs/maanta-guardian-v1.md §Analytics). Fired for
  // EVERY outcome (clear/flag/soft_block/hard_block) before the block/held
  // branches below. Best-effort and non-blocking — `void`ed so the counter is
  // never delayed, and a no-op unless PostHog is configured.
  void captureGuardianOutcome({
    merchantId: merchant.id,
    redemptionId: data.redemption_id,
    dealId: data.deal_id,
    recommendation: data.guardian_recommendation,
    severity: data.guardian_severity,
    redemptionStatus: data.redemption_status,
    feeChargeStatus: data.fee_charge_status,
    disputed: data.disputed === true,
    node: merchant.node,
  });

  // Guardian v1 block/held outcomes (docs/maanta-guardian-v1.md §3). No money
  // moved. Copy stays non-accusatory and in the existing in-ink error style —
  // it never names fraud to the counter.
  if (data.redemption_status === "blocked") {
    return NextResponse.json(
      { error: "We couldn't complete this redemption right now. Please try again later or reach out to support." },
      { status: 409 }
    );
  }
  if (data.redemption_status === "held") {
    return NextResponse.json(
      { error: "This redemption needs a quick review before it can be completed. Our team will take a look shortly." },
      { status: 409 }
    );
  }

  const { data: deal } = await service
    .from("deals")
    .select("title")
    .eq("id", data.deal_id)
    .maybeSingle();

  // "Collect from shopper" — the YOU PAY amount snapshotted onto the redemption
  // at claim time (migrations 20260719233037 / 20260720120000, via
  // you_pay_kes(price, charges)). We surface it read-only so the counter knows
  // how much cash to take from the shopper. This is NOT an in-app charge and is
  // wholly distinct from the KES 30 success fee — no money-path behaviour
  // changes here, it is a display value pulled from an already-persisted column.
  // Legacy rows with no snapshot come back null → the UI omits the line.
  const { data: redemptionRow } = await service
    .from("redemptions")
    .select("amount_kes, user_id")
    .eq("id", data.redemption_id)
    .maybeSingle<{ amount_kes: number | string | null; user_id: string | null }>();
  const collectAmount =
    redemptionRow?.amount_kes != null && Number.isFinite(Number(redemptionRow.amount_kes))
      ? Number(redemptionRow.amount_kes)
      : null;

  // Masked shopper phone for the success takeover (same read-only, server-masked
  // value the preflight discloses — the full number never reaches the client).
  let maskedPhone: string | null = null;
  if (redemptionRow?.user_id) {
    const { data: shopper } = await service
      .from("users")
      .select("phone")
      .eq("id", redemptionRow.user_id)
      .maybeSingle<{ phone: string | null }>();
    maskedPhone = maskPhone(shopper?.phone);
  }

  // Fast Visit reward — awarded HERE, at the moment of verification, so the
  // shopper's points do not depend on them ever reopening the app. The RPC
  // re-derives every condition from server-stamped timestamps and is
  // exactly-once by a UNIQUE reference, so a retry, a replay, or the ticket
  // screen's self-heal call can never double-award. Best-effort: a reward
  // hiccup must never fail the counter, and the RESPONSE IS UNCHANGED — the
  // shopper's points are not the merchant till's business.
  try {
    const { data: fastVisit, error: awardError } = await service
      .rpc("award_fast_visit_points", { p_redemption_id: data.redemption_id })
      .single<{ awarded: boolean; points: number; balance: number }>();
    if (awardError) {
      // PostgREST failures resolve as { error } rather than throwing, so the
      // catch below never sees them — log here or the miss is invisible.
      // Durability does not depend on this call: a merchant retry of the same
      // code re-runs the award (the redemption_already_verified path above),
      // and the ticket success screen self-heals.
      console.error("award_fast_visit_points errored:", awardError.code);
    }
    if (fastVisit?.awarded && redemptionRow?.user_id) {
      void captureFastVisitAwarded({
        userId: redemptionRow.user_id,
        redemptionId: data.redemption_id,
        merchantId: merchant.id,
        dealId: data.deal_id,
        points: fastVisit.points,
        node: merchant.node,
      });
    }
  } catch (err) {
    console.error("award_fast_visit_points failed:", (err as Error)?.name);
  }

  // Server-issued verification timestamp. This is the instant the server
  // confirmed the redemption (UTC, ISO-8601); the client formats it to the
  // device's local time (East Africa Time at the BBS counter) for display.
  // Distinct from redemptions.redeemed_at, which is set at CLAIM time.
  const verifiedAt = new Date().toISOString();

  return NextResponse.json({
    dealTitle: deal?.title ?? "Deal",
    redemptionId: data.redemption_id,
    feeChargeStatus: data.fee_charge_status,
    feeAmount: data.fee_amount,
    newBalance: data.new_balance,
    collectAmount,
    maskedPhone,
    verifiedAt,
    disputed: data.disputed === true,
  });
}
