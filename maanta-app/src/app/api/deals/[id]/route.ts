import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireMerchant } from "@/lib/merchant-api";
import { isDealCategory } from "@/lib/deal-categories";
import { isMissingDealCategoryColumnError } from "@/lib/supabase/postgrest-errors";

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
    // Correcting a category is an edit like any other. An unrecognised key is
    // ignored rather than 400'd, so a stale client cannot make the rest of the
    // edit — the title fix the merchant actually came here for — fail with it.
    if (isDealCategory(body.category)) update.category = body.category;
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const patch = { ...update, updated_at: new Date().toISOString() };
  let { error } = await service.from("deals").update(patch).eq("id", deal.id);

  // Same degradation as the create path: on a database that has not had
  // 20260818120000 applied, the rest of the edit still lands rather than the
  // merchant being told their title change failed.
  if (error && "category" in patch && isMissingDealCategoryColumnError(error)) {
    console.error(
      "deals.category is absent on this database — applying the edit without it. Apply supabase/migrations/20260818120000_deal_categories.sql."
    );
    const rest = { ...patch };
    delete rest.category;
    ({ error } = await service.from("deals").update(rest).eq("id", deal.id));
  }

  if (error) {
    console.error("deal update failed:", error);
    return NextResponse.json({ error: "Could not update the deal." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
