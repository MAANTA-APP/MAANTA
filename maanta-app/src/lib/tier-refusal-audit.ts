import type { createServiceClient } from "@/lib/supabase/service";

type ServiceClient = ReturnType<typeof createServiceClient>;

export type TierRefusalType = "deal_limit_exceeded" | "flash_not_allowed";

/**
 * D194 — the DB trigger cannot persist its own refusal audit because the RAISE
 * rolls the INSERT back. Persist the audit only after the caller receives the
 * trigger error, using the same trusted service client. Logging is best effort:
 * it must never turn an honest 403/409 into a 500.
 */
export async function logTierRefusal(
  service: ServiceClient,
  input: {
    merchantId: string;
    flagType: TierRefusalType;
    notes: string;
  }
): Promise<void> {
  const { error } = await service.from("tier_flags").insert({
    merchant_id: input.merchantId,
    flag_type: input.flagType,
    notes: input.notes,
  });

  if (error) {
    console.error("tier refusal audit insert failed", {
      merchantId: input.merchantId,
      flagType: input.flagType,
      error: error.message,
    });
  }
}
