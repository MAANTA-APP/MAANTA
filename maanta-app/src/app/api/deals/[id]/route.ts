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
    .select("id, merchant_id, is_active, is_paused, claims_issued, max_claims")
    .eq("id", params.id)
    .eq("merchant_id", merchant.id)
    .maybeSingle<{
      id: string;
      merchant_id: string;
      is_active: boolean;
      is_paused: boolean;
      claims_issued: number;
      max_claims: number | null;
    }>();

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
      const nextMax = isNaN(n) || n <= 0 ? null : Math.min(n, 10000);
      // D236 INVARIANT D: the allocation may be lowered to stop further
      // claiming, but never below the number of codes already handed out —
      // that would retroactively un-promise a code a shopper is holding.
      // `deals_claims_issued_within_allocation` refuses it at the database
      // too; this branch exists so the merchant reads a sentence about their
      // own deal instead of a 500, and so the reason names the real number.
      if (nextMax !== null && nextMax < deal.claims_issued) {
        return NextResponse.json(
          {
            error:
              deal.claims_issued === 1
                ? "1 shopper has already claimed this deal, so the limit can't go below 1. Pause the deal to stop new claims without affecting it."
                : `${deal.claims_issued} shoppers have already claimed this deal, so the limit can't go below ${deal.claims_issued}. Pause the deal to stop new claims without affecting them.`,
            code: "below_claims_issued",
            claimsIssued: deal.claims_issued,
          },
          { status: 409 }
        );
      }
      update.max_claims = nextMax;
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
  // 20260818150000 applied, the rest of the edit still lands rather than the
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
      "deals.category is absent on this database — applying the edit without it. Apply supabase/migrations/20260818150000_deal_categories.sql."
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
    // The database constraint is the authority on the allocation, and it can
    // still fire when a claim lands between the read above and this write.
    // Reporting that race as "Could not update the deal" would hide the one
    // fact the merchant needs.
    if (error.code === "23514" && String(error.message).includes("claims_issued_within_allocation")) {
      return NextResponse.json(
        {
          error:
            "A shopper claimed this deal while you were editing, so that limit is now below the number already claimed. Reopen the deal to see the current count.",
          code: "below_claims_issued",
        },
        { status: 409 }
      );
    }
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
