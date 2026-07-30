# Truth audit — code ↔ repo mirror ↔ Notion (2026-07-30)

Mode: **Reviewer**. Scope: pricing & plans, roles & permissions, payment/trial
flows, critical flows, feature flags. Reality-first — the code, migrations and
live `app_config` were read before any doc was trusted.

Baseline before changes: 45 test files / 301 tests passing.
After changes: 46 test files / 307 tests passing.

---

## 0. A structural note about this repo's "design-truth mirror"

The audit prompt assumed a mirror made of `frames.json`, rule records (`R-xxxx`)
and drift rows (`D-xx`). **None of those exist in this repository** — there is no
frames file, no rule registry and no drift table, and nothing references them.

What plays that role here instead:

| Prompt's artifact | This repo's equivalent |
|---|---|
| `frames.json` | `docs/skills/frozen-ui-overall-handoff.md` + `maanta-app/design/` (wireframe HTML + `Maanta_Wireframe_System.pdf`) |
| Rule records `R-xxxx` | "Frozen business rules" in `CLAUDE.md`, mirrored from the Notion **Frozen Scope & Rules** page |
| Drift rows `D-xx` | Ad-hoc audit docs under `docs/skills/*-audit-*.md` — no persistent open/closed drift register |
| Decisions log | `docs/maanta-decisions-log.md` |
| Corrections log | Did not exist. **This file is it.** |

Consequence worth naming: because drift is recorded in dated audit documents
rather than a register with open/closed state, a finding raised in one audit can
be silently re-raised or forgotten in the next. Two of the findings below
(F4, F6) are exactly that failure mode — resolved in a previous audit, still
described as unresolved in code. See follow-up FU-1.

---

## 1. Corrections applied

| # | Domain | Contract claimed | Code/DB showed | Verdict | Action |
|---|---|---|---|---|---|
| F1 | Pricing | Notion frozen rule: launch offer = "First 100 BBS Mall merchants get 30-day free Elite trial"; Product Brief adds "KES 30 success fee still applies" | `/pricing` promised "Launch offer: first month of Elite free" — no cap, no node scope, no fee caveat | **Code was the outlier** (copy overstated a frozen, bounded promo) | Rewrote `/pricing` and the `/for-merchants` Elite bullet to state cap + node + fee caveat |
| F2 | Pricing | Elite price review = **Feb 2027** (founder ruling 2026-07-20), decisions log at `docs/maanta-decisions-log.md` | Live `app_config.success_fee_kes.notes` said "**Oct 2026** review" and pointed at `PROJECT_RULES.md` / `DECISIONS_LOG.md`, **neither of which exists** | **DB metadata was stale** | Migration `20260730120000_correct_success_fee_config_notes.sql` (metadata only) |
| F3 | Pricing | Plan names are Standard and Elite, "never Free"; forbidden term "free plan" | `/pricing` and `/for-merchants` printed **"Free"** as Standard's headline price | **Code was the outlier** | Both now read "No monthly fee" |
| F4 | Trials | 30-day Elite trial is frozen; the 2026-07-29 full-state audit already ruled wireframe 11j's "14 days" stale | `approve/route.ts` still carried "wireframe 11j says 14 days — flagged as an **open** spec/DB conflict" | **Comment was stale** | Comment rewritten to record the resolution |
| F5 | Pricing | Success fee must never be hardcoded (`getSuccessFee()` is canonical) | `30` was an independent literal in `/for-merchants` (`SUCCESS_FEE = 30`), `/pricing` (twice), and `data.ts`'s fallback | **Drift risk, no live mismatch** | Single-sourced as `SUCCESS_FEE_KES` in `src/lib/pricing.ts`; all three now import it |
| F6 | Mirror | Notion carries the launch offer as a **frozen rule** | `docs/maanta-decisions-log.md` referenced "the free Elite trial" in passing but never recorded its terms or cap | **Mirror gap** | Entry added to the decisions log |

## 2. Verified aligned (no action)

Checked against migrations and live `app_config`, all three sources agree:

- **Success fee** KES 30, all plans, at verification — `app_config.success_fee_kes = 30.00`,
  forced on every deal write by `enforce_deal_success_fee()`, amount-bound in
  `deduct_success_fee_or_record_arrears()`.
- **Deal limits** Standard 1 / Elite 2, flash Elite-only — `enforce_deal_limit()`.
- **Boost** KES 500 / 24h, Elite-only — `app_config.boost_fee_kes = 500`,
  `20260715194145_boost_elite_only_gate.sql`.
- **Zero-balance gate** blocks new deals only, running deals keep redeeming —
  `20260703190627_zero_balance_gate_deals.sql`.
- **Verify-anyway** redemption succeeds regardless of balance; shortfall becomes
  arrears — `20260630232014_arrears_support.sql`.
- **Standard expiry** 24h fixed; **flash** default 6h, CHECK 1–24 — `set_deal_expiry()`.
- **Deal image** required — `deals.image_url TEXT NOT NULL`.
- **Archive** last 5 expired per merchant — `archive_expired_deal()`.
- **Wallet top-up target** KES 3,000 — `/merchant/topup` default.
- **Node 0 opening credit** KES 300, first 100, BBS Mall, inside launch window —
  fully config-driven and **enforced**, unlike the Elite trial cap (see D2).
- **Roles** `docs/skills/role-permissions.md` matches code exactly: the
  `users.role` CHECK, `requireAdminPage/Api`, `requireFounderPage/Api` (admin),
  `getMerchantContext`, agent layout (`agent` + `admin`).
- **"Deals near me"** is honestly labelled — the rail subtitle says "Standard
  deals at your mall", so the node-scoped (not GPS-proximity) behaviour is
  disclosed on the same screen. `LocationPill` shows the selected mall, not a
  claimed GPS fix.

## 3. Open decisions — NOT actioned, founder call required

These touch money paths and paid entitlements, so per the audit's own rules they
are surfaced rather than silently changed.

### D1 — The feed's default sort overrides the locked feed structure

Notion **Frozen Scope & Rules → Feed structure (locked)** specifies:

| Section | Locked sort |
|---|---|
| 1 Flash | soonest expiry first |
| 2 Priority Placements (boosted) | most recently boosted first |
| 3 All Active Deals | all-time verified redemptions descending |

`src/app/(shopper)/feed/page.tsx:73` defaults `sort` to `"nearest"`, and
`sortDealRows()` then re-sorts **all three rails** by distance. `getLiveDeals()`
does compute the verified-redemption ordering for section 3 — and it is then
discarded by the re-sort.

Why this is a decision and not a bug fix:

- **Boost is a paid entitlement** (KES 500 / 24h). An Elite merchant buying
  placement is buying an ordering the feed does not currently deliver.
- The distance origin is `nodeCoords(node)` — the **mall centroid**, not the
  shopper. Within a single mall the resulting order is close to arbitrary, so
  the locked sorts are being displaced by something that carries little signal.
- Ranking by all-time verified redemptions is the stated merchant incentive in
  the Notion overview ("merchants are ranked by all-time verified redemptions").

Options: (a) default the feed to the locked sorts and keep "Nearest" as an
explicit opt-in; (b) amend the frozen feed rule to record that shopper-chosen
sort outranks it. Either way it needs a decisions-log entry.

### D2 — The first-100 cap on the Elite trial is unenforced

The frozen offer is capped at 100 BBS Mall merchants. In code the trial is an
**admin opt-in per approval** (`grantEliteTrial` on `/api/admin/merchants/[id]/approve`,
or `grant-trial` on `/api/admin/plans/[id]`). There is **no counter, no cap and
no node check** anywhere — no `app_config` key equivalent to
`node0_opening_credit_merchant_cap`, which does exactly this job for the KES 300
credit.

So the cap currently rests on admin discipline. Options: (a) add
`elite_trial_merchant_cap` + a node check inside `activate_merchant`, mirroring
the opening-credit pattern; (b) rule that the offer is discretionary and adjust
the frozen rule's wording. Copy has been corrected to state the cap either way —
**if (b) is chosen, the copy must change again**, because it now advertises a
bound the product does not enforce.

## 4. Guardrails added

`src/lib/__tests__/pricing-copy.test.ts` (6 tests). Verified as a real ratchet:
reverting `/pricing` to its pre-audit content fails 3 of the 6.

| Invariant | Prevents |
|---|---|
| Every per-redemption fee in public copy equals `SUCCESS_FEE_KES` | A fee change landing in `app_config` and some pages but not others |
| The fee is declared in exactly one module | New `const SUCCESS_FEE = 30` duplicates |
| No bare `>Free<` as a plan price | The banned "Free plan" claim returning with the noun dropped |
| Any page mentioning the Elite trial carries cap + node + fee caveat | An unbounded reading of a bounded promo |
| Named unbounded phrasings ("first month of Elite free", …) are banned | The exact regression this audit fixed |

Existing `frozen-ui-rules.test.ts` was left as-is; it covers design tokens and
the `free plan` term, and the new file covers the commercial claims.

## 5. Follow-ups

- **FU-1 (process).** There is no persistent drift register, which is why F4 and
  F6 were re-discoverable. Either adopt a `docs/drift-register.md` with
  open/closed rows and evidence links, or make each audit doc explicitly close
  the prior audit's rows by ID.
- **FU-2 (operator, human only).** `supabase/migrations/20260730120000_*.sql`
  needs pushing to `axrrslqssmbngbataejg`. Per `docs/ops/supabase-migrations.md`
  Claude Code does not run migrations — a human operator must. Metadata only;
  safe to batch with the next push.
- **FU-3.** `app_config.demo_mode_enabled` is **`true` on production right now**
  (correct for rehearsal; its own notes say "must be false at launch"). The
  paired `MAANTA_DEMO_MODE` Vercel var — which tags analytics and can drift from
  the DB switch — remains unverified from this environment, as already flagged in
  `docs/ops/optruth-demo-release-2026-07-29.md`.
- **FU-4.** `/pricing` hardcodes KES 3,500 with no `app_config` key behind it
  (unlike the success fee and boost fee). If the Feb 2027 review changes the
  price, the UI is the only place to edit. Consider an `elite_subscription_kes`
  key when subscription billing is wired to a processor.
- **FU-5 (Notion).** Notion was **read, not written** in this pass — every
  discrepancy resolved in Notion's favour, so nothing there needed correcting.
  The two Notion-side edits that D1/D2 would require are deliberately deferred
  until the founder rules on them.

## 6. Sign-off

- Code, repo mirror and Notion now agree on: the success fee, plan names and
  entitlements, deal limits, boost, expiry, archive, roles, the zero-balance
  gate, verify-anyway, and the launch offer's stated terms.
- Two mismatches remain, both explicitly tagged product decisions (D1, D2).
- No behavioural code change was made: the edits are public copy, one shared
  constant, one comment, one metadata migration, and new tests.
