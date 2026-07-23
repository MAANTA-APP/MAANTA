import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";

/**
 * Admin fee-reversal wallet credit (frozen policy, Decisions Log 2026-07-22).
 *
 * Credits the merchant's top-up wallet by the redemption's stored success fee
 * when the merchant is clearly in the right. The original redemption row and
 * the original success-fee ledger row are left intact — the money-path RPC
 * public.reverse_success_fee does the credit + audit write atomically and is
 * the ONLY sanctioned way to apply a reversal (no direct balance edits).
 *
 * Admin gate: requireAdminApi at the edge; the RPC re-checks that the recorded
 * approver is a real admin. The admin's app-user id is passed through as the
 * approver because the service client carries no user identity of its own.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const incidentRef =
    typeof body.incidentRef === "string" && body.incidentRef.trim()
      ? body.incidentRef.trim()
      : null;
  const note =
    typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const service = createServiceClient();
  const { data, error } = await service
    .rpc("reverse_success_fee", {
      p_redemption_id: params.id,
      p_admin_user_id: auth.user.id,
      p_incident_ref: incidentRef,
      p_note: note,
    })
    .single<{
      reversal_id: string;
      transaction_id: string;
      amount: number;
      new_balance: number;
      new_arrears: number;
    }>();

  if (error) {
    const msg = error.message ?? "";
    // Map the RPC's typed failures to HTTP status codes.
    const status = msg.startsWith("redemption_not_found")
      ? 404
      : msg.startsWith("already_reversed")
        ? 409
        : msg.startsWith("no_fee_to_reverse") ||
            msg.startsWith("redemption_not_verified") ||
            msg.startsWith("invalid_amount")
          ? 422
          : msg.startsWith("unauthorized") || msg.startsWith("invalid_approver")
            ? 403
            : 500;

    // Server-side audit log — admin id, redemption ref, timestamp, outcome. The
    // durable trail is the fee_reversals table; this surfaces failures too.
    console.error("fee-reversal failed", {
      adminUserId: auth.user.id,
      redemptionId: params.id,
      incidentRef,
      error: msg,
      at: new Date().toISOString(),
    });

    const friendly =
      status === 404
        ? "Redemption not found."
        : status === 409
          ? "This redemption's fee has already been reversed."
          : status === 422
            ? "This redemption has no reversible success fee."
            : status === 403
              ? "Not authorized to reverse this fee."
              : "Could not reverse the fee. Please try again.";
    return NextResponse.json({ error: friendly }, { status });
  }

  console.info("fee-reversal applied", {
    adminUserId: auth.user.id,
    redemptionId: params.id,
    reversalId: data?.reversal_id,
    walletTransactionId: data?.transaction_id,
    amount: data?.amount,
    incidentRef,
    at: new Date().toISOString(),
  });

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: "redemption.reverse_fee",
    targetType: "redemption",
    targetId: params.id,
    details: {
      reversalId: data?.reversal_id,
      amount: data?.amount,
      incidentRef,
      note,
    },
  });

  return NextResponse.json({
    ok: true,
    reversalId: data?.reversal_id,
    amount: data?.amount,
    newBalance: data?.new_balance,
    newArrears: data?.new_arrears,
  });
}
