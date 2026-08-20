# Nairobi Field Operations page — Notion Build OS (2026-08-20)

**What this is.** The durable repo record of a Notion-side change: the creation
of the Nairobi field operator's operational home inside MAANTA — Build OS, and
the founder's classification of SKANDI SKAN that came with it. The Notion page
is the operating surface; this file is the handoff record so the change is
discoverable from the repo.

## What was created (all under the existing Build OS — nothing duplicated)

| Artifact | Where | Notes |
|---|---|---|
| Page **🇰🇪 Nairobi Field Operations — Node 0** | Child of *MAANTA — Build OS* (`app.notion.com/p/3c22048e273481ec8a1ce10797e228ed`) | Mobile-first: CURRENT MISSION (find Merchant #1), today's actions, quick access, then role definition, Merchant #1 criteria, onboarding checklist, attribution-loop sequence, failure protocol, usability observation rule, success ladder (0 → 1 → 5 → 10 → 20, currently **0**), evidence/feedback/decision split, communication guardrails, escalation levels, Nairobi ↔ founder loop, canonical quick links, permissions note |
| Database **Merchant Prospect Tracker — Node 0** | Child of the page | Field pipeline only; statuses Not approached → … → Declined; Category select reuses the founder-locked ten-bucket deal taxonomy; no unnecessary personal data |
| Database **Field Test Runs — Node 0** | Child of the page | One row per controlled test; per-step PASS/FAIL/BLOCKED/N-A; Merchant is a relation to the prospect tracker; `Counts toward ladder?` gates the success ladder; includes a `TEMPLATE — copy me` row |
| Database **Daily Field Reports — Node 0** | Child of the page | Counters + Observations / Merchant feedback / Shopper feedback / Problems / Founder decision needed / Next approved actions; includes a `TEMPLATE — daily report` row |
| Navigation line | *MAANTA — Build OS* top callout area | One line pointing to the new page |
| Dated note | *MAANTA - OpTruth* → "Last updated" | Records the SKANDI SKAN classification and points to the new page and D147 |

## Reuse decisions (why no other database was created)

- **Merchant records**: the system of record for merchant *accounts* is
  production Supabase via the app. The prospect tracker is explicitly the
  pre-account field pipeline; no Notion merchant database existed to reuse
  (checked by workspace search 2026-08-20 — Notion holds planning pages only).
- **Terminology**: closed vocabulary preserved (claim, redeem, deal, wallet,
  top up, success fee, verify, ticket); category options are the ten-bucket
  taxonomy ruled 2026-08-18.
- **Canonical pages linked, not copied**: OpTruth, Current State (Start Here),
  BBS Mall / Nairobi Rollout, MAANTA Overview, Revenue & Business Model,
  Node 0 Rehearsal Checklist, Launch Readiness, Open Questions, Decisions Log,
  Agent rotations, plus repo docs (`docs/ops/live-pilot-3-person-2026-07-30.md`,
  `docs/maanta-launch-readiness-tracker.md`, the dated decision queue).

## SKANDI SKAN classification

Founder statement (2026-08-20, recorded in `docs/maanta-decisions-log.md` and
drift row **D147**): SKANDI SKAN was a **UK registration/testing exercise
involving the founder's brother**. It proved the software onboarding path and
nothing about Nairobi merchant acquisition. Historical records counting it as
"1 real merchant" stay as written (they describe a non-demo row); every
forward-looking claim must carry the distinction, and it never counts toward
the 0 → 1 → 5 → 10 → 20 real-redemption ladder.

## Flagged for founder, not changed

- **Notion permissions**: the page sits in the shared Build OS workspace.
  Least privilege for the field operator means sharing the page (children
  inherit) rather than the workspace, or knowingly accepting that the operator
  can read the Decisions Log (bannered founder-only), OpTruth (production
  identifiers, security detail) and Legal & Finance. Not inspectable or
  changeable from an MCP session.
- **Shopper OTP SMS to a Kenyan number** is unproven in production (the
  2026-08-16 attempt failed on a Norwegian number); the page instructs the
  operator to treat a missing code SMS as a 🔴 blocker, not to work around it.

## Not verified from this session

- Live production row counts were **not** re-measured here; the page's
  "Current state" table cites the 2026-08-19/20 canonical reads (399
  redemptions all demo, 0 real staff seats, demo mode on) and defers to
  OpTruth as it ages.
- Notion sharing/permission state (see above).

No engineering work was started as a consequence of this page. No product
ruling was altered; the decisions-log entry records a founder statement and a
Notion structure, not a rule change.
