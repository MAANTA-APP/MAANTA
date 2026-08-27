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
  // try/catch, not just the returned { error }: this function's contract is
  // that it never turns an honest 403/409 into a 500, and a rejected promise
  // would do exactly that. In the publish path it is awaited BEFORE the
  // uploaded cover image is cleaned up, so a throw would also orphan a file in
  // the deal-images bucket. supabase-js normally folds transport failures into
  // `error`, but the contract should not depend on that.
  try {
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
  } catch (err) {
    console.error("tier refusal audit insert threw", {
      merchantId: input.merchantId,
      flagType: input.flagType,
      error: (err as Error)?.name,
    });
  }
}
