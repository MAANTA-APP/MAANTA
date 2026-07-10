import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";

const TRIAL_DAYS = 30; // matches activate_merchant's DB behavior

/**
 * 11f Plans & trials actions.
 * mark-paid   — trial converts to a paid Elite subscription.
 * downgrade   — back to Standard (also ends any trial).
 * grant-trial — start a 30-day Elite trial (mirrors activate_merchant).
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
    console.error("plan action failed:", error);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
