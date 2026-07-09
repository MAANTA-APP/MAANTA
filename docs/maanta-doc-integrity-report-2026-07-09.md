# Documentation integrity report — 2026-07-09

Scope: resolve in-repo references to Notion-only documents so the repository is
self-describing for future contributors and cheaper models.

## Missing references found (full inventory)

Search: every `*.md` filename cited from `*.sql` / `*.ts` / `*.tsx` / `*.md`.

| Cited name | Cited from | Status after this session |
|---|---|---|
| `DECISIONS_LOG.md` | 8 migrations | ✅ Already mirrored (`docs/maanta-decisions-log.md`); mirror reconciled this session |
| `PROJECT_RULES.md` | migrations `20260702092952`, `20260702094145` | ✅ Fixed — exported to `docs/PROJECT_RULES.md` |
| `WALKTHROUGH.md` | migrations `20260702092952`, `20260702093134`, `20260702093258` | ✅ Fixed — exported to `docs/WALKTHROUGH.md` (Steps 5–6 canonical, others marked reconstructed) |
| `ARCHITECTURE.md` | migration `20260701125545` (5MB image rule) | ⚠️ Unresolved — Notion-only; logged as pending export |
| `SESSION_FRAMEWORK.md` | migration `20260702092952` ("Build session type") | ⚠️ Unresolved — Notion-only; logged as pending; overlaps `docs/maanta-claude-operating-system.md` role/session model |
| `legal/refund-and-wallet-policy.md` | `src/lib/currency.ts` | ✅ Exists (`maanta-app/legal/refund-and-wallet-policy.md`) — no action |

## Reconciliations (repo-grounded facts vs. older doc wording)

1. **3-state `feeChargeStatus` is a 2026-06-30 decision**, distinct from the
   2026-07-03 D-003 fraud-review-task decision. The decisions log previously
   conflated both under the 2026-07-03 verify-anyway row — now split into two
   dated rows, with the D-003 identifier and "confirmed by Mohamed Elmi" noted.
2. **`unknown` semantics tightened** in `docs/skills/redemption-disputes.md`:
   it means the fee step itself errored (fee-mechanism failure) and must never
   collapse into `owed` — previously paraphrased as "something unexpected".
3. **Onboarding third revision (2026-07-02)** added to the decisions log:
   merchant is always the authenticated submitter; agent is attribution only.
4. **`guardian_check` frozen decision** surfaced in the decisions log and
   PROJECT_RULES — referenced by migrations but undated; wording gap marked
   explicitly rather than invented.
5. **Citation resolution table** added to `CLAUDE.md` mapping Notion-era
   filenames to their repo locations.

## Gaps deliberately left open (not invented)

- Full Notion wording of PROJECT_RULES (any non-code-enforced rules) and
  WALKTHROUGH step numbering outside Steps 5–6.
- `ARCHITECTURE.md`, `SESSION_FRAMEWORK.md` exports.
- Date + wording of the guardian_check decision.

All three are queued in the decisions log's Pending table and in the
reconciliation checklist inside `docs/WALKTHROUGH.md`.

## Files changed this session

| File | Change |
|---|---|
| `docs/PROJECT_RULES.md` | **Added** — repo-native export, 15 rules, each with code anchor; gaps marked |
| `docs/WALKTHROUGH.md` | **Added** — repo-native export; Steps 5–6 canonical, 1–4/7 marked reconstructed |
| `docs/maanta-decisions-log.md` | Updated — two new dated rows, guardian_check row, citation-resolution note, three new pending items |
| `docs/skills/redemption-disputes.md` | Updated — precise `unknown` semantics, D-003, guardian_check note, canonical links |
| `docs/skills/payments-rails.md` | Updated — canonical link to PROJECT_RULES money rules |
| `CLAUDE.md` | Updated — exports added to required-docs list; citation resolution table |
| `README.md` | Updated — links to PROJECT_RULES and WALKTHROUGH |
| `docs/maanta-doc-integrity-report-2026-07-09.md` | **Added** — this report |

No code, migration, or legal files were modified.
