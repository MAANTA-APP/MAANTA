import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";

/**
 * Guardian v1 hard-block appeal (docs/maanta-guardian-v1.md §3). A hard-blocked
 * redemption was DECLINED at the counter with no fee moved. This lets an admin
 * overturn a false positive after the fact:
 *   approve=true  → failed→success and the KES 30 fee is applied through the
 *                   frozen money path (charged/owed/unknown);
 *   approve=false → stays failed, no fee, marked guardian_appeal_rejected.
 * Admin only; the RPC re-checks the appealable state atomically.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { approve } = await request.json();
  if (typeof approve !== "boolean") {
    return NextResponse.json({ error: "Missing approve flag." }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .rpc("admin_appeal_hard_block", {
      p_redemption_id: params.id,
      p_approve: approve,
    })
    .single<{
      redemption_id: string;
      redemption_status: string;
      fee_charge_status: "charged" | "owed" | "unknown" | null;
      fee_amount: number | null;
      new_balance: number | null;
      new_arrears: number | null;
    }>();

  if (error || !data) {
    const message = error?.message ?? "";
    if (message.includes("redemption_not_appealable")) {
      return NextResponse.json(
        { error: "This redemption can't be appealed — it wasn't hard-blocked, or it's already been actioned." },
        { status: 409 }
      );
    }
    if (message.includes("unauthorized")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("admin_appeal_hard_block RPC failed:", error);
    return NextResponse.json({ error: "Could not action this appeal." }, { status: 500 });
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: approve ? "redemption.appeal_approve" : "redemption.appeal_reject",
    targetType: "redemption",
    targetId: params.id,
    details: {
      redemptionStatus: data.redemption_status,
      feeChargeStatus: data.fee_charge_status,
    },
  });

  return NextResponse.json({
    ok: true,
    status: data.redemption_status,
    feeChargeStatus: data.fee_charge_status,
    feeAmount: data.fee_amount,
    newBalance: data.new_balance,
  });
}
