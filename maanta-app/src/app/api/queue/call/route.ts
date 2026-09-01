import { NextResponse } from "next/server";
import { requireMerchant } from "@/lib/merchant-api";
import { createServiceClient } from "@/lib/supabase/service";
import { notifyShopper } from "@/lib/notify-shopper";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Call one shopper forward.
 *
 * The database function owns the atomic state transition + durable inbox row.
 * This route supplies only authenticated context and then attempts web push as
 * a non-authoritative delivery channel. A push failure never rolls back or
 * conceals the durable call.
 */
export async function POST(request: Request) {
  const auth = await requireMerchant("can_verify");
  if ("error" in auth) return auth.error;
  const { merchant, user } = auth.ctx;

  const body = await request.json().catch(() => null);
  const presentationId =
    typeof body?.presentationId === "string" ? body.presentationId.trim() : "";
  if (!UUID_SHAPE.test(presentationId)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .rpc("call_shopper_forward", {
      p_presentation_id: presentationId,
      p_merchant_id: merchant.id,
      p_actor_id: user.id,
    })
    .single<{
      presentation_id: string;
      shopper_id: string;
      merchant_name: string;
      qr_token: string;
      called_at: string;
      newly_called: boolean;
    }>();

  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("queue_call_not_found")) {
      return NextResponse.json({ error: "Not in the live queue." }, { status: 404 });
    }
    if (message.includes("queue_call_unauthorized")) {
      return NextResponse.json({ error: "You don't have permission to do this." }, { status: 403 });
    }
    console.error("call_shopper_forward failed:", error?.code);
    return NextResponse.json({ error: "Could not call the shopper." }, { status: 500 });
  }

  let pushDelivered = false;
  if (data.newly_called) {
    pushDelivered = await notifyShopper(service, data.shopper_id, {
      title: data.merchant_name,
      body: "It's your turn — please go to the counter.",
      url: `/qr/${data.qr_token}`,
    }).catch((error: unknown) => {
      console.error(
        "Shopper call push failed after durable notification committed:",
        error
      );
      return false;
    });
  }

  return NextResponse.json({
    called: true,
    calledAt: data.called_at,
    newlyCalled: data.newly_called,
    pushDelivered,
  });
}
