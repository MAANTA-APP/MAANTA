import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchant } from "@/lib/merchant-api";

/** Move the remaining boost window to another deal (wireframe 10f) via move_boost RPC. */
export async function POST(request: Request) {
  const auth = await requireMerchant("can_purchase");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const { fromDealId, toDealId } = await request.json();
  if (!fromDealId || !toDealId || fromDealId === toDealId) {
    return NextResponse.json({ error: "Pick a different deal." }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("move_boost", {
      p_merchant_id: merchant.id,
      p_from_deal_id: fromDealId,
      p_to_deal_id: toDealId,
    })
    .single<{ boost_id: string; boost_ends_at: string }>();

  if (error || !data) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not move the boost.";
    if (message.includes("BOOST_ELITE_ONLY")) {
      status = 403;
      userMessage = "Boost is an Elite-only feature. Upgrade to Elite to move boosts.";
    } else if (message.includes("no_active_boost")) {
      status = 404;
      userMessage = "No active boost to move.";
    } else if (message.includes("target_deal_not_active")) {
      status = 409;
      userMessage = "The target deal isn't live.";
    } else if (message.includes("unauthorized")) {
      status = 403;
      userMessage = "Not authorized.";
    } else {
      console.error("move_boost RPC failed:", error);
    }
    return NextResponse.json({ error: userMessage }, { status });
  }

  return NextResponse.json({ boostId: data.boost_id, endsAt: data.boost_ends_at });
}
