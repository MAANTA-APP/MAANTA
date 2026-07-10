# MAANTA PG Health Check

Standard health check for MAANTA, re-run after every major BBS milestone.
Format is fixed: **Core Assumption → Minimum Feature Set → What Gets Cut → Test Criteria → 2-Week Launch Plan**.
The full evaluator lives at `.claude/skills/pg-maanta-startup-evaluator/` (invoke `/pg-maanta-startup-evaluator`); this page is its operational counterpart and scoreboard.

---

## Core Assumption (locked)

> A dense cluster of BBS merchants will keep paying per redemption if MAANTA repeatedly drives incremental, trackable in-store sales in their dead hours.

Every commit, trip, and shilling in the next 30 days exists to test this — nothing else.

**Version 1 verdict (2026-07-10):** Pivot required (wedge). Product is launch-complete (core loop, fee rails, fraud/trust, CI all shipped); market evidence is zero. The ratio of engineering-proven to market-proven is inverted. The three flaws to watch, ranked: **(1) no repeatable shopper habit, (2) merchant economics don't clear, (3) ops complexity at node 0 too high.**

## Minimum Feature Set (only code that may be touched)

1. **Merchant promo wallet** — `promo_balance_kes` per merchant (start 300 for first 100) + a simple admin view: merchant, promo balance, redemptions.
2. **One simple deal type** — one active standard deal per merchant, 24h max, created via existing merchant UI (agent-guided) or back office.
3. **Claim → OTP → verify loop as-is** — shopper picks BBS, sees live deals, claims a ticket; merchant/agent verifies with the existing UI/RPC.
4. **Fee logic mapped to promo** — each successful redemption decrements promo balance by KES 30 until zero; at zero, block further redemptions until a real top-up (or log "would bill" events).
5. **PostHog events** — `deal_created`, `deal_published`, `deal_claimed`, `deal_redeemed`, `wallet_promo_debited`, `wallet_retopup`.

## What Gets Cut (next 4–6 weeks)

Expansion beyond BBS; flash/boost UX polish; multi-currency live usage; advanced admin UX; waitlist system; marketing site / new flows; extra trust-metric variants; any optimization that doesn't move one of the five numbers below.

**Rule:** if a commit does not materially increase merchants live, claims, redemptions, promo-burn-down rate, or re-top-ups — it waits.

## Test Criteria (30-day BBS scoreboard)

| Metric | Bar |
|---|---|
| Merchants with ≥1 live deal | ≥ 70 of 100 |
| Merchants using ≥5 of 10 free redemptions (balance ≤ KES 150) | ≥ 50 |
| Merchants fully exhausting KES 300 promo | ≥ 30 |
| Merchants agreeing to pay KES 30/redemption after promo | ≥ 20 |
| Total shopper claims in cluster | ≥ 300 |
| Claim → redeem rate on monitored deals | ≥ 40–50% (≥ 120–150 redemptions) |
| **Unprompted re-top-ups** (the "business, not product" line) | **> 0, growing** |

## 2-Week Launch Plan

- **Days 1–2 — Freeze code, BBS mode.** Lock main; only the promo-balance migration + minimal admin surface. Default node = BBS, hide other nodes. MAANTA becomes a pilot instrument, not a general product.
- **Days 3–4 — Nairobi setup.** Be physically at BBS (access fit is the V1 red flag — solve it). Stall, 3–5 agents, daily reporting sheet: merchant, promo balance, redemptions, comments.
- **Days 5–7 — First 30 merchants.** Walk the cluster; high-pain merchants get "10 MAANTA customers free (KES 300), 30 days, we do the setup." One simple deal each, targeting their worst hours. End of Day 7: 30 live.
- **Days 8–10 — Drive claims.** Agents push claims during slow hours; be present in-shop for first redemptions; fix verification confusion on the spot. Nightly: PostHog + DB per merchant; WhatsApp each merchant yesterday's numbers, collect a one-sentence reaction.
- **Days 11–14 — Cohort 2 + first signals.** Recruit merchants 31–60 with real early stories. By Day 14 the direction is visible: low claims → flaw 1; claims but merchant shrugs → flaw 2; unrealistic agent/founder load → flaw 3. Run the full 30-day window before changing the wedge.

## Re-run protocol

On Day 31 (and after each milestone after that), re-run `/pg-maanta-startup-evaluator` with **actual** PostHog claim/redemption counts, actual re-top-up numbers, and actual BBS merchant quotes — no repo inference. Compare against this page: which flaw materialized, which was disproved. If the verdict is still "pivot required," the pivot must attack the specific flaw the data names — not the cosmetics.

| Version | Date | Verdict | Notes |
|---|---|---|---|
| V1 | 2026-07-10 | Pivot required (wedge) | Pre-launch; zero market evidence; full scoreboard above pending |
| V2 | _Day 31 of BBS experiment_ | — | — |
