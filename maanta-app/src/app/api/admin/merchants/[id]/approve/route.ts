import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  // A7 — use the shared admin gate (same 401/403 behaviour the other
  // /api/admin routes use) instead of open-coding the check here.
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const appUser = auth.user;

  const service = createServiceClient();

  const body = await request.json().catch(() => ({}));
  const grantEliteTrial = body?.grantEliteTrial === true;

  // activate_merchant grants a 30-day Elite trial when requested.
  //
  // 30 days is the frozen rule (Notion "Frozen Scope & Rules"; CLAUDE.md;
  // docs/maanta-decisions-log.md). Wireframe 11j's "14 days" was stale and was
  // resolved against the DB in the 2026-07-29 full-state audit — no longer an
  // open conflict.
  //
  // Since 2026-07-30 the trial is capped at the first 100 launch-node merchants
  // (migration 20260730130000, decision D2). When the offer is exhausted the RPC
  // still activates the merchant, on Standard, and simply does not grant the
  // trial — so `grantEliteTrial` is a REQUEST, not an outcome, and we read the
  // result back below rather than assuming it was honoured.
  const { error } = await service.rpc("activate_merchant", {
    p_merchant_id: params.id,
    p_admin_user_id: appUser.id,
    p_grant_elite_trial: grantEliteTrial,
  });

  if (error) {
    console.error("Failed to activate merchant:", error);
    return NextResponse.json(
      { error: error.message || "Could not approve this shop." },
      { status: 500 }
    );
  }

  // What actually happened. Logging the request as if it were the outcome would
  // put "granted a trial" in the audit trail for a merchant that never got one —
  // the audit log has to record the fee/entitlement reality, not the intent.
  let eliteTrialGranted = false;
  if (grantEliteTrial) {
    const { data: merchant } = await service
      .from("merchants")
      .select("elite_trial_active")
      .eq("id", params.id)
      .maybeSingle();
    eliteTrialGranted = merchant?.elite_trial_active === true;
  }

  await logAdminOp(service, {
    adminUserId: appUser.id,
    action: "merchant.approve",
    targetType: "merchant",
    targetId: params.id,
    details: {
      grantEliteTrial,
      eliteTrialGranted,
      ...(grantEliteTrial && !eliteTrialGranted
        ? { eliteTrialSkippedReason: "launch_offer_cap_reached" }
        : {}),
    },
  });

  return NextResponse.json({
    success: true,
    eliteTrialGranted,
    // Surfaced so the approve modal can tell the admin the shop went live on
    // Standard instead of silently appearing to have granted a trial.
    ...(grantEliteTrial && !eliteTrialGranted
      ? {
          notice:
            "Shop approved on Standard — the 30-day Elite trial launch offer is fully claimed.",
        }
      : {}),
  });
}
