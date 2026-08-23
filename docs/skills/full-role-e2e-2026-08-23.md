# Full-role production E2E — 2026-08-23

Founder instruction: *"do a complete e2e as every user from admin to shopper"*,
then *"continue and come back for all the issues and fixes"*.

Run by hand against **production** (`www.maanta.app`, Supabase
`axrrslqssmbngbataejg`), six emailed sign-in codes across four accounts, with a
parallel codebase audit mapping every route per role so coverage was measured
against an inventory rather than memory.

**Headline:** the whole loop works on email-only identities, and a staff seat —
not the owner — closed the money path. **Seven defects found, two fixed and
deployed during the run.** One of them, D162, blocks real merchant onboarding
and is a billing problem, not a code problem.

## 1. Coverage

| Role | Account | Surfaces | Result |
|---|---|---|---|
| Admin | `admin@maanta.app` | 12/12 | all render clean, no error boundary |
| Merchant owner | `aragagency@gmail.com` | 12/12 | all render clean |
| Shopper | `aragagency+shopper2@gmail.com` | 9/9 | all render clean |
| Merchant staff | `aragagency+staff1@gmail.com` | 10 probed | permission matrix correct bar one page |
| Founder console | (admin role) | 1/1 | renders |
| **Agent** | — | **0** | **no agent account exists — untested** |
| **Cofounder** | — | **0** | zero holders by design (Q14) — untested |

## 2. The loop, end to end

Admin creates shop → approvals queue 0→1 → approve → **KES 300 opening credit**,
no Elite slot consumed, 2 `admin_ops_log` rows → merchant publishes Deal 01
(KES 150, max 1 claim) → deal is **discoverable in search and browse**, shows
`0 verified` honestly, **map pin renders** → shopper claims, OTP issued,
15-minute grace shown, `amount_kes` snapshotted → **staff seat** enters the code
→ `CODE VALID`, `−KES 30`, "wallet after KES 270" shown *before* charging →
confirm.

Read-back:

```
status = success · success_fee_charged = 30.00 · Guardian clear · fraud_flags null
account_balance 300 → 270 · outstanding_arrears 0.00
ledger: topup 300.00 , success_fee -30.00
shopper: aragagency+shopper2 · seat holder: aragagency+staff1
```

Then admin sees it everywhere: Overview `Verified (7d) 1`, `Success fees (7d)
KES 30`; Reports `Verified redemptions 1`, `Success-fee revenue KES 30`;
redemption detail with linked records, timeline, fee ledger and Guardian panel.

**Still a software proof, not field evidence — the Success ladder stays at 0.**

## 3. Guards confirmed working

- **D25 paused deals, verified two ways.** Pausing dropped the deal from
  `deals_public_browse` **1 → 0** instantly, and production's `claim_deal`
  genuinely contains the `deal_paused` gate (`pg_get_functiondef` read-back).
  Resume restored both.
- **Re-claim refused:** `409 — "You already have an active claim on this deal."`
- **Tier limit enforced** at publish (see D166 for *when*).
- **Staff permission matrix:** deals/new and topup both render a permission
  denial naming the fix ("Ask the shop owner to enable it in Staff").
- **Owner-only API boundary:** `POST /api/staff` as staff → **403**.
- **Counter Cancel** returns to the keypad with the wallet untouched.
- **Elite trial** was unticked at every approval; the launch offer still reads
  99 of 100.

## 4. Defects found

| ID | What | Severity | Owner |
|---|---|---|---|
| **D162** | what3words is **over quota** in production (HTTP 402 `QuotaExceeded`) — self-serve merchant onboarding cannot be completed at all | **blocker** | founder (billing) |
| **D164** | `Claims (7d)` reads **0 forever** on admin *and* founder — filters `redemptions.created_at`, which does not exist | **high** | founder (migration) |
| **D165** | `/merchant/staff/new` renders the owner-only form to a non-owner (API correctly 403s) | medium | engineering |
| **D166** | Standard merchant completes the whole 5-step wizard before the deal limit refuses them | medium (UX) | founder |
| **D167** | Copy: "max 1 claims", "standard plan allows 1 active deal(s)", ticket countdown "1449:12" | low | engineering |
| **D163** | "Submitted now ago" on the approvals queue | low | **fixed** |
| — | `POST /api/deals` returned a 500 with an empty body and no server log on a malformed payload | low | engineering |

### Fixed and deployed during the run

- **The w3w failure was invisible.** `!res.ok` was fused with the
  no-coordinates branch and logged nothing, so a dead integration looked
  identical to an operator mistyping — on both the onboarding wizard and the
  admin location panel. Now a non-2xx is `upstream_rejected`, says
  "temporarily unavailable", returns 502 + `serviceDown`, and **logs the
  upstream status and the provider's own error code** (never the key, never the
  address). That logging produced the root cause on its first call.
- **"Submitted now ago"** → `relativeAgo` owns the phrase (D163).
- Guard: `maanta-app/src/lib/__tests__/w3w-failure-modes.test.ts`, 8 cases.
- One pre-existing assertion in `what3words.test.ts` was **pinning the defect**
  (non-2xx ⇒ `not_found`) and was corrected, with the reason recorded at the test.

## 5. Two claims I withdrew

Recorded because a test run that only reports confirmations is not trustworthy.

- **"Resume does not repaint."** Wrong. The panel updates; it takes ~6s and I
  read it at 2.5s. Retested and retracted before it reached the register.
- **"The redemption is missing from the admin list."** Wrong. It is the top row;
  the list renders timestamp, status and fee but not the deal title, so a
  title-matching probe missed it. (Worth noting as a usability point: an admin
  cannot tell which deal a row belongs to without opening it.)

## 6. What this run did NOT prove

- **Agent surfaces** — `/agent/*` is unreachable: no `agent` account exists and
  nothing in the UI creates one. Needs a founder decision (create an account +
  a role assignment) before it can ever be tested. Note **D159** already
  suspects agent-created merchants are invisible to their own agent.
- **Cofounder** — zero holders by design.
- **Reject code** at the counter, and the merchant **override** path.
- **Paused-deal claim as a live 409** — the max-1 deal was already claimed, so
  the already-claimed guard fires first; verified via the RPC and browse view
  instead.
- **Zero-balance gate** — the wallet never reached 0 (one redemption of ten).
- **Top-up rails** — Stripe is sandbox, IntaSend unconfigured (E6).
- **Elite trial grant** — deliberately never exercised; it consumes a real slot
  from the frozen first-100 offer and the cap does not exclude test rows.
- **Microsoft mailboxes** — D156 open, so no Outlook/Hotmail account can sign in.

## 7. Test rows left live

Shop `67fe233d` "E2E Full Sweep Shop", deal `5ab34941`, redemption `72f95ac8`
(a real non-demo `success`), staff seat, and the users. Cleanup is the founder's
call: removing them keeps production counts honest but destroys the artefact,
as it did on the two previous runs.
