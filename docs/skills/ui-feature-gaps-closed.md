# Skills: UI feature gaps closed — A2, A3, G4

**Date:** 2026-07-22 · **Track:** Builder · **Scope:** the three feature-gap tickets
deferred by `docs/skills/ui-walkthrough-roles.md` (A2, A3, G4). Auth, the money
path, RLS, pricing and the frozen-UI rules are **unchanged** — this session only
surfaces existing data and writes one attribution column. No migrations, no RPC
edits, no money-lib edits.

## What was closed

### A2 — Admin customers / users list ✅
- **New route:** `/admin/customers` (`src/app/admin/customers/page.tsx`), gated by
  `requireAdminPage()`, added to the admin sidebar between Merchants and Deals.
- Lists straight from `public.users` (not a shadow schema): name, short id
  reference, email/masked phone, **role chip**, blacklisted flag, join date.
  Search across name/email/phone; neutral (non-amber) role filter pills. Money-free
  surface. Read-only — no auth/role writes happen here.
- **Caveats / follow-up:** capped at 100 most-recent rows; no pagination and no
  per-user detail page yet.

### A3 — Admin redemption detail ✅
- **New route:** `/admin/redemptions/[id]` (`src/app/admin/redemptions/[id]/page.tsx`),
  gated by `requireAdminPage()`, fetched via the service client (no ad-hoc money maths).
- Shows the ticket snapshot the money path already wrote: **YOU PAY `amount_kes`**
  and **success fee `success_fee_charged`** in `tnum` tabular ink (never muted,
  never amber), the code in `.font-code`, a `StatusChip`, the redeemed/expiry
  timeline, distance-from-shop, and any `fraud_flags` via `FraudChip`. Links out to
  the merchant detail and shows the customer. An `InlineAlert` flags
  `review_required`/`flagged` and points admins to the fraud queue for release/reject
  (actions stay at the fraud-event grain — this route is read-only surfacing).
- The "All redemptions" rows on `/admin/redemptions` now link into this detail; the
  old A3 TODO is removed.
- **Caveats / follow-up:** no per-redemption action buttons here by design; release
  / reject remains on the fraud-event list.

### G4 — Agent lead↔merchant linkage ✅
- **New shared guard:** `src/lib/agent.ts` (`requireAgentPage`, `requireActiveAgentApi`)
  and a thin `src/app/agent/layout.tsx` that enforces the agent role at the segment
  root (defense-in-depth; also covers the previously ungated client lead-capture page).
- **New route:** `/agent/leads/[id]` (`page.tsx` + `link-merchant.tsx`) — lead detail
  showing whether it converted (`leads.converted_to`) and, if not, a **single amber
  "Link to merchant"** action listing only shops the agent onboarded
  (`merchants.onboarded_by = agent`). Lead rows on `/agent` and `/agent/leads` link here.
- **New API:** `POST /api/leads/[id]/link` — agent-gated; verifies the lead's
  `agent_id` **and** the target merchant's `onboarded_by` both belong to the caller,
  refuses an already-linked lead or a merchant already tied to another lead, then sets
  `converted_to` + `status='converted'`. **Attribution only** — writes no money/ledger
  columns (asserted in tests).
- The pre-existing `leads.converted_to` FK column already existed; G4 just wires the
  agent UI/API to it. This does **not** change onboarding attribution (`onboarded_by`
  at activation) — it is additive.
- **Caveats / follow-up:** the agent can only link shops they onboarded (chosen
  boundary); a lead cannot yet auto-link at onboarding time (that is G1/G3, still open).

## Tests / safety
- New static guard: `src/lib/__tests__/feature-gaps-a2-a3-g4.test.ts` (routes exist,
  admin/agent guards present, money is `tnum`/ink not `text-brand`, link API touches
  only attribution columns). **`npm test` → 51 passed**; `npm run typecheck` clean;
  `next build` **compiled successfully** (pre-existing public-page prerender errors from
  a missing Clerk `publishableKey` in CI are unrelated — all new routes are `force-dynamic`).
- **Money-path SQL tests** (`supabase/tests/*.sql`) require a live Postgres and were not
  run in this headless session; they remain green **by construction** — this session
  changed zero migrations, RPCs, or money libraries (`git status` confirms).

## Still open (not this session)
- A8 (deal "Keep" persistence), G1/G3 (agent-assisted onboarding attribution at the
  onboard RPC), plus the polish backlog in `ui-walkthrough-roles.md`.
