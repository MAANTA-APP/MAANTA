# Claude Design design-sync prompt — align artefacts to backend (2026-07-24)

**Created:** 2026-07-24 · **Mode:** Builder · **Status:** durable handoff.
Paste the fenced block below into **Claude Design** to bring MAANTA's boards /
wireframes / specs into line with the backend now on `main` (after
PRs #68/#70/#71). Grounded in repo + migration state; sources listed at the bottom.

---

```
You are Claude Design working on MAANTA. Your job in this task is to update
MAANTA's existing design artefacts — boards, wireframes, and written specs — so
they match the CURRENT backend implementation. You are editing design docs
(copy, labels, states, annotations), NOT code. Treat the repo and its database
migrations as the source of truth: design follows the backend, it does not
redefine it. Where an artefact disagrees with the backend facts below, change the
artefact.

## MAANTA in one paragraph
MAANTA is an in-mall deals platform piloting at BBS Mall, Nairobi. Shoppers browse
and claim deals in the app; the app issues a 6-digit code; the shopper shows it at
the merchant's counter; staff verify it and the shopper pays the merchant DIRECTLY
IN CASH at the discounted rate. Core invariants:
- Shoppers NEVER pay inside the app. There is no shopper checkout, cart, card
  entry, or in-app charge — anywhere.
- MAANTA's money logic is entirely merchant-side: the KES 30 success fee per
  verified redemption, wallet balance, arrears, fee reversals, agent attribution,
  and merchant wallet top-ups. None of it charges the shopper.

## Goal
Update the existing boards/wireframes/specs so they fully reflect the current
backend: fee-reversal reason enforced end to end, agent-assisted onboarding
attribution implemented and server-derived, cash-only shopper behaviour, and the
"Collect from shopper KES N" amount clearly represented. Fix any lingering
references to older patterns (a separate `agent_assisted` boolean; a
`src/lib/agent-attribution.ts` lib; fee-reversal reason described as UI-only).

## Behaviour facts the artefacts MUST reflect

Fee-reversal reason (mandatory, enforced in four layers):
- A decision note/reason is REQUIRED on every success-fee reversal (governance
  ruling 2026-07-23). The incident number stays optional.
- Enforcement is not UI-only. It is enforced at: the UI (Confirm disabled until a
  note is entered), the route (empty/whitespace note → HTTP 400 before the RPC),
  the RPC, and the database. The RPC `reverse_success_fee` trims all surrounding
  whitespace (spaces, tabs, newlines) and raises `note_required` on an empty
  result, and the route maps that `note_required` back to 400. A whitespace-only
  note is rejected.
- Everything else about a reversal is UNCHANGED by the note rule: the fee amount
  (the redemption's stored snapshot, never client-supplied), settle-arrears-first
  wallet credit, one-reversal-per-redemption guard, and the admin-approver check.
  Do not redesign the reversal flow — only make the "reason required, enforced by
  backend" fact explicit.

Agent-assisted onboarding attribution (G1):
- How a merchant was onboarded is stored as an ENUM `onboarding_mode` with exactly
  three values: `self_serve`, `agent_assisted`, `admin_assisted`. This enum is the
  canonical representation — there is NO separate `agent_assisted` boolean field.
  Wherever a spec says "store an `agent_assisted` flag/boolean", rephrase it as
  "set `onboarding_mode = agent_assisted`".
- `assisted_by_agent_id` is stored ONLY when an agent assisted and the id
  references a valid, active agent. An invalid, inactive, or unknown agent id is
  rejected with `invalid_attribution` and no merchant is created. "No agent"
  stores `self_serve` with a null `assisted_by_agent_id`.
- Attribution is server-derived and validated, never trusted from the client. The
  merchant is ALWAYS the authenticated caller (the wizard submitter); the agent is
  a recorded credit only and can never stand in as the caller. An agent cannot use
  this flow to escalate their own role — role promotion runs through the trusted
  server path with a self-escalation guard.

Shopper cash-only:
- No shopper payment/checkout screen exists or should exist. The shopper's only
  money-relevant action is presenting the code; payment happens off-app, in cash,
  to the merchant, after staff verify and accept the discounted rate.
- The only payment surfaces in the product are MERCHANT wallet top-ups (M-Pesa /
  card) and the merchant success fee — both merchant-side.

"Collect from shopper KES N":
- This is the shopper's "You pay" total, snapshotted at claim time onto the
  redemption. It is surfaced to the merchant on TWO screens: the pre-confirm
  disclosure (resolve) screen and the post-verify success takeover.
- It is DISPLAY-ONLY — it is the cash the merchant collects in person, not an
  in-app charge. It is a DISTINCT figure from (a) the KES 30 success fee and
  (b) the merchant wallet balance; never merge the three. It is OMITTED entirely
  when the amount is missing, zero, or negative (no "KES 0" row).

Phone-at-claim:
- Browsing requires no phone. CLAIMING a deal requires a verified phone; an
  email-only shopper who taps Claim is routed through a one-time phone SMS-OTP
  verification, then returned to the deal. This is a verification gate, not a
  payment step.

Healthz / FX (design background, not shopper/merchant UI):
- Healthz is an ops/admin concept only: a public liveness readout (status, uptime,
  build) plus an admin-gated, boolean-only "env presence" map (which rails are
  configured — never any secret value, no DB access). It is diagnostic, not a
  metrics dashboard.
- FX (non-KES → KES conversion for card top-ups) exists in the backend as an
  internal money-path concern. Do NOT expose FX or a currency selector to shoppers
  or merchants; if referenced at all, it is an internal note on merchant top-up
  ("charged in KES").

## Screens / specs to review and adjust

Fee-reversal screen + spec (admin):
- Mark the reason field clearly as REQUIRED, with the Confirm/submit disabled until
  a non-empty reason is entered.
- Add an annotation that the reason is enforced by the backend (route 400 + RPC/DB
  `note_required`, whitespace trimmed), not by the UI alone. Correct any spec text
  that calls the reason optional or UI-only.
- Keep the rest of the reversal spec as-is (amount is the stored fee; arrears
  settled first; one reversal per redemption; admin approver).

Agent-assisted onboarding screens + spec (merchant onboarding wizard):
- Keep the wizard's "Were you helped by a Maanta agent?" (Yes/No) + agent picker,
  shown on the review step, only when agents exist. Helper copy makes clear the
  merchant is still submitting themselves and the agent is being credited.
- In the spec, describe the stored result as `onboarding_mode` (self_serve /
  agent_assisted / admin_assisted) plus `assisted_by_agent_id` for a valid active
  agent — NOT a separate boolean. State that invalid/inactive/unknown agents are
  rejected (invalid_attribution) and that agents cannot self-promote through this
  flow.
- Remove/rephrase any reference to `src/lib/agent-attribution.ts` as the mechanism
  — attribution lives in the onboarding route and the `onboard_merchant` RPC;
  the old lib was dropped and is not canonical.

Merchant redeem screens (disclosure + success):
- Confirm "Collect from shopper KES N" is present on BOTH the pre-confirm
  disclosure screen and the success takeover, in its own labelled row, visually
  separated from the KES 30 fee and the wallet balance.
- Label it explicitly as a display-only, in-person cash amount ("collect from the
  shopper"), and show the omitted state when there is no amount.

Shopper flows:
- Ensure there is no in-app payment/checkout anywhere. The shopper artefacts should
  show only: browse, claim (with the phone-at-claim verification gate), and the
  code ticket the shopper presents at the counter (live countdown, "show this
  screen at the counter"). Remove any cart/checkout/card elements if present.

Admin / ops views:
- Where design docs cover admin/ops, add short notes for healthz (liveness +
  boolean env presence, no secrets, no DB) and FX (internal backend concern for
  multi-currency top-ups, never a shopper-facing control). Keep these as spec
  notes, not new product UI.

## Constraints
- Work at wireframe/spec level — copy, labels, annotations, states — not
  pixel-perfect UI, and not a redesign of the visual language.
- Do NOT introduce any in-app shopper payment UI.
- Do NOT propose redundant backend fields — in particular, do not add a separate
  `agent_assisted` boolean; the `onboarding_mode` enum already carries that.
- The repo and its migrations are the source of truth. If an artefact and the
  backend disagree, change the artefact to match the backend; do not ask the
  backend to change.
- Annotate each artefact you touch with a one-line note on WHAT changed and WHY,
  so a reviewer can diff against the previous version.
```

---

## Sources (repo/migration state on `main`, 2026-07-24)

- Fee reversal: `supabase/migrations/20260723150000_reverse_success_fee_note_required.sql`
  (RPC `reverse_success_fee`, `regexp_replace` whitespace-trim + `note_required`),
  `src/app/api/admin/redemptions/[id]/reverse-fee/route.ts` (400 + `note_required`→400),
  tests `supabase/tests/fee_reversal_test.sql` (scenario 6), reverse-fee route test.
- Agent attribution: `supabase/migrations/20260702083812…` → `20260702085628_onboard_merchant_merchant_authored_redesign.sql`
  (enum `onboarding_mode`, `assisted_by_agent_id`, `invalid_attribution`),
  `src/app/api/merchants/onboard/route.ts` (merchant is caller; service client),
  tests `supabase/tests/onboard_agent_attribution_test.sql`, onboard route test.
- Cash-only + collect: `src/app/merchant/(app)/redeem/redeem-keypad.tsx`,
  `src/components/ui/redemption-result.tsx`, `src/app/api/redemptions/preflight/route.ts`,
  `…/verify/route.ts`. Payment surface = `src/app/api/topup/route.ts`,
  `…/topup/stripe/route.ts`, webhooks only — all merchant-side.
- Spec drift to correct: `docs/skills/launch-audit-2026-07-24.md` (L141 heading uses
  `agent_assisted` shorthand; L77 notes no `agent-attribution.ts` lib),
  `docs/skills/ui-walkthrough-roles.md` (L187 "records `agent_assisted`"),
  `docs/skills/agent-attribution.md`, `docs/skills/clerk-auth.md` (phone-at-claim),
  `docs/maanta-node0-rehearsal-checklist.md`.
```
