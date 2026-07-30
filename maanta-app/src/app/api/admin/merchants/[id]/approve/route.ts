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
  // Note the grant is opt-in per approval, not automatic: the frozen launch
  // offer ("first 100 BBS Mall merchants") has no cap or node check anywhere in
  // code or app_config, so honouring the cap is currently an admin discipline
  // question, not an enforced invariant. Open decision D2 in
  // docs/skills/truth-audit-2026-07-30.md.
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
