import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { logAdminOp } from "@/lib/admin-audit";
import { isLeadLostReason, isLeadStage } from "@/lib/growth/leads";

export const dynamic = "force-dynamic";

/**
 * Move a lead between stages.
 *
 * Two things happen beyond the update:
 *
 * `first_contacted_at` is stamped on the first move out of `new`, and only then.
 * That timestamp is what the published 1-business-day reply promise is measured
 * against, so re-stamping it on a later move would let a lead that sat untouched
 * for a week be silently un-marked as late.
 *
 * The move is audit-logged like every other admin mutation. A lead's stage is
 * the record of what the team actually did at Node 0, and cohort one's whole
 * value is that the record is true.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { stage, lostReason } = body as { stage?: unknown; lostReason?: unknown };
  if (!isLeadStage(stage)) {
    return NextResponse.json({ error: "Unknown stage." }, { status: 400 });
  }
  if (stage === "lost" && !isLeadLostReason(lostReason)) {
    return NextResponse.json(
      { error: "A lost lead needs a reason from the list." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const { data: existing, error: readError } = await service
    .from("growth_merchant_leads")
    .select("id, stage, first_contacted_at")
    .eq("id", params.id)
    .maybeSingle();

  if (readError) {
    console.error("growth: lead read failed:", readError.message);
    return NextResponse.json({ error: "Could not read that lead." }, { status: 502 });
  }
  if (!existing) {
    return NextResponse.json({ error: "No such lead." }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    stage,
    lost_reason: stage === "lost" ? lostReason : null,
    updated_at: new Date().toISOString(),
  };
  // Stamped once, on the way out of `new`.
  if (existing.stage === "new" && stage !== "new" && !existing.first_contacted_at) {
    update.first_contacted_at = new Date().toISOString();
  }

  const { error: writeError } = await service
    .from("growth_merchant_leads")
    .update(update)
    .eq("id", params.id);

  if (writeError) {
    console.error("growth: lead update failed:", writeError.message);
    return NextResponse.json({ error: "Could not move the lead." }, { status: 502 });
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: "growth.lead.stage",
    targetType: "growth_lead",
    targetId: params.id,
    details: { from: existing.stage, to: stage, lostReason: lostReason ?? null },
  });

  return NextResponse.json({ ok: true });
}
