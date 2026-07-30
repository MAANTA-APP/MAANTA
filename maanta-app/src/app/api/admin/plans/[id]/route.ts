import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";

const TRIAL_DAYS = 30; // matches activate_merchant's DB behavior

/**
 * 11f Plans & trials actions.
 * mark-paid   — trial converts to a paid Elite subscription.
 * downgrade   — back to Standard (also ends any trial).
 * grant-trial — start a 30-day Elite trial (mirrors activate_merchant). Subject to
 *               the frozen launch-offer cap: enforced in the database by
 *               trg_enforce_elite_trial_cap, so this route cannot exceed it.
 *
 * Note `downgrade` does NOT free a launch-offer slot. `elite_trial_granted_at` is
 * never cleared, so a merchant who took a trial and dropped to Standard has still
 * used one of the 100 — otherwise the cap could be recycled indefinitely.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { action } = await request.json();
  const service = createServiceClient();

  let update: Record<string, unknown>;
  if (action === "mark-paid") {
    update = { tier: "elite", elite_trial_active: false, trial_ends_at: null, grace_period_ends_at: null };
  } else if (action === "downgrade") {
    update = { tier: "standard", elite_trial_active: false, trial_ends_at: null, grace_period_ends_at: null };
  } else if (action === "grant-trial") {
    update = {
      tier: "elite",
      elite_trial_active: true,
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 24 * 3600_000).toISOString(),
      grace_period_ends_at: null,
    };
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { data: rows, error } = await service
    .from("merchants")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id");

  if (error) {
    // `grant-trial` writes the trial columns directly, so it goes through
    // trg_enforce_elite_trial_cap like every other path (that trigger exists
    // precisely because this route used to bypass activate_merchant's checks).
    //
    // Unlike activation — where a full offer means "go live on Standard" — an
    // explicit grant here RAISES, and we surface it as a 409 rather than a 500:
    // the admin asked for this specific merchant to get a trial, so silently
    // doing nothing would be worse than saying the offer is gone.
    if (error.message?.includes("ELITE_TRIAL_CAP_REACHED")) {
      return NextResponse.json(
        {
          error:
            "The 30-day Elite trial launch offer is fully claimed — every slot at the launch node has been used. Use “Mark paid” to put this shop on paid Elite, or raise the cap in app_config.elite_trial_merchant_cap with a decisions-log entry.",
        },
        { status: 409 }
      );
    }
    console.error("plan action failed:", error);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: `merchant.${action}`,
    targetType: "merchant",
    targetId: params.id,
    details: update,
  });

  return NextResponse.json({ ok: true });
}
