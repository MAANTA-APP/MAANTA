import { createServiceClient } from "@/lib/supabase/service";

/**
 * Demo mode — server-side read of the single source of truth.
 *
 * The switch lives in `app_config.demo_mode_enabled` (migration
 * 20260729140000), not in an environment variable, so it cannot drift from the
 * database the synthetic rows actually sit in. The SQL side reads the same key
 * via `public.is_demo_mode()`; this is the app-side mirror of that function and
 * the two must agree on what counts as "on".
 *
 * Fail-safe in one direction on purpose: anything other than the exact string
 * `true` — a typo, an empty value, a missing key, an unreachable database —
 * resolves to OFF. Showing real data during a demo is a cosmetic disappointment;
 * showing synthetic data at launch is a credibility failure, so every ambiguous
 * state resolves toward launch behaviour.
 *
 * Deliberately uncached: this is one indexed single-row read on a tiny table,
 * and callers already resolve it once per request and pass the boolean down.
 * A module-level cache would outlive the request in a warm server and could
 * keep serving synthetic data for its TTL after demo mode was switched off —
 * the exact failure this module exists to prevent.
 *
 * See docs/ops/demo-mode.md.
 */
export async function isDemoModeEnabled(): Promise<boolean> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("app_config")
      .select("value")
      .eq("key", "demo_mode_enabled")
      .maybeSingle();

    if (error || !data?.value) return false;
    return String(data.value).trim().toLowerCase() === "true";
  } catch {
    // Unreachable config is not a reason to start showing synthetic data.
    return false;
  }
}

/**
 * Banner copy for surfaces that render synthetic data.
 *
 * Anything a viewer could mistake for real marketplace activity has to say so
 * on the same screen. Kept here rather than inline so the wording is identical
 * everywhere it appears.
 */
export const DEMO_BANNER_TEXT =
  "Demo mode — sample data for rehearsal. These shops, deals and codes are not real.";

/**
 * The same switch, but reporting whether the read SUCCEEDED.
 *
 * `isDemoModeEnabled()` resolves every ambiguous state to OFF, which is right
 * for product surfaces — an unreachable config must never start showing
 * synthetic data. It is wrong for a console that COUNTS things: on the admin
 * dashboard the flag decides whether demo rows are filtered out of the
 * shopper-visible supply count, so a failed read silently shrinks that number
 * and can fire the urgent "No live deals" item from an error rather than an
 * observation (the D164/D185 rule: a failed read is not a zero).
 *
 * Callers that display or alert on a derived count should use this and treat
 * `ok: false` as "unavailable", not as OFF.
 */
export async function readDemoModeEnabled(): Promise<{ ok: boolean; enabled: boolean }> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("app_config")
      .select("value")
      .eq("key", "demo_mode_enabled")
      .maybeSingle();

    if (error) return { ok: false, enabled: false };
    const enabled = String(data?.value ?? "").trim().toLowerCase() === "true";
    return { ok: true, enabled };
  } catch {
    return { ok: false, enabled: false };
  }
}
