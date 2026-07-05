import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushNotification } from "@/lib/webpush";

export async function notifyMerchant(
  service: SupabaseClient,
  merchantId: string,
  payload: { title: string; body: string; url?: string }
) {
  const { data: merchant } = await service
    .from("merchants")
    .select("user_id")
    .eq("id", merchantId)
    .maybeSingle();

  if (!merchant?.user_id) return;

  const { data: merchantUser } = await service
    .from("users")
    .select("push_subscription")
    .eq("id", merchant.user_id)
    .maybeSingle();

  if (!merchantUser?.push_subscription) return;

  await sendPushNotification(merchantUser.push_subscription, payload);
}
