import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireAdminApi } from "@/lib/admin";
import { logAdminOp } from "@/lib/admin-audit";
import {
  buildTicketDescription,
  isEscalationOrigin,
  isIntakeChannel,
} from "@/lib/support-intake";

/**
 * 11e Create a support ticket from the admin console.
 *
 * Tickets land in the same `agent_tasks` queue the support screen reads — one
 * queue, not a parallel "admin tickets" table that would need its own screen,
 * override flow and audit trail. The schema bounds what can be created:
 * `merchant_id` is NOT NULL, so every ticket names a merchant, and `task_type`
 * is CHECK-locked to the six existing values. Intake channel and escalation
 * origin are recorded as the description's structured first line (see
 * lib/support-intake.ts for why).
 */

/** Mirror of the DB CHECK — validated here so a bad value is a typed 400, not a 500. */
const TASK_TYPES = [
  "retraining",
  "audit",
  "suspension_review",
  "fraud_review",
  "onboarding_followup",
  "dispute_review",
] as const;
const PRIORITIES = ["low", "normal", "high", "critical"] as const;

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  let body: {
    merchantId?: string;
    taskType?: string;
    priority?: string;
    channel?: string;
    origin?: string;
    description?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const taskType = body.taskType ?? "";
  const priority = body.priority ?? "normal";
  const channel = body.channel ?? "";
  const origin = body.origin ?? "direct";

  if (!body.merchantId) {
    return NextResponse.json({ error: "Pick the merchant this is about." }, { status: 400 });
  }
  if (!(TASK_TYPES as readonly string[]).includes(taskType)) {
    return NextResponse.json({ error: "Pick an issue type." }, { status: 400 });
  }
  if (!(PRIORITIES as readonly string[]).includes(priority)) {
    return NextResponse.json({ error: "Invalid priority." }, { status: 400 });
  }
  if (!isIntakeChannel(channel)) {
    return NextResponse.json({ error: "Pick how this issue reached you." }, { status: 400 });
  }
  if (!isEscalationOrigin(origin)) {
    return NextResponse.json({ error: "Invalid escalation origin." }, { status: 400 });
  }

  const service = createServiceClient();

  // Verify the merchant exists up front: the FK would reject it anyway, but as
  // an opaque 500 instead of an actionable message.
  const { data: merchant } = await service
    .from("merchants")
    .select("id")
    .eq("id", body.merchantId)
    .maybeSingle();
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found." }, { status: 404 });
  }

  const { data: created, error } = await service
    .from("agent_tasks")
    .insert({
      merchant_id: body.merchantId,
      task_type: taskType,
      priority,
      description: buildTicketDescription(channel, origin, body.description ?? ""),
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("support ticket insert failed:", error);
    return NextResponse.json({ error: "Could not create the ticket." }, { status: 500 });
  }

  await logAdminOp(service, {
    adminUserId: auth.user.id,
    action: "agent_task.create",
    targetType: "agent_task",
    targetId: created.id,
  });

  return NextResponse.json({ ok: true, id: created.id });
}
