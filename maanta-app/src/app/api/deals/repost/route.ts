import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";

/**
 * Repost an archived deal (wireframe 10q/10p): re-insert from the
 * archive_history snapshot. The insert goes through all deal triggers
 * (limit, expiry, fee, zero-balance) like any new deal.
 */
export async function POST(request: Request) {
  const auth = await requireMerchant("can_deals");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const { archiveId } = await request.json();
  if (!archiveId) {
    return NextResponse.json({ error: "Missing archiveId." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: entry } = await service
    .from("archive_history")
    .select("id, merchant_id, deal_snapshot")
    .eq("id", archiveId)
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (!entry) {
    return NextResponse.json({ error: "Archived deal not found." }, { status: 404 });
  }

  const snap = entry.deal_snapshot as Record<string, unknown>;
  const { data: deal, error } = await service
    .from("deals")
    .insert({
      merchant_id: merchant.id,
      node: (snap.node as string) ?? merchant.node,
      title: snap.title,
      description: snap.description ?? null,
      image_url: snap.image_url,
      deal_type: snap.deal_type ?? "standard",
      flash_duration_hours: snap.flash_duration_hours ?? 6,
      max_claims: snap.max_claims ?? null,
    })
    .select("id")
    .single();

  if (error || !deal) {
    const message = error?.message ?? "";
    let status = 500;
    let userMessage = "Could not repost the deal.";
    if (message.includes("Deal limit reached")) {
      status = 409;
      userMessage = message;
    } else if (message.includes("Flash deals are only available")) {
      status = 403;
      userMessage = "Flash deals are only available on the Elite plan.";
    } else if (message.includes("INSUFFICIENT_BALANCE_FOR_NEW_DEAL")) {
      status = 402;
      userMessage = "Your wallet balance is too low — top up before reposting.";
    } else {
      console.error("repost failed:", error);
    }
    return NextResponse.json({ error: userMessage }, { status });
  }

  await service
    .from("archive_history")
    .update({ reposted_at: new Date().toISOString(), reposted_deal_id: deal.id })
    .eq("id", entry.id);

  return NextResponse.json({ dealId: deal.id });
}
