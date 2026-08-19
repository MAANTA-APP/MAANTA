# Skills: Repo + branch audit (2026-07-30)

Last updated: 2026-07-30 (consolidation follow-up) · Status: **complete** (no deletes performed).

## Main / production

| Check | Result |
|---|---|
| `origin/main` tip | `4f418755` at audit time — Browse/Map separation, seeded deals visible post-login (#113). Now `7f97afc` (#147, this audit itself). A recorded tip is a timestamp, not a live value; re-read it rather than trusting this line |
| Production Vercel | Same SHA (`maanta-nuia` production READY) |
| `npm run build` | Pass (Next 14.2.35); Edge Runtime warning from `@supabase/ssr` in middleware only |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| Code fixes on main (first pass) | **None required** — main was already healthy |
| Consolidation follow-up | Pause-gate renumber + prefs canonicalization land via `cursor/branch-audit-consolidation-4b4b` |

No production tag exists; production tracks `main` via Vercel.

---

## Consolidation follow-up (this pass)

### 1. Migration collision — resolved on the consolidation branch

**Problem:** `main` shipped `20260730160000_restore_claim_deal_pause_gate.sql`, but production’s ledger already holds version `20260730160000` for the success-fee **notes** migration (repo file `20260730120000_…`). `db push` matches version alone → pause gate was silently skipped.

**Fix (on consolidation branch → merge to main first):**

| Version | Intent |
|---|---|
| `120000` | notes (repo filename; prod may already hold same content as `160000`) |
| `130000`–`150000` | elite cap / trial sentinel / demo wipe |
| `160000` | **RESERVED** — production notes ledger alias; no new files |
| `170000` | reserved for `#143` `node_scoped_opening_credit_cap_reland` |
| `180000` | **`restore_claim_deal_pause_gate`** (renumbered from `160000`) |

Documented in `docs/ops/supabase-migrations.md` (“Versioning rule”). Refs/tests updated.

**Landing order for open PRs:**

1. Land consolidation (this renumber) on `main` first.
2. ~~`#137` (truth-audit): drop/replace its `170000` pause-gate file with main's `180000`.~~ **Already done — do not re-do it.** As of `252f679` the truth-audit branch carries `20260730180000_restore_claim_deal_pause_gate.sql` and no `170000` file at all. Following the original step now would mean hunting for a file that does not exist, or re-adding one. Verify before acting: `ls maanta-app/supabase/migrations/ | grep pause_gate` must return exactly one file, `20260730180000_…`.
3. `#143` (pilot): already uses `180000` pause + `170000` opening-credit — aligns with the map above.

**Invariant, whatever the landing order:** exactly one `*_restore_claim_deal_pause_gate.sql` exists, and its version is above every version in production's ledger (currently max `20260730160000`). Two pause-gate files, or one at or below the ledger max, both reproduce the original silent-skip. Tracked as **D24**/**D25**.

### 2. Avatars + notification prefs — canonical surface

**Decision:** prefs live only at **`/you/notifications`** (wireframe You).

| Route | Role |
|---|---|
| `/you/notifications` | Canonical toggles |
| `/you` | Avatar + settings; row → `/you/notifications` |
| `/notifications` | Inbox only + link to prefs (no nested toggles) |
| `/notifications/preferences` | Redirect → `/you/notifications` |
| `/profile` | Redirect → `/you` |

Skill: `docs/skills/notification-prefs-canonical-2026-07-30.md`.  
`#94` should remove the nested prefs panel from `/notifications` (same decision).

### 3. Role-hardening D-12 vs first-100 Elite trial — aligned rule

**Actual trial rule (main, governed):**

- First **100 BBS Mall** merchants get a **30-day Elite trial**.
- KES 30 success fee still applies during the trial.
- After 30 days → 7-day grace → auto-downgrade to Standard if no paid conversion.
- Enforced in DB via `elite_trial_cap_status()` / `activate_merchant` + admin UI.

**D-12 (still closed):** withdrew the **ungoverned** copy “Launch offer: first month of Elite **free**” (no cap, no node, implied fee waiver). That wording must not return.

**Copy/guard alignment:** public `/pricing` may advertise the governed first-100 trial. Cash-only tests block only ungoverned “free month” phrasing — not the governed trial line. `#131` already carries this after the prior main merge. **Corrected 2026-08-19 (drift D31):** an earlier version of this line instructed readers to *reinterpret* documents still saying “launch offer removed entirely” — instructing reinterpretation rather than correcting is the failure the drift register exists to end. The position, stated once: **only the ungoverned free-month wording was withdrawn (D4/D7); the governed first-100 trial stands.** The single authoritative source for the offer is `maanta-app/src/lib/marketing/facts.ts` (`OFFERS.eliteTrial`) plus the decisions-log launch-offer entry — any document that disagrees is wrong and should be corrected against those, not reinterpreted. A sweep on 2026-08-19 found no other live document carrying the “removed entirely” claim; this instruction was the last surviving artifact of it.

---

## Active branches synced with main (first audit pass)

Repo convention is merge commits (`Merge origin/main into …`), not rebase.

| Branch | Open PR | Conflicts / notes | Health after sync |
|---|---|---|---|
| `cursor/avatars-notif-seed-7f6b` | #94 | Avatar on `/you`; must drop nested inbox prefs (see consolidation) | typecheck+lint pass |
| `claude/truth-audit-sync-ye29ti` | #137 | Align pause-gate to `180000` after consolidation lands | typecheck+lint pass |
| `claude/maanta-pilot-sequencing-uz6ac1` | #143 | Already `180000` pause + `170000` opening-credit | typecheck+lint pass |
| `cursor/prod-hardening-2026-07-ae69` | #121 (draft) | supabase auth defaults preferred | typecheck+lint pass |
| `posthog/instrumentation-8af2c1` | #142 (draft) | Clean | typecheck+lint pass |
| `claude/maanta-ui-frames-scq4w1` | #132 | Design-truth frames; main topup preferred | typecheck+lint pass |
| `claude/maanta-role-hardening-62ut64` | #131 | D-12 free-month guard + main first-100 trial copy | typecheck+lint pass |

---

## Classification snapshot (re-verified consolidation pass)

- Remote branches (excl. main): **~130**
- Fully merged (0 unique commits vs main): **~40** → safe delete candidates
- Open PRs: **23** (includes audit #147; many stale drafts >70 commits behind)

### Fully merged — safe to delete

`claude/admin-fee-reversal-wallet-ipevkg`, `claude/boost-elite-only-gate-713pmt`, `claude/clerk-auth-setup-gdz3b7`, `claude/demo-mode-node0-rt4bfy`, `claude/demo-seed-refresh-cron`, `claude/demo-shoppers-pool`, `claude/demo-wipe-audit-retention`, `claude/fee-reversal-agent-attribution-3ks0pe`, `claude/fee-reversals-agent-auth-xf0zz8`, `claude/flagged-redemption-sla-copy-fnto6t`, `claude/guardian-fraud-checks-anzikj`, `claude/maanta-audit-f37ti0`, `claude/maanta-docs-consolidated`, `claude/maanta-feature-gaps-a2-a3-g4-lqqkq2`, `claude/maanta-frozen-ui-shopper-nppq4b`, `claude/maanta-general-audit-o5zjh4`, `claude/maanta-launch-audit-hn5qne`, `claude/maanta-launch-fixes`, `claude/maanta-launch-readiness-5qpqup`, `claude/maanta-production-rollout-ibsgz0`, `claude/maanta-ui-polish-0sricr`, `claude/maanta-waitlist-system-27ql6a`, `claude/maanta-wireframe-ui`, `claude/maanta-worldwide-payments-oaj920`, `claude/merchant-fee-reference-link`, `claude/merchant-frozen-ui-l5-l10-fix`, `claude/merchant-frozen-ui-m4-m6-tablet`, `claude/node0-opening-credit-o03j89`, `cursor/admin-ops-audit-3316`, `cursor/audit-summary-doc-3316`, `cursor/fix-capture-lead-3316`, `cursor/post-merge-ops-doc-3316`, `cursor/prod-handoff-doc-3316`, `cursor/revoke-authenticated-core-writes-3316`, `cursor/security-audit-fixes-3316`, `cursor/security-audit-h-fixes-3316`, `cursor/security-fixes-3316`, `docs/post-merge-main-sync-2026-07-24`, `maanta-launch-audit-canonical`, `posthog/instrumentation-6b911f`

### Abandoned / superseded — close PR + delete

| Branch / PR | Why |
|---|---|
| `cursor/setup-dev-environment-{0bf5,7fba,3d65,adbd}` (#67/#86/#89) | Superseded by `AGENTS.md` on main |
| `cursor/seed-feed-deals-c0f8` (#84), `cursor/seed-100-deals-7f6b` | Superseded by node0 seed on main |
| `posthog/instrumentation-2a564a` (#56) | Superseded by #142 / PostHog on main |
| `cursor/clerk-health-check-c0f8` (#80), `cursor/fix-sign-in-clerk-nav-c0f8` (#83) | Stale; auth defaults to Supabase on main |
| `cursor/prod-ui-deploy-verify-dce0` (#76) | Stale draft; Frozen UI shipped |
| `vercel/install-vercel-web-analytics-*` (#97) | Wrong base; analytics handled elsewhere |
| Squash-merge residue (`cursor/browse-map-seed-visibility-909e`, `cursor/live-pilot-readiness-3667`, `cursor/supabase-auth-default-909e`, `cursor/backend-frontend-parity-audit-f630`, `cursor/e2e-*`, …) | PR already merged — delete after confirming no follow-up PR |

### Do not delete until landed

| Branch | Caveat |
|---|---|
| `cursor/branch-audit-consolidation-4b4b` | Pause-gate renumber + prefs canonicalization — land before #137/#143 |
| `claude/truth-audit-sync-ye29ti` (#137) | Keep until pause-gate aligned to `180000` and PR merged/closed |
| `claude/maanta-pilot-sequencing-uz6ac1` (#143) | Keep until opening-credit `170000` + pause `180000` land |
| `cursor/avatars-notif-seed-7f6b` (#94) | Keep until avatars + prefs cleanup merge |
| `claude/maanta-role-hardening-62ut64` (#131) | Keep until design-truth + role work merge |
| `claude/maanta-ui-frames-scq4w1` (#132) | Overlaps #131 design contract — coordinate |
| Active drafts #121 / #142 | Optional; not blockers for deletion of the fully-merged list |

## Operator follow-ups (human)

1. Merge consolidation branch (pause-gate `180000` + prefs canonicalization) to `main` first.
2. **Merge** `main` into #137/#143/#94 (`git merge origin/main`, resolve, push normally) — do not rebase. These are shared Claude/Cursor branches, so a rebase rewrites history that others hold, and the only way to push it is the force-push step 5 forbids. Merging is also the repo convention stated above. Then confirm exactly one pause-gate file remains: `ls maanta-app/supabase/migrations/ | grep pause_gate` → `20260730180000_…` only.
3. Delete the fully-merged list above.
4. Close stale open PRs in the abandoned table.
5. Do **not** force-push rebased history onto shared Claude/Cursor branches without owner OK.

### Flagged product tensions (do not silently overwrite)

1. **Migration ledger collision on main:** `20260730160000_restore_claim_deal_pause_gate.sql` on main collides with production's ledger entry for success-fee notes at the same version (see #137 / #143). Both the pilot branch and the truth-audit branch now use `180000` for the pause gate — truth-audit briefly used `170000`, which is reserved for the `node_scoped_opening_credit_cap` reland. Landing either still needs the renumber to reach `main`. Tracked as **D24**/**D25**.
2. **Avatars vs `/you`:** Avatar profile UI now loads on `/you`; `/profile` stays a redirect. Nested prefs remain on `/notifications` while wireframe prefs also live at `/you/notifications`.
3. **Role-hardening D-12 vs main launch offer:** Branch withdrew ungoverned "Elite free month"; main advertises first-100 Elite trial (DB-backed). Sync kept main's trial copy and narrowed the guardrail test.

