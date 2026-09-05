import type { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type AdminOpTargetType =
  | "merchant"
  | "deal"
  | "redemption"
  | "fraud_event"
  | "agent_task"
  /** D171: blacklisting is the first admin action whose target is a shopper. */
  | "user"
  /* Growth console (2026-09-04). A lead stage change, a campaign edit and a
     revealed waitlist number are admin mutations like any other, and the
     reveal in particular is why this list grew: reading a person's phone
     number off a shared screen is an act, not a view. */
  | "growth_lead"
  | "growth_campaign"
  | "waitlist_contact";

export type AdminOpLogInput = {
  adminUserId: string;
  action: string;
  targetType: AdminOpTargetType;
  targetId: string;
  details?: Record<string, unknown>;
};

/** Best-effort durable audit for admin panel mutations. Never blocks the caller. */
export async function logAdminOp(
  service: ServiceClient,
  input: AdminOpLogInput
): Promise<void> {
  const { error } = await service.from("admin_ops_log").insert({
    admin_user_id: input.adminUserId,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId,
    details: input.details ?? {},
  });
  if (error) {
    console.error("admin_ops_log insert failed:", {
      ...input,
      error: error.message,
    });
  }
}
