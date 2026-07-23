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

  // activate_merchant grants a 30-day Elite trial when requested (DB behavior;
  // wireframe 11j says 14 days — flagged as an open spec/DB conflict).
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

  await logAdminOp(service, {
    adminUserId: appUser.id,
    action: "merchant.approve",
    targetType: "merchant",
    targetId: params.id,
    details: { grantEliteTrial },
  });

  return NextResponse.json({ success: true });
}
