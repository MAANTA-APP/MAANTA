import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";

/**
 * 11d fraud audit resolution.
 * approve — the redemption is legitimate: resolve the event and clear
 *   review_required on the shopper's affected pending redemption(s).
 * reject — confirmed fraud: resolve the event and fail any still-pending
 *   redemption for that merchant/user (no fee is ever charged for failed
 *   codes; fees only move inside verify_redemption).
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { action } = await request.json();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: event } = await service
    .from("fraud_events")
    .select("id, merchant_id, user_id, resolved")
    .eq("id", params.id)
    .maybeSingle();
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  await service.from("fraud_events").update({ resolved: true }).eq("id", event.id);

  if (event.merchant_id && event.user_id) {
    if (action === "approve") {
      await service
        .from("redemptions")
        .update({ review_required: false })
        .eq("merchant_id", event.merchant_id)
        .eq("user_id", event.user_id)
        .eq("review_required", true)
        .eq("status", "pending");
    } else {
      await service
        .from("redemptions")
        .update({ status: "failed", review_required: false })
        .eq("merchant_id", event.merchant_id)
        .eq("user_id", event.user_id)
        .eq("status", "pending")
        .eq("review_required", true);
    }
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: `fraud.${action}`,
    targetType: "fraud_event",
    targetId: event.id,
    details: {
      merchantId: event.merchant_id,
      userId: event.user_id,
    },
  });

  return NextResponse.json({ ok: true });
}
