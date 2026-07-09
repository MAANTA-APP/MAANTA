import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMerchant } from "@/lib/merchant-api";

/**
 * Purchase a 24h boost from the wallet (wireframe 10e).
 * purchase_boost is a self-authorizing atomic RPC: it reads the canonical
 * fee from app_config, debits the wallet in one guarded UPDATE, writes the
 * boost_flags row + ledger entry, and flips deals.boost_active.
 */
export async function POST(request: Request) {
  const auth = await requireMerchant("can_purchase");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const { dealId } = await request.json();
  if (!dealId) {
    return NextResponse.json({ error: "Missing dealId." }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .rpc("purchase_boost", { p_merchant_id: merchant.id, p_deal_id: dealId })
    .single<{ boost_id: string; new_balance: number; boost_ends_at: string }>();

  if (error || !data) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not purchase the boost.";
    if (message.includes("insufficient_balance")) {
      status = 402;
      userMessage = "Wallet balance too low for a boost — top up first.";
    } else if (message.includes("boost_already_active")) {
      status = 409;
      userMessage = "This deal already has an active boost.";
    } else if (message.includes("deal_not_active") || message.includes("deal_not_found")) {
      status = 404;
      userMessage = "This deal isn't live.";
    } else if (message.includes("unauthorized")) {
      status = 403;
      userMessage = "Not authorized.";
    } else {
      console.error("purchase_boost RPC failed:", error);
    }
    return NextResponse.json({ error: userMessage }, { status });
  }

  return NextResponse.json({
    boostId: data.boost_id,
    newBalance: data.new_balance,
    endsAt: data.boost_ends_at,
  });
}
