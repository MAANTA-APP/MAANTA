/**
 * Minimal server-side PostHog capture — no SDK dependency, one fetch.
 *
 * Design constraints (Guardian analytics, docs/maanta-guardian-v1.md):
 *  - No-op unless POSTHOG_PROJECT_KEY is set, so dev / CI / tests never emit
 *    and never fail. `npm run build` with placeholder env stays clean.
 *  - Best-effort and NON-BLOCKING: callers `void` this. It swallows every
 *    error and bounds itself with a short timeout, so analytics can never
 *    delay or break the request that triggered it — the counter (verify) path
 *    must never wait on a metrics ping (frozen "never block the shopper").
 *
 * Env is read at call time (not module load) so it resolves correctly in
 * serverless runtimes and is trivially overridable in tests.
 */

const DEFAULT_HOST = "https://eu.i.posthog.com";
const CAPTURE_TIMEOUT_MS = 2000;

/** True when server-side analytics is configured (a project key is present). */
export function analyticsEnabled(): boolean {
  return Boolean(process.env.POSTHOG_PROJECT_KEY);
}

/**
 * Fire a single PostHog event. Resolves to void always — never rejects.
 * `distinctId` is the actor the event is attributed to (we use the merchant id
 * for Guardian outcomes). `properties` are the breakdown dimensions.
 */
export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const key = process.env.POSTHOG_PROJECT_KEY;
  if (!key) return; // analytics disabled — no-op

  const host = (process.env.POSTHOG_HOST ?? DEFAULT_HOST).replace(/\/+$/, "");

  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "maanta-server" },
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    // Best-effort: a metrics failure must never surface to the caller.
  }
}

/**
 * Guardian-specific convenience wrapper. Emits one `guardian_outcome` event per
 * verify, attributed to the merchant, with the recommendation + context as
 * breakdown dimensions. Call with `void` — best-effort, non-blocking.
 */
export function captureGuardianOutcome(args: {
  merchantId: string;
  redemptionId: string;
  dealId: string | null;
  recommendation: string | null;
  severity: string | null;
  redemptionStatus: string;
  feeChargeStatus: string | null;
  disputed: boolean;
}): Promise<void> {
  return captureServerEvent("guardian_outcome", args.merchantId, {
    recommendation: args.recommendation ?? "clear",
    severity: args.severity ?? "info",
    redemption_status: args.redemptionStatus,
    fee_charge_status: args.feeChargeStatus,
    disputed: args.disputed,
    deal_id: args.dealId,
    redemption_id: args.redemptionId,
    merchant_id: args.merchantId,
    node: "BBS Mall",
  });
}
