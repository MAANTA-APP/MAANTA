import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";
import {
  APPROVE_NOTICE_TRIAL_SKIPPED,
  APPROVE_NOTICE_TRIAL_UNCONFIRMED,
} from "@/lib/elite-trial";

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
    // Map the failures activate_merchant actually raises, and never return the
    // raw message: a Postgres exception can carry table, column, constraint,
    // trigger and policy names into the browser and the network tab. Same shape
    // as the other admin routes (plans, release, appeal, reverse-fee) — known
    // strings get a specific status and curated copy, everything else gets one
    // generic sentence with the detail kept in the server log.
    const message = error.message ?? "";
    if (message.includes("merchant_not_found")) {
      return NextResponse.json({ error: "Shop not found." }, { status: 404 });
    }
    if (message.includes("already_active")) {
      return NextResponse.json(
        { error: "This shop is already approved." },
        { status: 409 }
      );
    }
    if (message.includes("unauthorized")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("Failed to activate merchant:", error);
    return NextResponse.json(
      { error: "Could not approve this shop." },
      { status: 500 }
    );
  }

  // What actually happened. Logging the request as if it were the outcome would
  // put "granted a trial" in the audit trail for a merchant that never got one —
  // the audit log has to record the fee/entitlement reality, not the intent.
  //
  // Three outcomes, not two. If the read-back itself fails we do not know, and
  // collapsing that into `false` would be the same class of lie in the other
  // direction: the log would claim the cap was reached and the admin would be
  // told Standard was applied, on a merchant that may well have got the trial.
  // Unknown is recorded as unknown.
  type TrialOutcome = "granted" | "skipped_cap_reached" | "unknown";
  let outcome: TrialOutcome | null = null;

  if (grantEliteTrial) {
    const { data: merchant, error: readError } = await service
      .from("merchants")
      .select("elite_trial_active")
      .eq("id", params.id)
      .maybeSingle();

    if (readError || !merchant) {
      console.error(
        "Could not confirm Elite trial outcome after activation:",
        readError
      );
      outcome = "unknown";
    } else {
      outcome = merchant.elite_trial_active === true ? "granted" : "skipped_cap_reached";
    }
  }

  await logAdminOp(service, {
    adminUserId: appUser.id,
    action: "merchant.approve",
    targetType: "merchant",
    targetId: params.id,
    details: {
      grantEliteTrial,
      // null when no trial was requested; otherwise the verified outcome.
      eliteTrialOutcome: outcome,
      eliteTrialGranted: outcome === "granted",
    },
  });

  return NextResponse.json({
    success: true,
    eliteTrialGranted: outcome === "granted",
    eliteTrialOutcome: outcome,
    // Surfaced so the approve modal can tell the admin what really happened
    // rather than implying a trial that may not exist.
    ...(outcome === "skipped_cap_reached"
      ? { notice: APPROVE_NOTICE_TRIAL_SKIPPED }
      : {}),
    ...(outcome === "unknown"
      ? { notice: APPROVE_NOTICE_TRIAL_UNCONFIRMED }
      : {}),
  });
}
