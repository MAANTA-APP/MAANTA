# Founder E2E checklist — first real pilot walkthrough (2026-07-30)

Use this for a **disciplined** end-to-end session of the critical pilot journey.
This is **not** a public-launch checklist. Seed/rehearsal data and demo mode may
still be on.

Companions:

- **Go / no-go:** `docs/ops/node0-pilot-readiness-2026-07-30.md`
- Parity / Elite handoff: `docs/ops/founder-parity-handoff-2026-07-30.md`
- Inventory report: `docs/ops/e2e-readiness-report-inventory-2026-07-30.md`
- Route table: `docs/ops/e2e-route-readiness-2026-07-30.md`
- Prior trial-honesty report: `docs/ops/e2e-readiness-report-2026-07-30.md`
- Migrations: `docs/ops/supabase-migrations.md`

App: **https://www.maanta.app** (unless you intentionally use a non-prod deploy).  
Vercel: project **`maanta-nuia`**. Supabase: **`axrrslqssmbngbataejg`**.  
Do **not** confuse this with Playwright CI (`docs/ops/e2e-golden-path.md`) —
that suite must **never** target production.

**Before this walkthrough:** merge **#148** then **#137 / #143 / #94 / #131**,
then human `supabase db push` so pause-gate `20260730180000` (and opening-credit
`20260730170000` if #143 landed) actually apply. See Node 0 readiness note §4.

---

## 0. Prerequisites (before any click)

### Migrations (Supabase project `axrrslqssmbngbataejg`)

From `maanta-app/`: `supabase link --project-ref axrrslqssmbngbataejg` →
`supabase migration list` → `supabase db push` (prefer `--dry-run` first).

- [ ] Confirm these versions appear in **REMOTE**:
  - `20260730130000` — Elite first-100 cap
  - `20260730140000` — trial expiry sentinel
  - `20260730150000` — demo wipe audit retention
  - `20260730180000` — **pause-gate** (must block new claims on paused deals)
  - `20260730170000` — opening-credit reland (**after #143**)
  - Do **not** expect a *new* file at `20260730160000` — that number is
    **reserved** (prod notes ledger alias)
- [ ] **Lat/lng:** `20260726120000` present; if Map pins empty, **backfill**
  BBS Mall merchant `lat`/`lng` (Browse works without pins; Map does not)
- [ ] **Cap status:** `SELECT * FROM public.elite_trial_cap_status();`  
  Note `cap / granted / remaining`. High `granted` after first apply = durable
  backfill — slots already consumed stay consumed.
- [ ] **Demo posture:** `SELECT value, notes FROM app_config WHERE key = 'demo_mode_enabled';`  
  Rehearsal may be `true` (banner visible). That is **not** public launch.

### Env keys (Vercel → `maanta-nuia` → Production)

- [ ] **Clerk:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` **and** `CLERK_SECRET_KEY`
  for instance `cheerful-sailfish-3`. Both required. Save → **Redeploy**.
  Publishable alone → browser “Invalid host”.
- [ ] **W3W:** `W3W_API_KEY` set (onboard location validation fails closed if empty).
- [ ] **Stripe:** sandbox (or intentional live) keys for `/merchant/topup`.
  Treat **Pay with card** as Phase 1. M-Pesa STK only if IntaSend is configured
  (UI says so when off).

### Optional Playwright confidence (GitHub Actions or local — never prod)

- [ ] Secrets: `E2E_BASE_URL` (non-prod URL only), `E2E_SHOPPER_*`,
  `E2E_MERCHANT_*`, optional `E2E_ADMIN_*`. See `docs/ops/e2e-golden-path.md`.

### Accounts / browser

- [ ] **Auth works** in a real browser for admin + merchant + shopper; shopper
  phone verified (claim gate).
- [ ] **Accounts:** rehearsal set in `docs/ops/test-accounts.md` /
  `docs/maanta-node0-rehearsal-checklist.md` **or** a fresh pending merchant.
- [ ] **Sessions:** one normal window + incognito (or two phones) so roles do
  not evict each other.
- [ ] **Node cookie:** feed scoped to **BBS Mall** (`maanta_node`).
- [ ] **Prefs spot-check:** `/you/notifications` has toggles; `/notifications`
  is inbox + “Manage alert preferences” only.

---

## 1. Path to walk (critical journey)

### A. Public → merchant acquisition

1. Open `/` → **List your shop** → `/for-merchants`.  
   **Success:** opening credit (KES 300 / first 100) + Elite trial first-100 +
   KES 30 fee still applies are visible.
2. CTA → `/merchants` → enter shop name (+ phone optional) → **Get started**.  
   **Success:** lands on login with `next=/merchant/onboard?shop=…`.
3. Sign in as a **new** merchant user → onboard wizard.  
   **Success:** shop name is **prefilled** from `?shop=`. Complete business →
   w3w → floor → wallet → review → submit. Status becomes **pending**.  
   (Alias `/merchant/onboarding` also works.)

### B. Admin approval + Elite trial

4. Admin → `/admin/merchants` → open the pending shop.  
   **Success:** detail shows Standard/Elite chip; if already trial-bearing from
   seed, trial/grace line is visible.
5. Read the **Elite trial launch offer: N of 100 slots left** line (also on
   `/admin/billing`).  
   **Success:** matches `elite_trial_cap_status()` from step 0.
6. Tick **Grant Elite trial (30 days)** only if slots remain; confirm approve.  
   **Success:** an **InlineAlert notice** appears:
   - granted → “Shop approved with a 30-day Elite trial.”
   - cap full → “Shop approved on Standard — … fully claimed.”
   - unknown → “could not confirm… check the shop's plan”
7. Refresh/detail: status **active**, trial line present if granted, wallet
   shows **KES 300** opening credit when still inside Node-0 window/cap
   (first pending→active only).

### C. First deal → shopper claim → verify

8. Merchant → create a deal at `/merchant/deals/new` (image required;
   Standard = 1 active, Elite = 2).  
   **Success:** deal live on BBS feed. Zero balance blocks **new** deals only.
   Do **not** pause the deal mid-claim test — paused deals correctly reject new claims.
9. Shopper (phone verified) → `/feed` → open deal → claim → 6-digit ticket.  
   **Success:** ticket under `/tickets/[id]` (list is **Deals** → `/my-deals`
   or alias `/tickets`). Second claim on same deal blocked.
10. Merchant → `/merchant/redeem` → enter code → read fee disclosure →
    **Confirm redemption**.  
    **Success:** “Verified” / “Redeemed” + **Collect from shopper KES N** + wallet −30
    (or arrears if balance &lt; 30). Ledger row under `/merchant/wallet`.  
    Location mismatch: **Confirm** = verify-anyway (fee taken, dispute to admin);
    **Reject** = no fee.

### D. Operator observability

11. Admin → `/admin/redemptions` (and detail) — redemption visible.  
12. Admin → `/admin/billing` — merchant appears under trial/elite/standard as
    expected; cap line still honest.
13. Optional top-up rehearsal: `/merchant/topup` → **Pay with card** (Stripe
    sandbox). Do not treat STK as required.

---

## 2. If it fails — where to look

| Symptom | Inspect |
|---|---|
| Approve succeeds but no trial | Cap line / `elite_trial_cap_status()`; notice should say Standard |
| No opening credit | Already active? Off BBS? Cap / launch window exhausted? Ledger `node0_opening_credit` |
| Onboard shop name empty | URL must keep `?shop=` through login `next=` |
| Claim blocked | Shopper phone verification; deal paused/expired; wrong mall cookie |
| Claim on paused deal succeeds | Migration `20260730180000` missing on target DB |
| Verify fails | Wrong OTP; already verified; merchant not owner/staff / `can_verify` |
| Fee not debited | Check arrears path (wallet &lt; 30); `success_fee_charged` must be 30 |
| Empty feed | `maanta_node` cookie; demo filter; service_role grants on local only |
| STK top-up fails | Expected if IntaSend unset — use **Pay with card** |

---

## 3. Do **not** confuse with public launch

- Seeded merchants/deals ≠ organic traction.
- Demo banner ON ≠ launch.
- Stripe **sandbox** top-ups ≠ live money.
- IntaSend may be unconfigured — do not treat STK as required for this E2E.
- Playwright `E2E_BASE_URL` must **never** point at production (charges real KES 30).
- Elite trial cap backfill may already count historical trials — that is correct.
- Agent / founder reports / contact form are **out of scope** for the first run.

---

## 4. Sign-off box

| Check | Pass? | Notes |
|---|---|---|
| Acquisition → onboard (shop prefilled) | | |
| Admin approve + honest trial notice | | |
| Cap line matches SQL | | |
| Opening credit (if eligible) | | |
| Deal create | | |
| Claim → verify → fee/arrears | | |
| Location mismatch Confirm vs Reject understood | | |
| Top-up uses card Phase 1 (if exercised) | | |
| Admin can see redemption + plan | | |

**Session date:** ________  
**Environment:** prod / other: ________  
**Cap remaining at start:** ________
