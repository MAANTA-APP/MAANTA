# Agent-assisted onboarding attribution

**Status:** shipped on `main` via **merge #68** (2026-07-24). This documents the
merged implementation — it is **not** the separate `src/lib/agent-attribution.ts`
that PR #69 proposed (that competing, pre-#68 version was deliberately dropped
during the canonical reconciliation; see `docs/skills/launch-audit-2026-07-24.md`).

## What it is

When a MAANTA field agent helps a merchant onboard, we record **who assisted** —
without ever letting the agent stand in as the account owner. Attribution is a
label on the merchant record, not an authorization change: an absent or invalid
agent id simply means `self_serve`. Behaviour for a normal self-serve onboard is
unchanged.

## The data path (attribution-only, fail-safe)

1. **Wizard** — the onboard wizard's "Were you helped by a Maanta agent?" step
   captures the selected `agents.id` (or nothing for "No").
2. **Route** — `src/app/api/merchants/onboard/route.ts`:
   - The authenticated submitter is **always the merchant** (`ensureAppUser`),
     never the agent. The agent id is forwarded as attribution only.
   - A non-UUID value is rejected up front with a typed 400 (so a malformed id
     surfaces cleanly instead of a generic 500).
   - The route runs `onboard_merchant` via the **service client**, passing
     `p_user_id = appUser.id` (the merchant) and `p_onboarding_agent_id` =
     the selected id or `null`.
3. **RPC** — `onboard_merchant` (migrations `20260702083812_*`,
   `20260702085628_*`) is the trust boundary. Under `service_role` it derives
   attribution purely from its parameters:
   - a **valid, active** agent id → `onboarding_mode = agent_assisted` +
     `assisted_by_agent_id = <id>`;
   - absent / invalid / inactive → `self_serve` (fail-safe);
   - `onboarded_by_user_id = p_user_id` (the merchant) in every case.

## Guarantees

- **The agent is never the caller.** The merchant onboards *themselves*; the
  agent id can only ever be a recorded attribution.
- **Fail-safe.** A bad or missing id degrades to `self_serve` — it never blocks
  onboarding and never escalates anyone's access.
- **No money-path effect.** Attribution does not touch fees, wallet, or the
  Node 0 credit.

## Tests

- `maanta-app/supabase/tests/onboard_agent_attribution_test.sql` — RPC-level:
  valid active agent → `agent_assisted` + id; invalid/inactive → `self_serve`.
- `maanta-app/src/app/api/merchants/onboard/__tests__/route.test.ts` — route:
  UUID validation, null → self-serve forwarding, error mapping.

## Repo-ready vs prod

- **Ready in repo:** the attribution plumbing above (merged on `main`).
- **Human/product decision, NOT done:** the agent-facing onboarding UI/console
  and any *stronger-than-attribution* binding (e.g. authz that treats the agent
  as an actor). Until that's decided, attribution stays label-only.
