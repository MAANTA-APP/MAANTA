import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";

/**
 * Staff dismiss a queue entry — the shopper drops off the list, and the
 * underlying claim is deliberately UNTOUCHED (§27): dismissing is "they
 * left the counter", not a rejection. The code still resolves on the keypad
 * and still verifies through the normal path.
 *
 * Doubly scoped like every merchant write: the row must belong to THIS
 * merchant (`merchant_id` from the authenticated context, never the body).
 */
export async function POST(request: Request) {
  const auth = await requireMerchant("can_verify");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  let body: { presentationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const presentationId =
    typeof body.presentationId === "string" ? body.presentationId.trim() : "";
  if (!presentationId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data } = await service
    .from("merchant_presentations")
    .update({ status: "dismissed" })
    .eq("id", presentationId)
    .eq("merchant_id", merchant.id)
    .eq("status", "waiting")
    .select("id");

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Not in the queue." }, { status: 404 });
  }
  return NextResponse.json({ dismissed: true });
}
