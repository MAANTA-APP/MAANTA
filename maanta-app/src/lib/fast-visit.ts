import { createServiceClient } from "@/lib/supabase/service";

/**
 * Fast Visit — server-side reads. SERVER ONLY (imports the service client);
 * the pure time math clients also need lives in `lib/fast-visit-window.ts`.
 *
 * The feature gate lives in `app_config.fast_visit_enabled` (migration
 * 20260826120000), seeded 'false' so the feature ships dark: the reward UI
 * appears and points are awarded only once merchant counter QRs physically
 * exist at Node 0 and the founder flips the row. The SQL side reads the same
 * key via `public.fast_visit_enabled()`; this is the app-side mirror and the
 * two must agree on what counts as "on". Same fail-safe posture as
 * `isDemoModeEnabled`: anything but the exact string `true` — including an
 * unreachable database — resolves to OFF, and it is deliberately uncached so
 * a flipped row takes effect on the next request.
 */
export async function isFastVisitEnabled(): Promise<boolean> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("app_config")
      .select("value")
      .eq("key", "fast_visit_enabled")
      .maybeSingle();

    if (error || !data?.value) return false;
    return String(data.value).trim().toLowerCase() === "true";
  } catch {
    return false;
  }
}

/**
 * A shopper's MAANTA Points balance — always derived from the append-only
 * ledger, never stored. Returns null on a read failure so callers can render
 * "could not load" instead of a convincing zero (the D164/D185 lesson).
 */
export async function getRewardBalance(userId: string): Promise<number | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("reward_events")
    .select("points")
    .eq("user_id", userId);
  if (error || !data) return null;
  return data.reduce((sum, row) => sum + (row.points ?? 0), 0);
}

export type RewardEventRow = {
  id: string;
  points: number;
  reward_type: string;
  awarded_at: string;
  merchants: { merchant_name: string } | null;
  redemptions: { claimed_at: string | null; arrived_at: string | null } | null;
};

/** Recent ledger rows for the Rewards surface, newest first. */
export async function listRewardEvents(
  userId: string,
  limit = 20
): Promise<RewardEventRow[] | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("reward_events")
    .select(
      "id, points, reward_type, awarded_at, merchants(merchant_name), redemptions(claimed_at, arrived_at)"
    )
    .eq("user_id", userId)
    .order("awarded_at", { ascending: false })
    .limit(limit);
  if (error || !data) return null;
  return data as unknown as RewardEventRow[];
}
