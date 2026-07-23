import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";

/**
 * Guardian v1 admin override path for a HELD (soft-blocked) redemption
 * (docs/maanta-guardian-v1.md §3). approve=true → flagged→success and the
 * KES 30 fee is applied through the frozen money path (charged/owed/unknown);
 * approve=false → flagged→failed, no fee. Admin only; the RPC itself is
 * service_role/admin-gated and re-checks the held status atomically.
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
    .rpc("admin_release_redemption", {
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
    if (message.includes("redemption_not_held")) {
      return NextResponse.json(
        { error: "This redemption is no longer held — it may have already been actioned." },
        { status: 409 }
      );
    }
    if (message.includes("unauthorized")) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }
    console.error("admin_release_redemption RPC failed:", error);
    return NextResponse.json({ error: "Could not action this redemption." }, { status: 500 });
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: approve ? "redemption.release_approve" : "redemption.release_reject",
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
