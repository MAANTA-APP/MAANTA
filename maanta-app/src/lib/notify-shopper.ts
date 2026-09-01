import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushNotification } from "@/lib/webpush";

/** Best-effort push copy of a durable shopper notification. */
export async function notifyShopper(
  service: SupabaseClient,
  shopperId: string,
  payload: { title: string; body: string; url?: string }
) {
  const { data: shopper } = await service
    .from("users")
    .select("push_subscription")
    .eq("id", shopperId)
    .maybeSingle();

  if (!shopper?.push_subscription) return false;
  return sendPushNotification(shopper.push_subscription, payload);
}
