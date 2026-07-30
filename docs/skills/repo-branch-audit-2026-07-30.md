# Skills: Repo + branch audit (2026-07-30)

Last updated: 2026-07-30 · Status: **complete** (no deletes performed).

## Main / production

| Check | Result |
|---|---|
| `origin/main` tip | `4f418755` — Browse/Map separation, seeded deals visible post-login (#113) |
| Production Vercel | Same SHA (`maanta-nuia` production READY) |
| `npm run build` | Pass (Next 14.2.35); Edge Runtime warning from `@supabase/ssr` in middleware only |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| Code fixes on main | **None required** — main was already healthy |

No production tag exists; production tracks `main` via Vercel.

## Active branches synced with main (merge)

Repo convention is merge commits (`Merge origin/main into …`), not rebase.

| Branch | Open PR | Conflicts / notes | Health after sync |
|---|---|---|---|
| `cursor/avatars-notif-seed-7f6b` | #94 | Kept nested prefs on `/notifications`; preferred main `/you` + `/you/notifications` redirects. Unioned `avatar_url` with `grace_period_ends_at` / `onboarded_at`. Wired `avatarUrl` into `/you`. | typecheck+lint pass |
| `claude/truth-audit-sync-ye29ti` | #137 | Clean merge | typecheck+lint pass |
| `claude/maanta-pilot-sequencing-uz6ac1` | #143 | Docs union; **renumbered** main's pause-gate migration `20260730160000` → `20260730180000` to avoid collision with this branch's production-aligned notes migration at `160000` | typecheck+lint pass |
| `cursor/prod-hardening-2026-07-ae69` | #121 (draft) | Docs/index union; **preferred main supabase auth defaults** in `.env.example` (branch had `clerk`) | typecheck+lint pass |
| `posthog/instrumentation-8af2c1` | #142 (draft) | Clean merge | typecheck+lint pass |
| `claude/maanta-ui-frames-scq4w1` | #132 | Kept design-truth frames; **preferred main topup** (card primary / STK gated); kept R-PLAN-NAMES Standard pricing | typecheck+lint pass |
| `claude/maanta-role-hardening-62ut64` | #131 | Kept design contract; preferred main money/permission surfaces; kept main first-100 Elite trial copy (DB-backed); narrowed cash-only test to still block ungoverned "free month" (D-12) | typecheck+lint pass |

### Flagged product tensions (do not silently overwrite)

1. **Migration ledger collision on main:** `20260730160000_restore_claim_deal_pause_gate.sql` on main collides with production's ledger entry for success-fee notes at the same version (see #137 / #143). Pilot branch uses `180000` for the pause gate after sync; truth-audit uses `170000`. Landing either needs a coordinated renumber on main.
2. **Avatars vs `/you`:** Avatar profile UI now loads on `/you`; `/profile` stays a redirect. Nested prefs remain on `/notifications` while wireframe prefs also live at `/you/notifications`.
3. **Role-hardening D-12 vs main launch offer:** Branch withdrew ungoverned "Elite free month"; main advertises first-100 Elite trial (DB-backed). Sync kept main's trial copy and narrowed the guardrail test.

## Classification snapshot

- Remote branches (excl. main): **~130**
- Fully merged (0 unique commits vs main): **~40** → safe delete candidates
- Open PRs: **22** (many stale drafts >70 commits behind)

### Safe to delete (fully merged — ancestry clean)

`claude/admin-fee-reversal-wallet-ipevkg`, `claude/boost-elite-only-gate-713pmt`, `claude/clerk-auth-setup-gdz3b7`, `claude/demo-mode-node0-rt4bfy`, `claude/demo-seed-refresh-cron`, `claude/demo-shoppers-pool`, `claude/demo-wipe-audit-retention`, `claude/fee-reversal-agent-attribution-3ks0pe`, `claude/fee-reversals-agent-auth-xf0zz8`, `claude/flagged-redemption-sla-copy-fnto6t`, `claude/guardian-fraud-checks-anzikj`, `claude/maanta-audit-f37ti0`, `claude/maanta-docs-consolidated`, `claude/maanta-feature-gaps-a2-a3-g4-lqqkq2`, `claude/maanta-frozen-ui-shopper-nppq4b`, `claude/maanta-general-audit-o5zjh4`, `claude/maanta-launch-audit-hn5qne`, `claude/maanta-launch-fixes`, `claude/maanta-launch-readiness-5qpqup`, `claude/maanta-production-rollout-ibsgz0`, `claude/maanta-ui-polish-0sricr`, `claude/maanta-waitlist-system-27ql6a`, `claude/maanta-wireframe-ui`, `claude/maanta-worldwide-payments-oaj920`, `claude/merchant-fee-reference-link`, `claude/merchant-frozen-ui-l5-l10-fix`, `claude/merchant-frozen-ui-m4-m6-tablet`, `claude/node0-opening-credit-o03j89`, `cursor/admin-ops-audit-3316`, `cursor/audit-summary-doc-3316`, `cursor/fix-capture-lead-3316`, `cursor/post-merge-ops-doc-3316`, `cursor/prod-handoff-doc-3316`, `cursor/revoke-authenticated-core-writes-3316`, `cursor/security-audit-fixes-3316`, `cursor/security-audit-h-fixes-3316`, `cursor/security-fixes-3316`, `docs/post-merge-main-sync-2026-07-24`, `maanta-launch-audit-canonical`, `posthog/instrumentation-6b911f`

### Abandoned / superseded (recommend close PR + delete; not fully merged by SHA)

| Branch / PR | Why |
|---|---|
| `cursor/setup-dev-environment-{0bf5,7fba,3d65,adbd}` (#67/#86/#89) | Superseded by `AGENTS.md` already on main |
| `cursor/seed-feed-deals-c0f8` (#84), `cursor/seed-100-deals-7f6b` | Superseded by node0 seed on main |
| `posthog/instrumentation-2a564a` (#56) | Superseded by #142 / PostHog already on main |
| `cursor/clerk-health-check-c0f8` (#80), `cursor/fix-sign-in-clerk-nav-c0f8` (#83) | Stale; auth strategy now defaults to Supabase on main |
| `cursor/prod-ui-deploy-verify-dce0` (#76) | Stale draft; Frozen UI already shipped |
| `vercel/install-vercel-web-analytics-*` (#97) | Wrong base branch; analytics already handled elsewhere |
| Squash-merged residue still "ahead" (`cursor/browse-map-seed-visibility-909e`, `cursor/live-pilot-readiness-3667`, `cursor/supabase-auth-default-909e`, `cursor/backend-frontend-parity-audit-f630`, `cursor/e2e-*`, etc.) | PR merged; branch tip still has unique commits — safe to delete after confirming no follow-up PR |

## Operator follow-ups (human)

1. Delete the fully-merged list above when ready.
2. Close stale open PRs in the abandoned table.
3. Coordinate pause-gate migration renumber before merging #137 or #143 into main.
4. Do **not** force-push rebased history onto shared Claude/Cursor branches without owner OK (this audit used merges).
