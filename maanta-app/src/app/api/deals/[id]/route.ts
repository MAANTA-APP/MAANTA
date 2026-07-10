import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";

/**
 * Manage an existing deal (wireframe 10c/10ab/10p):
 *   action: "pause" | "resume" | "archive" | "edit"
 * Archiving flips is_active=false — the archive_expired_deal trigger
 * snapshots it into archive_history (last 5 kept).
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireMerchant("can_deals");
  if ("error" in auth) return auth.error;
  const { merchant } = auth.ctx;

  const body = await request.json();
  const action = body.action as string;

  const service = createServiceClient();
  const { data: deal } = await service
    .from("deals")
    .select("id, merchant_id, is_active, is_paused")
    .eq("id", params.id)
    .eq("merchant_id", merchant.id)
    .maybeSingle();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found." }, { status: 404 });
  }

  let update: Record<string, unknown> = {};
  if (action === "pause") update = { is_paused: true };
  else if (action === "resume") update = { is_paused: false };
  else if (action === "archive") update = { is_active: false };
  else if (action === "edit") {
    update = {};
    if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
    if (typeof body.description === "string") update.description = body.description.trim() || null;
    if (body.maxClaims !== undefined) {
      const n = parseInt(String(body.maxClaims), 10);
      update.max_claims = isNaN(n) || n <= 0 ? null : Math.min(n, 10000);
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { error } = await service
    .from("deals")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", deal.id);

  if (error) {
    console.error("deal update failed:", error);
    return NextResponse.json({ error: "Could not update the deal." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
