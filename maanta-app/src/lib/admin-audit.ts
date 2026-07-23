import type { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type AdminOpTargetType =
  | "merchant"
  | "deal"
  | "redemption"
  | "fraud_event"
  | "agent_task";

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
