# Founder rulings ×3 — verification against main (2026-07-25)

**Mode:** Reviewer. **Branch:** `claude/founder-rulings-three-prs-mypcau`.
**Finding in one line:** all three founder rulings requested for this session
(fee-reversal note REQUIRED, G1 agent attribution, S2 Clerk email+phone auth mix)
are **already implemented and merged to `main`** (`d1d45f6`). No new
behaviour code was needed; this session verified each ruling's enforcement
against the current tree — the fee-reversal note across all four layers (ruling
1), and the separately documented enforcement points/evidence for rulings 2 and
3 — and re-ran the full suite. The task framing
(note "is optional today", route "hardcodes a null agent id") **contradicts the
code** — surfaced below, not acted on, per CLAUDE.md's drift rule.

## Verification run (this session, on `main`'s tree)

- `npm run typecheck` → clean (exit 0)
- `npm test` → **188 passed / 188** (32 files), incl. the three rulings' suites
- `npm run build` → exit 0 with placeholder Clerk keys (81 routes). Without
  Clerk keys the build fails only at **static prerender** of public pages
  (`Missing publishableKey`) — an env/deploy-config gap, not a code defect.

## Ruling 1 — fee-reversal decision note is REQUIRED (2026-07-23)

Enforced in all four layers the ruling calls for; incident number stays optional.

| Layer | Where | State |
|---|---|---|
| (a) RPC trims + raises `note_required` | `20260723150000_reverse_success_fee_note_required.sql` — `regexp_replace(p_note,'^[[:space:]]+\|[[:space:]]+$','','g')` then `NULLIF`, raises `note_required` on empty | ✅ |
| (b) route maps `note_required`→400 pre-mutation | `api/admin/redemptions/[id]/reverse-fee/route.ts` — rejects empty/whitespace with 400 before the RPC, and maps the RPC's `note_required` back to 400 | ✅ |
| (c) DB column backstop | `20260724130000_fee_reversals_note_not_null.sql` — `note` `SET NOT NULL` + CHECK `char_length(regexp_replace(...trim...)) BETWEEN 1 AND 2000` (`fee_reversals_note_not_blank`) | ✅ |
| (d) modal: Confirm disabled until non-empty; grey not amber | `reverse-fee-action.tsx` — `disabled={!note.trim()}`; disabled Button is grey per `button.tsx` L9b ("a disabled control is NEVER amber") | ✅ |

Unchanged invariants confirmed in the RPC: amount = `redemptions.success_fee_charged`
(never client-supplied), arrears settle first, one reversal per redemption
(`UNIQUE(redemption_id)` + explicit `already_reversed`), admin-approver check,
original redemption & fee rows untouched, no trust-metric side effect.
Doc `docs/skills/fee-reversals.md` already describes the note as required
(lines 32, 79–82) — no doc edit needed.

**Tests** (`supabase/tests/fee_reversal_test.sql`, +route test): whitespace-only
→ `note_required` (scenario 6); valid → **one** `fee_reversal` credit linked to
the redemption + one `fee_reversals` audit row asserting `approver_user_id`,
amount, incident_ref, before→after balance (scenario 1); second reversal →
`already_reversed`, no second credit (scenario 2); direct-insert DB CHECK
(scenario 7). Route test maps `note_required`→400 (not 500). Delivered by PR
**#68** (RPC+route+modal) and **#74** (NOT NULL column).

## Ruling 2 — G1 agent attribution (HIGH)

- `api/merchants/onboard/route.ts` forwards the wizard's selected agent id as
  `p_onboarding_agent_id` (**not** hardcoded null — the task's premise is stale),
  validates UUID shape up front, maps `invalid_attribution`→400.
- `onboard_merchant` (`20260702085628`) is the canonical path: `onboarding_mode`
  is the ENUM (`self_serve` | `agent_assisted` | `admin_assisted`) — **no**
  separate `agent_assisted` boolean; `assisted_by_agent_id` stored only when the
  id references an **active** agent, else `invalid_attribution` with **zero**
  merchant rows; "No"/absent → `self_serve`, null id. Merchant is always the
  authenticated caller (`p_user_id` = `appUser.id`); the agent is attribution
  only. Role promotion runs the trusted service path guarded by
  `prevent_self_role_escalation` — an agent cannot self-escalate through this flow.
- `src/lib/agent-attribution.ts` **does not exist** (already deleted; no imports).

**Tests**: `supabase/tests/onboard_agent_attribution_test.sql` + route test —
valid active agent → `agent_assisted` + id stored; inactive → `invalid_attribution`,
0 merchants; "No" → `self_serve`, null; self-promotion refused. Delivered by PR **#68**.

## Ruling 3 — S2 Clerk email+phone auth mix (2026-07-23)

- Both sign-in methods enabled; the launch mix lives behind `src/lib/launch-auth.ts`
  with **both** modes enabled, default `email_and_phone` (S2 ruling),
  env-overridable via `NEXT_PUBLIC_LAUNCH_AUTH_MODE`, fail-safe to default.
- No password field — `login/[[...rest]]/page.tsx` mounts Clerk's hosted
  `<SignIn/>`; factor enablement is Clerk-dashboard config.
- Claim gate untouched and frozen: `PHONE_REQUIRED_AT_CLAIM = true` wired into
  `api/redemptions/route.ts`; browsing needs no phone. Delivered by PR **#68**
  (phone-required-at-claim) and **#74** (mix flag).

## Contradictions with the boards (for wireframe/board updates)

1. **Task framing vs code.** The brief says the note "is optional today" and the
   onboarding route "hardcodes a null agent id." Both are false on `main` — the
   note is required across four layers and the route forwards the agent id. The
   boards/wireframes should mark rulings 1–3 as **shipped**, not pending.
2. **`DP-…` ledger prefix (Task 1 test wording) does not exist.** There is no
   `DP-` reference convention in the schema. The reversal credit is a
   `fee_reversal` `merchant_transactions` row keyed by `reference_id` = redemption
   id, with a human-readable description. If the board specifies a `DP-` code,
   the code diverges — recommend the board drop the `DP-` prefix.
3. **Clerk factor enablement is dashboard config, not app code** (`SPEC-GAP` in
   `launch-auth.ts`). The app-side flag records the decision + default; the actual
   email/phone-OTP factors are toggled in the Clerk dashboard. Keep the two in
   sync at deploy — a board note, not a code change.

## Provenance / PR links

Rulings landed via **#68** ("fee-reversal note required · agent onboarding
attribution · phone-required-at-claim") and **#74** ("note NOT NULL column
backstop + launch-auth mix flag"), both merged to `main`. No open PR #18–#23
exists to re-open (see `fee-reversal-attribution-auth-close-2026-07-24.md`).
Because a merged PR is finished, the correct action was to **verify**, not to
stack three redundant behaviour PRs on already-merged history.
