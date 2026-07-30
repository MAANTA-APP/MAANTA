# BBS Mall / Nairobi Rollout

**Status:** Canonical · **Last verified:** 2026-07-28  
**Audience:** founder, ops, agents, partners  
**Repo:** `docs/ops/nodes-nairobi-2026-07.md`, `docs/skills/node0-seed-bbs-mall.md`, agent rotation Notion pages

## Purpose

Explain Node 0 (BBS Mall) vs Nairobi density strategy vs synthetic rehearsal nodes — without implying multi-mall launch.

## Current reality

- **Node 0 = BBS Mall, Eastleigh.** Sole proving ground until PMF is clear.
- Feed is **node-scoped** via `maanta_node` cookie (default `BBS Mall`). Wrong cookie ⇒ empty feed.
- App registry can list additional Nairobi nodes for **rehearsal** (`CBD Galleria`, `Westlands Hub`) with seeded merchants. Those are **not** live launch markets.
- Field ops model: co-founder ops + **4 agents** on a 2/2 weekly rota (stand vs merchant-facing) — see Agent rotations page.

## What is working

- Product and seeds oriented to BBS GPS centroid and what3words / lat-lng.
- Rehearsal checklists, field WhatsApp templates, opening-credit rules (KES 300 / first 100 activations).
- Idempotent 100-deal BBS seed validated locally.

## Rollout framing

| Phase | Geography | Inventory | Goal |
|---|---|---|---|
| Now | BBS Mall | Seed and/or early real merchants | Prove claim→redeem→fee loop |
| Launch | BBS Mall | Real activated merchants | Habitual footfall redemption |
| Density | More Eastleigh / Nairobi malls (deliberate) | Real merchants only | Same playbook, new node string |
| Scale | Kenya+ | — | After Node 0 economics work |

## Merchant readiness at BBS

1. Agent captures lead / merchant self-serves onboard.
2. Admin activates (opening credit rules may apply in launch window).
3. Merchant tops up wallet (sandbox Stripe today).
4. Creates deal (zero-balance gate enforced).
5. Staff verify OTPs at counter; arrears path if wallet low.

## What is not yet ready

- Signed mall MoU / term sheet (drafts reworded for KES 300 credit framing; unsigned).
- Formal mall-operator reporting cadence (O4 open).
- Treating seeded CBD/Westlands inventory as partner traction.

## Risks

- Multi-node seed demos read as “we’re live across Nairobi.”
- Stale `maanta_node` cookies during demos.
- Agents promising fee waivers (forbidden — success fee always applies).

## Dependencies

- Mall access / stall placement / agent staffing.
- Prod seed vs real merchant mix decision before open launch.
- Comms plan for mall management (monthly health reports promised in brief — delivery process still light).

## Next actions

1. Keep BBS as the only external “launch node” language.
2. Label any multi-node demo as **rehearsal seed**.
3. Close MoU review with legal before signature.
4. Define O4 reporting artifact (even if spreadsheet-first).

## Related pages

- MAANTA Overview
- Launch Readiness
- Product Flows
- Agent rotations and roles
- Field templates and launch rota
- Strategic Partnerships and Data Pathway
