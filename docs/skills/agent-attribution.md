# Skill — Agent-assisted onboarding attribution (G1/G4)

**Status (2026-07-24):** trust-safe plumbing + audit hook landed in repo. The
agent-facing onboarding *surface* is still a human/product decision (see
"Human-owned" below). Until it exists, no caller supplies an agent id, so every
onboarding stays `self_serve` — behaviour is unchanged; this is forward-safe,
inert wiring.

## A note on scope (correction)

The launch-audit item and this task referred to "agent attribution." In MAANTA
that means **who assisted a merchant's onboarding** (audit items G1/G4) — not
"agents making Guardian decisions." Guardian is an automated verify-time fraud
engine with no agent actor; the human actions around it (soft-block release,
hard-block appeal, fee reversal) are **admin** actions already attributed via
`admin_ops_log` + the `fee_reversals`/`guardian_events` audit tables. So the
attribution plumbing here is for onboarding, which is where the real gap was.

## Trust model (unchanged — DECISIONS_LOG 2026-07-02, third revision)

The `onboard_merchant` RPC (`20260702085628_onboard_merchant_merchant_authored_redesign.sql`)
encodes: the **merchant is always the authenticated caller**, on both self-serve
and agent-assisted paths. The agent is **attribution only** —
`merchants.assisted_by_agent_id`, validated for existence + `is_active`, with
**no caller-relationship check** (the agent isn't the caller; they assist on a
shared tablet). `onboarding_mode` is `self_serve` / `agent_assisted` /
`admin_assisted`.

## What landed (repo)

| File | Role |
|---|---|
| `src/lib/agent-attribution.ts` | `normalizeAgentId`, `resolveOnboardingAgentId` (validate active → id or null, never throws), `onboardingMode`, `logOnboardingAttribution` audit hook |
| `src/app/api/merchants/onboard/route.ts` | accepts optional `onboardingAgentId`, validates it via a service-client `AgentLookup`, passes the validated id (or null) to `p_onboarding_agent_id` — **no longer hardcodes null** — and logs the attribution on success |
| `src/lib/__tests__/agent-attribution.test.ts` | UUID validation, active/inactive/absent resolution, fail-safe on lookup error, mode mapping |

**Defense-in-depth:** the RPC still independently validates the agent is active
(`invalid_attribution` on a bad id), so a stale/forged id can't be attributed
even though the route also checks.

**Auditability (the "which agent made which decision" hook):**
`logOnboardingAttribution` emits one structured line per onboarding —
`{"event":"onboarding_attribution","merchantId":…,"mode":…,"assistedByAgentId":…}` —
greppable in server logs / Sentry breadcrumbs. The durable record remains
`merchants.assisted_by_agent_id` + `onboarding_mode`.

## Human-owned (product / trust-boundary decision — NOT done here)

1. **Agent-facing onboarding surface.** Decide how the agent id reaches the
   route: a shared-tablet field where the agent enters/selects their agent code,
   or an agent referral link. Then wire `onboard-wizard.tsx` to send
   `onboardingAgentId`. This is a UI + product decision (what the counter flow
   looks like) — deliberately not invented here.
2. **Stronger binding than attribution (optional).** If "any merchant may claim
   any active agent for credit" (the current attribution-only model) is too
   loose for paying agent commissions, that's a founder decision requiring an
   RPC-authorization change (e.g. a signed referral token, or letting an active
   agent be the caller) — a new decisions-log entry + migration, not a repo
   tweak.
3. **G4 lead → merchant link.** Linking `leads.agent_id` to the resulting
   merchant (so agent credit survives even without step 1) needs a schema
   migration (a `leads.merchant_id` / join) + a match rule (phone/shop). Scoped
   as its own ticket; not bundled into this money-adjacent path without the
   product call on matching.

## Constraints honoured

- No money-path, RPC, or schema change. The route change is behaviour-neutral
  today (absent id → null → `self_serve`, exactly as before).
- The resolver never throws — a flaky `agents` read degrades to `self_serve`
  rather than failing a merchant's onboarding.
