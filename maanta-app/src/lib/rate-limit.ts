import { createServiceClient } from "@/lib/supabase/service";

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
    return true;
  }
  return data === true;
}
