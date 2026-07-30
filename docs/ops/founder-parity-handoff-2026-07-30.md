# Founder parity handoff — 2026-07-30

**Audience:** Founder / operator (not engineering).  
**Purpose:** One place for money-path truth, Elite trial vs D-12, env blockers, and product decisions that still need a human call.  
**Companion:** [Node 0 pilot readiness](./node0-pilot-readiness-2026-07-30.md) (go / no-go + landing order).

---

## What is already aligned (trust this)

| Topic | Truth on `main` @ `4f418755` (+ consolidation when landed) |
|---|---|
| Shopper claim → redeem | Claim → phone gate → ticket + **15-minute** grace → show till fee → merchant **Confirm** (verify-anyway; fee) or **Reject** (no fee) |
| Deal lifecycle | `live` / `grace` / `expired` / `paused` match SQL + UI; paused deals are not claimable once pause-gate migration is applied |
| Top-up | **Stripe-primary**; M-Pesa STK only when IntaSend is configured; honesty copy when STK is off |
| KES 30 | Success fee on every verified redemption, all plans — not under review |
| Notification prefs | Canonical toggles at **`/you/notifications`**; `/notifications` is inbox-only |
| Browse / Map | Separated surfaces (PR #113); Map needs merchant GPS |

Full matrix: [`docs/skills/parity-surface-matrix-2026-07-30.md`](../skills/parity-surface-matrix-2026-07-30.md).  
Drift log: [`docs/skills/parity-drift-register-2026-07-30.md`](../skills/parity-drift-register-2026-07-30.md).

---

## Elite trial vs D-12 (do not conflate)

| | Governed Node 0 rule (allowed) | D-12 ban (not allowed) |
|---|---|---|
| What | First **100** BBS Mall merchants get a **30-day Elite trial** | Ungoverned “first month of Elite **free**” / “Elite free month” marketing |
| Fee | **KES 30** still applies on every verified redemption | Implying Elite removes the success fee |
| Cap | DB: `elite_trial_cap_status()` / first-100 sentinel | Open-ended free Elite with no cap |
| Copy | `/pricing` and merchant surfaces must say trial + KES 30 | Role-hardening / cash-only tests block free-month wording only |

After paid Elite ends: 7-day grace, then auto-downgrade to Standard if no conversion (frozen business rule).

---

## Env / ops blockers (concrete human actions)

| Need | Where | What you do |
|---|---|---|
| **Clerk publishable + secret** | Vercel → project `maanta-nuia` → Production env | Set both for instance `cheerful-sailfish-3`. Publishable alone is not enough. Redeploy after save. Without both, browser gets Clerk “Invalid host”. |
| **`W3W_API_KEY`** | Same Vercel Production env | Required for merchant onboard what3words validation. Empty → onboard fails closed. |
| **Pause-gate + July 30 migrations** | Supabase project `axrrslqssmbngbataejg` | After PR **#148** merges: from `maanta-app/`, `supabase link` then `supabase db push`. Confirm version **`20260730180000`** (`restore_claim_deal_pause_gate`) is applied. Do **not** add a new migration at `…160000` — that version is reserved (prod notes alias). |
| **Opening-credit (#143)** | Same Supabase | Lands as **`20260730170000`** when #143 merges; then `db push`. |
| **Merchant lat/lng + GPS** | Supabase + data | Migration `20260726120000_merchant_lat_lng` must be applied. Then **backfill** BBS Mall merchant pins (CSV/SQL). Without GPS, Browse works; Map pins stay empty. |
| **Playwright confidence** | GitHub Actions secrets (or local `.env`) | Optional. Set `E2E_BASE_URL` to a **non-prod** URL only. Never point at production. Needs `E2E_SHOPPER_*`, `E2E_MERCHANT_*`, optional `E2E_ADMIN_*`. |

Migration map detail: [`docs/ops/supabase-migrations.md`](./supabase-migrations.md).  
Step checklist: [`docs/ops/founder-e2e-checklist-2026-07-30.md`](./founder-e2e-checklist-2026-07-30.md).

---

## Remaining product decisions (not money-path blockers)

These do **not** block a careful Node 0 pilot if you accept the current UI:

1. **Feed marketing titles** — product still uses “Hot deals” / “Ending soon” / “All deals” in places; design locked names are “Flash Deals” / “Priority Deals” / “All Active Deals”. Pick one vocabulary for launch marketing.
2. **`/contact`** — design-ahead: fake success, no API. Decide: hide for pilot, or ship a real inbox later.
3. **Admin deal-report taxonomy** — not a live admin queue yet; agent/admin use existing dispute/fraud paths.

---

## PR landing order (before real pilot traffic)

1. Merge **#148** (branch-audit consolidation: pause-gate → `180000`, prefs canon).
2. Merge **#137 / #143 / #94 / #131** (optional **#121 / #142**).
3. Human **`supabase db push`** on production so `170000` / `180000` (and any other pending) actually apply.
4. Confirm Clerk + `W3W_API_KEY` on Vercel Production; GPS backfill for Map.

Do **not** edit `main` directly for these fixes — land via the PRs above.
