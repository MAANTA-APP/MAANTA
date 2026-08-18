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
 *  - DELIVERED ANYWAY: `void` alone loses the ping. A serverless instance can
 *    be frozen the moment the response is sent, taking any in-flight fetch with
 *    it, so the capture is registered with `waitUntil` — see captureServerEvent.
 *
 * Env is read at call time (not module load) so it resolves correctly in
 * serverless runtimes and is trivially overridable in tests.
 */

import { DEFAULT_NODE } from "@/lib/nodes";

const DEFAULT_HOST = "https://eu.i.posthog.com";
const CAPTURE_TIMEOUT_MS = 2000;

/**
 * Vercel's per-invocation request context, exposed on globalThis under a
 * well-known symbol. This is the integration point framework and library code is
 * expected to use, and it is all `waitUntil` from `@vercel/functions` reads:
 *
 *   const getContext = () => globalThis[SYMBOL_FOR_REQ_CONTEXT]?.get?.() ?? {};
 *   const waitUntil  = (p) => getContext().waitUntil?.(p);
 *
 * Inlined rather than depended on: `@vercel/functions` pulls `@vercel/oidc` →
 * `@vercel/cli-config` + `@vercel/cli-exec` → `execa`, `zod`, `xdg-app-paths`
 * into *production* dependencies. That is a lot of supply-chain surface, and a
 * package that spawns child processes, in exchange for the two lines above.
 */
const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");

type VercelRequestContext = { waitUntil?: (promise: Promise<unknown>) => void };

function resolveNode(node: string | null | undefined): string {
  const trimmed = node?.trim();
  return trimmed || DEFAULT_NODE;
}

/** True when server-side analytics is configured (a project key is present). */
export function analyticsEnabled(): boolean {
  return Boolean(process.env.POSTHOG_PROJECT_KEY);
}

/** Set once per cold start, so a broken platform contract is loud but not spammy. */
let warnedNoRequestContext = false;

/**
 * Hand a promise to the platform so the serverless instance is kept alive until
 * it settles.
 *
 * Off Vercel — local dev, vitest, any other host — there is no context and this
 * is a no-op. Nothing is lost there: a process that outlives the request
 * finishes a pending fetch by itself, and `captureServerEvent` awaits its own
 * delivery promise regardless.
 *
 * ON Vercel, a missing context means events are being dropped again, which is
 * precisely the failure that went unnoticed for three days because it is
 * invisible from the inside. So say so, once, rather than degrading quietly.
 */
function keepAlive(promise: Promise<void>): void {
  let accepted = false;
  try {
    const store = (
      globalThis as typeof globalThis & {
        [SYMBOL_FOR_REQ_CONTEXT]?: { get?: () => VercelRequestContext | undefined };
      }
    )[SYMBOL_FOR_REQ_CONTEXT];
    const waitUntil = store?.get?.()?.waitUntil;
    if (waitUntil) {
      waitUntil(promise);
      accepted = true;
    }
  } catch {
    // The primitive changed shape. Fall through to the warning: this module's
    // contract is that a metrics failure never surfaces to the caller, and that
    // has to hold even when the platform moves underneath it.
  }

  if (!accepted && process.env.VERCEL && !warnedNoRequestContext) {
    warnedNoRequestContext = true;
    console.warn(
      "[analytics] no Vercel request context — captures are not being kept alive " +
        "and will be dropped when the instance freezes. See src/lib/analytics.ts."
    );
  }
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

  // Demo mode marks every event so synthetic activity can be filtered out of
  // any PostHog insight, rather than silently inflating real numbers. Read
  // from env, not the database: analytics is best-effort and must never add a
  // query to the verify path (frozen "never block the shopper"). Operators set
  // MAANTA_DEMO_MODE alongside flipping app_config for the duration of a
  // rehearsal — and if it is forgotten, events simply carry is_demo:false,
  // which is the same state as today rather than a regression.
  const isDemo = process.env.MAANTA_DEMO_MODE === "true";

  // Start the request, and neutralise rejection immediately: `delivery` must be
  // settled-or-resolving and never throwing before it is handed to keepAlive,
  // because a rejected promise given to waitUntil becomes an unhandled rejection
  // in the platform rather than a swallowed metrics error.
  const delivery = (async () => {
    try {
      await fetch(`${host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          event,
          distinct_id: distinctId,
          properties: {
            ...properties,
            $lib: "maanta-server",
            is_demo: isDemo,
            // Separate the event stream entirely, so a dashboard built on real
            // data cannot pick up rehearsal traffic even if a filter is missed.
            ...(isDemo ? { environment: "demo" } : {}),
          },
          timestamp: new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      // Best-effort: a metrics failure must never surface to the caller.
    }
  })();

  // Every caller invokes this as `void captureX(...)`, which is what keeps the
  // shopper unblocked — and is also exactly why the ping used to vanish. On
  // Vercel the instance can be frozen as soon as the response is sent, and an
  // unawaited fetch dies with it. Measured on production 2026-07-30: four deal
  // pages rendered, two events arrived. The two that landed were concurrent
  // requests (a later invocation thawed the instance and flushed the earlier
  // ping); the two isolated ones were lost. Same shape as the only other server
  // events this project has ever recorded — one 67-second burst of 59 under
  // rapid sequential load, then nothing for three days.
  //
  // waitUntil extends the INVOCATION, not the response: the shopper already has
  // their bytes, so the frozen "never block the shopper" rule is untouched. The
  // ping stays bounded by CAPTURE_TIMEOUT_MS either way.
  keepAlive(delivery);

  await delivery;
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
  node?: string | null;
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
    node: resolveNode(args.node),
  });
}

/** Shopper successfully starts a deal claim (pre-OTP). */
export function captureDealClaimed(args: {
  clerkUserId: string;
  redemptionId: string;
  dealId: string;
  merchantId: string;
  hadGps: boolean;
  hasFraudFlags: boolean;
  node?: string | null;
}): Promise<void> {
  return captureServerEvent("deal_claimed", args.clerkUserId, {
    redemption_id: args.redemptionId,
    deal_id: args.dealId,
    merchant_id: args.merchantId,
    had_gps: args.hadGps,
    has_fraud_flags: args.hasFraudFlags,
    node: resolveNode(args.node),
  });
}

/** Merchant successfully publishes a new deal. */
export function captureDealPublished(args: {
  clerkUserId: string;
  dealId: string;
  merchantId: string;
  dealType: string;
  priceKes: number;
  hasMaxClaims: boolean;
  node?: string | null;
}): Promise<void> {
  return captureServerEvent("deal_published", args.clerkUserId, {
    deal_id: args.dealId,
    merchant_id: args.merchantId,
    deal_type: args.dealType,
    price_kes: args.priceKes,
    has_max_claims: args.hasMaxClaims,
    node: resolveNode(args.node),
  });
}

/** New merchant completes onboarding. */
export function captureMerchantOnboarded(args: {
  clerkUserId: string;
  merchantId: string;
  node?: string | null;
}): Promise<void> {
  return captureServerEvent("merchant_onboarded", args.clerkUserId, {
    merchant_id: args.merchantId,
    node: resolveNode(args.node),
  });
}

/** Merchant initiates an M-Pesa STK push top-up. */
export function captureTopupInitiated(args: {
  clerkUserId: string;
  merchantId: string;
  amountKes: number;
  node?: string | null;
}): Promise<void> {
  return captureServerEvent("topup_initiated", args.clerkUserId, {
    merchant_id: args.merchantId,
    amount_kes: args.amountKes,
    node: resolveNode(args.node),
  });
}

/** M-Pesa wallet top-up confirmed via IntaSend webhook. */
export function captureTopupCompletedMpesa(args: {
  merchantId: string;
  amountKes: number;
  node?: string | null;
}): Promise<void> {
  return captureServerEvent("topup_completed_mpesa", args.merchantId, {
    merchant_id: args.merchantId,
    amount_kes: args.amountKes,
    payment_provider: "intasend",
    node: resolveNode(args.node),
  });
}

/** Stripe card top-up confirmed via Stripe webhook. */
export function captureTopupCompletedStripe(args: {
  merchantId: string;
  amountKes: number;
  currency: string;
  chargedAmount: number;
  node?: string | null;
}): Promise<void> {
  return captureServerEvent("topup_completed_stripe", args.merchantId, {
    merchant_id: args.merchantId,
    amount_kes: args.amountKes,
    original_currency: args.currency,
    original_amount: args.chargedAmount,
    payment_provider: "stripe",
    node: resolveNode(args.node),
  });
}

/**
 * Where a server event's `distinct_id` came from. Emitted as a property so per-user
 * analysis can tell whether it is standing on a real identity or a placeholder,
 * instead of discovering that the hard way.
 *
 *   clerk — a signed-in user id; the same id posthog.identify() uses, so client
 *           and server events land on one person.
 *   none  — nothing to attribute to (a signed-out shopper). Lands in
 *           UNATTRIBUTED_DISTINCT_ID.
 *
 * There is deliberately no cookie-derived source. Anonymous analytics is
 * cookieless and in-memory (`persistence: "memory"` in components/posthog-provider.tsx,
 * founder ruling 2026-07-31), so the server has no browser distinct id to read for
 * a signed-out shopper — their server-side `deal_viewed` is volume-only, while the
 * client's own posthog-js still attributes the pageview and aliases it on sign-in.
 * The server cookie-read that assumed the old default persistence was retired
 * (D88); its silent-drift risk was D22. Guarded by
 * `__tests__/analytics-cookieless-posture.test.ts`.
 */
export type DistinctIdSource = "clerk" | "none";

/**
 * Where unattributable views land. Every one shares a single PostHog person, so
 * **exclude `distinct_id_source = 'none'` from any per-user metric** — unique
 * viewers, repeat rate, funnels. Volume is still sound.
 *
 * Kept as the literal "anonymous" on purpose. Every server event before
 * 2026-07-30 used it unconditionally, so the pre-fix data and this residual
 * bucket share one identifiable person and everything trustworthy sits outside
 * it. A random id per view would look better and quietly inflate person counts
 * instead — the opposite trade to the one worth making.
 */
export const UNATTRIBUTED_DISTINCT_ID = "anonymous";

/** Shopper views a deal detail page (top of the claim funnel). */
export function captureDealViewed(args: {
  clerkUserId: string | null;
  dealId: string;
  merchantId: string;
  dealType: string;
  priceKes: number | null;
  node?: string | null;
}): Promise<void> {
  // A signed-in shopper is attributed to their Clerk id (the id identify() sets,
  // so server and client events agree). A signed-out shopper has no
  // server-readable identity — anonymous analytics is cookieless and in-memory by
  // founder ruling (components/posthog-provider.tsx) — so the event is honestly
  // unattributed (source "none") rather than pinned to an invented or empty id.
  // A blank Clerk id is normalised to null so `source` and `distinct_id` can never
  // disagree (a blank is falsy for `source` but not nullish for `??`, which used
  // to send distinct_id: "" against source "none").
  const clerkId = args.clerkUserId?.trim() || null;
  const source: DistinctIdSource = clerkId ? "clerk" : "none";
  const distinctId = clerkId ?? UNATTRIBUTED_DISTINCT_ID;

  return captureServerEvent("deal_viewed", distinctId, {
    deal_id: args.dealId,
    merchant_id: args.merchantId,
    deal_type: args.dealType,
    price_kes: args.priceKes,
    node: resolveNode(args.node),
    distinct_id_source: source,
  });
}
