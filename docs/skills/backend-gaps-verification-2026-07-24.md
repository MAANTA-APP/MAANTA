# Backend-gaps verification — fee-reversal note + agent attribution (G1)

**Date:** 2026-07-24 · **Mode:** Builder (verification) · **Branch:**
`claude/maanta-wireframes-prompt-nc7h4c` (on `main` after PRs #68/#70/#71).

## TL;DR

A Builder task asked to "rectify two remaining backend gaps": (1) enforce the
fee-reversal reason at the RPC/DB level, and (2) wire agent attribution (G1)
end to end. **Both are already implemented, enforced at the RPC/DB level, and
tested on this branch.** No money-path change was made — doing so would either be
a no-op or would contradict a frozen governance decision (see Conflicts). This
note is the durable record so a future session does not re-open closed work.

Checks run this session (from `maanta-app/`): `npm run typecheck` ✅,
`npm run lint` ✅ (no warnings/errors), `npx vitest run` ✅ **132 tests / 24
files**. The pgTAP SQL suites need a booted Supabase (Postgres+postgis+auth+
roles), unavailable in this sandbox → they run in CI's `db-tests` job.

---

## 1 · Fee-reversal reason — enforced at three layers (already shipped)

Governance: Decisions Log **2026-07-23** — every success-fee reversal must carry
a reviewer's decision note (incident number stays optional). Softening is only
allowed by an explicit reversal of that decision.

| Layer | Where | Behaviour |
|---|---|---|
| UI | fee-reversal screen | Confirm disabled until a note is entered |
| Route | `src/app/api/admin/redemptions/[id]/reverse-fee/route.ts` | Empty/whitespace note → **400** before the RPC is called (`note.trim()` gate) |
| **RPC / DB backstop** | `public.reverse_success_fee` — migration `20260723150000_reverse_success_fee_note_required.sql` | `p_note` normalized with `regexp_replace(p_note,'^[[:space:]]+\|[[:space:]]+$','','g')` then `NULLIF(...,'')`; `NULL` → `RAISE EXCEPTION 'note_required'`. Trims spaces **and** tabs/newlines, so a whitespace-only note is rejected and the trimmed value is what gets stored. |

The note guard is the **only** change in `20260723150000`; the fee math,
settle-arrears-first credit, one-reversal-per-redemption guard, and approver
check are copied verbatim from `20260722120000` — no money-path behaviour moved.

**Tests already covering it**
- `supabase/tests/fee_reversal_test.sql` **scenario 6**: 6a null note → rejected
  `note_required`; 6b whitespace-only note → rejected `note_required`; no credit
  written, balance untouched. (Scenario 1 shows a valid note succeeds.)
- `src/app/api/admin/redemptions/[id]/reverse-fee/__tests__/route.test.ts`
  (4 tests): missing note → 400 (RPC never called), whitespace note → 400,
  valid trimmed note passes through, RPC `note_required` backstop maps to 400
  (not 500).

**Verdict:** requirement fully satisfied. Reason is non-optional, whitespace is
trimmed and rejected, route 400 and RPC exception are consistent. No change made.

---

## 2 · Agent attribution (G1) — wired end to end (already shipped)

Governance: DECISIONS_LOG **2026-07-02** (third revision, "merchant-authored
redesign"). Shipped on `main` via **#68**.

**Data path (attribution-only, fail-safe, self-escalation-proof)**
- Wizard `src/app/merchant/onboard/onboard-wizard.tsx` — "Were you helped by a
  Maanta agent?" (Yes/No) + agent picker; sends `onboardingAgentId` (or `null`).
- Route `src/app/api/merchants/onboard/route.ts` — the trust boundary.
  `ensureAppUser()` authenticates the **merchant**, who is always `p_user_id`.
  The agent id is forwarded as **attribution only**; a non-UUID is rejected with
  a typed **400** before the RPC. The RPC runs via the **service client** because
  it promotes the user's role and `prevent_self_role_escalation` only allows that
  for `service_role`/admin — a user-session call is rejected. An agent can never
  stand in as the caller.
- RPC `public.onboard_merchant` — migrations `20260702083812` (columns) →
  `20260702085628` (merchant-authored redesign; the live definition).
  Derives attribution from parameters: a **valid active** agent →
  `onboarding_mode = 'agent_assisted'` + `assisted_by_agent_id = <id>`;
  absent → `self_serve` + `NULL`; invalid/inactive/unknown →
  `RAISE EXCEPTION 'invalid_attribution'` (no merchant row created).

**Columns actually stored** (`public.merchants`): `onboarding_mode`
(`self_serve` \| `agent_assisted` \| `admin_assisted`, `NOT NULL DEFAULT
'self_serve'`, CHECK-constrained) and `assisted_by_agent_id`
(`REFERENCES public.agents(id)`, set only when `agent_assisted`).

**Tests already covering it**
- `supabase/tests/onboard_agent_attribution_test.sql` (3 scenarios): agent
  supplied → `agent_assisted` + `assisted_by_agent_id` + leaderboard credit links
  back to the merchant, and merchant (not agent) is `onboarded_by_user_id`;
  no agent → `self_serve` + NULL; inactive **and** nonexistent agent →
  `invalid_attribution`, no merchant row.
- `src/app/api/merchants/onboard/__tests__/route.test.ts` (5 tests): forwards the
  selected agent id with the merchant as submitter; non-UUID → 400 before RPC;
  null on "No"; whitespace → null; RPC `invalid_attribution` → 400.

**Verdict:** requirement fully satisfied end to end, server-derived and validated,
self-escalation protection intact. No change made.

---

## Conflicts flagged (per the "stop and describe, don't guess" rule)

Two points where the task's literal wording diverges from shipped, frozen
reality. Neither is a repo defect; changing the repo to match the wording would
introduce drift or violate a frozen decision, so I did **not**:

1. **"Store an `agent_assisted` boolean."** The shipped schema uses an
   `onboarding_mode` **enum** (`self_serve`/`agent_assisted`/`admin_assisted`),
   frozen 2026-07-02. `onboarding_mode = 'agent_assisted'` *is* the boolean, and
   the enum is strictly more expressive (it also records `admin_assisted`).
   Adding a separate boolean column would duplicate state and risk the two
   drifting apart. Semantically satisfied by the enum; **no column added.**
2. **"Update `src/lib/agent-attribution.ts`."** That file does not exist and
   should not — it was the **pre-#68** competing implementation deliberately
   dropped during the canonical reconciliation (see
   `docs/skills/agent-attribution.md` and `launch-audit-2026-07-24.md`).
   Attribution lives inline in the onboard route + `onboard_merchant` RPC. The
   only agent lib is `src/lib/agent.ts` (page/route guards), which is unrelated.
   The task itself says any helper must "reflect the merged main behaviour, not
   the older pre-#68 implementation" — i.e. do not resurrect it. **Not created.**

If a future ruling genuinely wants a denormalized boolean or a dedicated lib,
that needs a new decisions-log entry; it is not a silent Builder change.

## Files touched this session
- Added: this doc (durable verification artifact). No source/migration/test
  files were changed — both features were already complete and green.
