import { createServiceClient } from "@/lib/supabase/service";
import { inPopulation, type Population } from "@/lib/growth/population";
import { rowToLead, type MerchantLead } from "@/lib/growth/leads";
import { rowToCampaign, type Campaign } from "@/lib/growth/campaigns";

/**
 * Server reads for the Growth console's two Supabase-backed tables.
 *
 * Every function returns `{ rows, readable }` rather than a bare array. A read
 * failure and an empty table are different answers and only one of them is safe
 * to quote — the register carries four separate rows (D242, D246, D251, D253)
 * where a screen turned an unreadable read into a confident zero. Callers render
 * `AdminReadError` on `readable: false`; they never render "0".
 *
 * The population filter is applied in SQL, not in the page, so a surface cannot
 * forget it and quietly count test rows.
 */

export type GrowthRead<T> = { rows: T[]; readable: boolean };

const UNREADABLE = <T>(): GrowthRead<T> => ({ rows: [], readable: false });

/**
 * Every lead in the population, no limit.
 *
 * Unbounded is correct here and would not be on a shopper surface: this is one
 * mall's units, so the row count is bounded by the building — a few hundred at
 * Node 0 — and the board has to show a whole pipeline to be a pipeline. A capped
 * read would produce exactly the "confident total from a capped page" defect
 * D254 records.
 */
export async function readLeads(population: Population): Promise<GrowthRead<MerchantLead>> {
  const service = createServiceClient();
  let query = service
    .from("growth_merchant_leads")
    .select(
      "id, floor, unit, category, contact_name, contact_phone, stage, lost_reason, agent_user_id, visit_at, account_created, staff_added, wallet_topped_up, is_test, captured_lead_id, created_at, first_contacted_at, shop_name, mall, source, elite_trial_opt_in"
    )
    .order("created_at", { ascending: true });

  if (population !== "all") query = query.eq("is_test", population === "test");

  const { data, error } = await query;
  if (error) {
    console.error("growth: lead read failed:", error.message);
    return UNREADABLE();
  }
  return { rows: (data ?? []).map(rowToLead), readable: true };
}

export async function readCampaigns(population: Population): Promise<GrowthRead<Campaign>> {
  const service = createServiceClient();
  let query = service
    .from("growth_campaigns")
    .select("id, name, slug, channel, destination, status, spend_kes, is_test, created_at")
    .order("created_at", { ascending: false });

  if (population !== "all") query = query.eq("is_test", population === "test");

  const { data, error } = await query;
  if (error) {
    console.error("growth: campaign read failed:", error.message);
    return UNREADABLE();
  }
  return { rows: (data ?? []).map(rowToCampaign), readable: true };
}

/**
 * In-memory population filter, for callers that already hold rows.
 *
 * Exported so the overview can read once and slice, rather than issuing the same
 * query three times.
 */
export function filterByPopulation<T extends { isTest: boolean }>(
  rows: T[],
  population: Population
): T[] {
  return rows.filter((r) => inPopulation(r.isTest, population));
}
