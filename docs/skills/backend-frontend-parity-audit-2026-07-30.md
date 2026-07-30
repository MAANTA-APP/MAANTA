# Backend–frontend–wireframe parity audit (2026-07-30)

**Mode:** Reviewer → Builder · **Branch:** `cursor/backend-frontend-parity-audit-f630`  
**Method:** Verification-first. Notion product decisions > repo runtime > design
current-reality inventory > sync docs > this prompt.

## Verdict

> Does MAANTA’s backend actually support what the current frontend and
> wireframes are telling users and operators?

**Yes for the critical money path** (claim → phone gate → ticket+15m grace →
till resolve→charge KES 30 → verify-anyway / arrears → wallet settle), with
honest role gates. **Several UI/copy/route drifts were real** and are fixed or
classified below. **`maanta-app/design/current-reality/` did not exist** before
this run — it is now the design-side inventory (`frames.json`).

Baseline: prior truth audit + E2E surface matrix (same day) were used as
hypotheses only; every claim was re-checked in code/SQL.

---

## What is in sync

| Domain | Proven |
|---|---|
| YOU PAY | `youPay()` + SQL `you_pay_kes` + redemption `amount_kes` snapshot |
| Phone at claim | API `phone_required` + `/verify-phone` under Clerk; rehearsal bypass under Supabase auth |
| Feed lock order | `DEFAULT_FEED_SORT = featured`; Flash / boost / verified-count rails in `getLiveDeals` |
| Ticket grace | `expires_at = deal.expires_at + 15 minutes`; verify rejects after |
| Redeem fee timing | Preflight then Confirm; fee disclosure before charge |
| Staff `can_verify` | UI gate + API `requireMerchant("can_verify")` |
| Wallet / arrears | Verify-anyway; top-up settles arrears first |
| Top-up rails | Stripe Phase 1 primary CTA; STK secondary if IntaSend configured (matches Notion) |
| Elite trial | Optional at approve; first-100 BBS cap in SQL; UI shows outcome + billing cap line |
| Fee reverse | Note required + `fee_reversals` audit |
| Roles | Middleware session-only; layouts enforce admin/agent/merchant/founder≡admin |
| Onboard alias | `/merchant/onboarding` → `/merchant/onboard` with query preserved |
| Tickets list | `/tickets` → `/my-deals`; detail `/tickets/[id]` |

---

## What was out of sync (and fixed this run)

| ID | Drift | Fix |
|---|---|---|
| P1 | Merchant copy “paused — hidden from the feed” but `getLiveDeals` did not filter `is_paused`; detail Claim ignored pause; `deals_public_browse` also omitted pause | Feed/browse/map filter `is_paused=false`; SQL view `is_paused IS NOT TRUE` (`190000`); detail CTA “Deal paused by merchant”; claim API `code: deal_paused` |
| P2 | `isDealClaimable` true during grace; SQL `claim_deal` rejects new claims after deal end | Claimable = **live only**; `isDealInRedemptionWindow` for merchant till list |
| P3 | Alerts “Top up to verify” / “N can be verified” contradicted verify-anyway | Alerts copy discloses arrears path + new-deal gate only |
| P4 | Admin deals reason pills (`misleading`/`prohibited`) did not filter | Removed cosmetic filters; honest “report-reason filters not live” note |
| P5 | Inventory `/otp`, `/founder/reports` missing | Aliases → `/verify-phone`, `/admin/reports` |
| P6 | No `design/current-reality/` | Added `frames.json` + README |
| P7 | Rehearsal seed comment claimed “balance too low gate (10m)” | Corrected to verify-anyway / arrears |

---

## What remains design-ahead / product decision / env-blocked

See `docs/skills/parity-drift-register-2026-07-30.md`.

Highlights:

- **Feed marketing titles** ≠ Notion locked section names — behavior synced; naming is a product call (keep marketing vs rename to Flash / Priority Placements / All Active Deals).
- **`/map` as first-class nav** — code has it; Notion do-not-build says “Map view in the customer feed” (map *inside* feed). Separate `/map` is live; do not claim `/map` redirects to `/browse` (false).
- **`/contact`** — UI-only fake success.
- **Admin deal report taxonomy** — still no shopper report source.
- **Agent “attribution window”** — 48h is lead lock only; no commission clock in code.
- **Env/ops:** Clerk keys for interactive browser; apply 07-30 migrations on hosted DB if not yet; IntaSend for STK; Playwright E2E suite remains opt-in/inert without secrets.

---

## Artifacts

| Deliverable | Path |
|---|---|
| This report | `docs/skills/backend-frontend-parity-audit-2026-07-30.md` |
| Surface matrix | `docs/skills/parity-surface-matrix-2026-07-30.md` |
| Drift register | `docs/skills/parity-drift-register-2026-07-30.md` |
| Founder handoff | `docs/ops/founder-parity-handoff-2026-07-30.md` |
| Design inventory | `maanta-app/design/current-reality/` |

## Tests proving parity

- `deal-expiry.test.ts` — claimable live-only; redemption window includes grace
- `merchant-lifecycle.test.ts` — shopper-visible count excludes grace-only
- `get-live-deals.test.ts` — paused deals excluded from rails
- Existing: claim pause SQL (`claim_deal_pause_gate_test.sql`), locked feed order, phone gate API tests
