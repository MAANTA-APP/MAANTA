/**
 * Agent-assisted onboarding attribution (audit items G1/G4).
 *
 * Trust model (DECISIONS_LOG 2026-07-02, third revision, encoded in the
 * `onboard_merchant` RPC): the MERCHANT is always the authenticated caller on
 * both self-serve and agent-assisted paths. The agent is captured as
 * **attribution only** — `merchants.assisted_by_agent_id`, validated for
 * existence + `is_active`, with no caller-relationship check (the agent is not
 * the caller; they assist on a shared tablet). This module is the server-side
 * plumbing that lets the onboard route pass a *validated* agent id through
 * instead of hardcoding `null`, and record which agent assisted which
 * onboarding.
 *
 * What is intentionally NOT here (human/product decision — see
 * docs/skills/agent-attribution.md): the agent-facing onboarding surface that
 * supplies the agent id, and any stronger binding than attribution (e.g. a
 * signed referral or an agent session) which would require an RPC-authorization
 * change. Until such a surface exists no caller sends an agent id, so behaviour
 * is unchanged (every onboarding stays `self_serve`) — this is forward-safe,
 * inert plumbing, like the PostHog/Sentry wiring.
 */

export type OnboardingMode = "self_serve" | "agent_assisted";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Narrow dependency so the resolver is unit-testable without a DB. */
export interface AgentLookup {
  /** True iff `agentId` references an existing, active agent. */
  isActiveAgent(agentId: string): Promise<boolean>;
}

/** Accept only a well-formed UUID string; everything else → null. */
export function normalizeAgentId(raw: unknown): string | null {
  return typeof raw === "string" && UUID_RE.test(raw.trim())
    ? raw.trim()
    : null;
}

/**
 * Resolve the onboarding agent id to attribute this onboarding to:
 * a well-formed id that references an active agent, else `null` (→ self-serve).
 * Never throws — a lookup failure resolves to `null` so a flaky agents read can
 * never break a merchant's onboarding.
 */
export async function resolveOnboardingAgentId(
  raw: unknown,
  lookup: AgentLookup
): Promise<string | null> {
  const id = normalizeAgentId(raw);
  if (!id) return null;
  try {
    return (await lookup.isActiveAgent(id)) ? id : null;
  } catch {
    return null;
  }
}

export function onboardingMode(agentId: string | null): OnboardingMode {
  return agentId ? "agent_assisted" : "self_serve";
}

/**
 * Audit hook — one structured server line per onboarding recording whether it
 * was self-serve or which agent assisted. Makes "which agent onboarded which
 * merchant" greppable in logs/Sentry breadcrumbs without a schema change (the
 * durable record is still `merchants.assisted_by_agent_id`/`onboarding_mode`).
 */
export function logOnboardingAttribution(entry: {
  merchantId: string;
  agentId: string | null;
}): void {
  console.info(
    JSON.stringify({
      event: "onboarding_attribution",
      merchantId: entry.merchantId,
      mode: onboardingMode(entry.agentId),
      assistedByAgentId: entry.agentId,
    })
  );
}
