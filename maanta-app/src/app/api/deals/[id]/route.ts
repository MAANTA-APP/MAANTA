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

  // Tracked so the response can say what actually happened to the category
  // rather than reporting the whole edit as "ok" and leaving the merchant to
  // discover otherwise — see the degradation branch below.
  let categoryRequested = false;
  let unknownCategory = false;
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
    // Correcting a category is an edit like any other. An unrecognised key does
    // not fail the rest of the edit — a stale client must not be able to sink
    // the title fix the merchant actually came here for — but it is not silently
    // swallowed either: it is reported back, and if it was the ONLY thing asked
    // for, saying "Nothing to update" would be a lie about what was sent.
    if (body.category !== undefined) {
      if (isDealCategory(body.category)) {
        update.category = body.category;
        categoryRequested = true;
      } else {
        unknownCategory = true;
      }
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        {
          error: unknownCategory
            ? "That category isn't one we recognise."
            : "Nothing to update.",
        },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const patch = { ...update, updated_at: new Date().toISOString() };
  let { error } = await service.from("deals").update(patch).eq("id", deal.id);
  let categoryApplied = categoryRequested && !error;

  // Same degradation as the create path: on a database that has not had
  // 20260818120000 applied, the rest of the edit still lands rather than the
  // merchant being told their title change failed.
  //
  // But the create path and this one are NOT the same trade. There, dropping the
  // category saves a deal that would otherwise not exist at all, which is worth
  // it. Here the category may be the ONLY thing the merchant came to change —
  // this sheet is documented as the correction path for pre-taxonomy deals — and
  // returning a bare `ok` after discarding it tells them a correction saved when
  // nothing was written. The client keeps its local selection across
  // `router.refresh()`, so re-opening the sheet shows the chip still chosen and
  // the loss never surfaces. Hence `categorySaved` in the response: the route
  // reports what it actually did, and the sheet says so.
  if (error && "category" in patch && isMissingDealCategoryColumnError(error)) {
    console.error(
      "deals.category is absent on this database — applying the edit without it. Apply supabase/migrations/20260818120000_deal_categories.sql."
    );
    const rest = { ...patch };
    delete rest.category;
    ({ error } = await service.from("deals").update(rest).eq("id", deal.id));
    categoryApplied = false;
    if (Object.keys(rest).length === 1) {
      // `updated_at` only: the category was the whole edit, so there is nothing
      // left to succeed at. Bumping the timestamp and reporting success would be
      // the same lie with an extra write.
      return NextResponse.json(
        {
          error:
            "Categories aren't available on this database yet — the deal is unchanged. Ask an admin to apply the pending migration.",
        },
        { status: 503 }
      );
    }
  }

  if (error) {
    console.error("deal update failed:", error);
    return NextResponse.json({ error: "Could not update the deal." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    // Present only when a category was actually asked for, so every other action
    // (pause, resume, archive, a title-only edit) keeps its existing shape.
    ...(categoryRequested ? { categorySaved: categoryApplied } : {}),
    ...(unknownCategory ? { categorySaved: false } : {}),
  });
}
