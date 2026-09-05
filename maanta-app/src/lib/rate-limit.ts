import { createServiceClient } from "@/lib/supabase/service";

/** Shared bucket for OTP preflight + verify (free oracle + paid action). */
export const OTP_CHECK_RATE_LIMIT = 20;
export const OTP_CHECK_RATE_WINDOW_SECONDS = 60;

export const CLAIM_RATE_LIMIT = 10;
export const CLAIM_RATE_WINDOW_SECONDS = 60;

export const TOPUP_MPESA_RATE_LIMIT = 3;
export const TOPUP_STRIPE_RATE_LIMIT = 5;
export const TOPUP_RATE_WINDOW_SECONDS = 60;

export const ONBOARD_RATE_LIMIT = 3;
export const ONBOARD_RATE_WINDOW_SECONDS = 3600;

export const WAITLIST_RATE_LIMIT = 5;
export const WAITLIST_RATE_WINDOW_SECONDS = 3600;

/** `/api/merchants/interest` — same shape as the waitlist: a public form that mints rows. */
export const MERCHANT_INTEREST_RATE_LIMIT = 5;
export const MERCHANT_INTEREST_RATE_WINDOW_SECONDS = 3600;

export const W3W_VALIDATE_RATE_LIMIT = 30;
export const W3W_VALIDATE_RATE_WINDOW_SECONDS = 60;

/**
 * Deal creation. Each call also accepts a 5MB cover upload, so the cost of an
 * abusive loop is storage, not just rows. The DB triggers cap how many deals
 * can be LIVE (1 Standard / 2 Elite) but not how many create attempts or
 * uploads a merchant can make, which is the gap this closes (SEC-008).
 * Generous enough that a merchant retrying a failed publish never notices.
 */
export const DEAL_CREATE_RATE_LIMIT = 10;
export const DEAL_CREATE_RATE_WINDOW_SECONDS = 300;

/**
 * Push subscription writes. One row per user, overwritten each time — cheap
 * individually, unbounded before this. A real client subscribes once per
 * browser per permission grant, so this is far above normal use.
 */
export const PUSH_SUBSCRIBE_RATE_LIMIT = 20;
export const PUSH_SUBSCRIBE_RATE_WINDOW_SECONDS = 3600;

/** Sliding-window rate limit via check_rate_limit (service_role RPC). */
export async function checkRateLimit(
  bucketKey: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const service = createServiceClient();
  const { data, error } = await service.rpc("check_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("check_rate_limit failed:", error);
    return false;
  }
  return data === true;
}
