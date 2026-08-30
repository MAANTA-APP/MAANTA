# Engineering-night closure — 2026-08-30

## Outcome

All engineering work that is executable under the founder's existing rulings
is implemented on `codex/engineering-night`. Ten drift rows close with named
evidence: **D27, D86, D155, D165, D167, D180, D181, D209, D213 and D217**.

**D169 is implemented but deliberately remains open.** The migration and its
grant ratchet are authored; closure requires the real fresh-database CI job and
the separately authorized production migration apply.

## Delivered

| Area | Result | Drift |
|---|---|---|
| Merchant staff | `/merchant/staff/new` refuses non-owners before the form mounts | D165 |
| Merchant copy | Singular claim copy corrected; the remaining recorded copy items re-verified fixed | D167 |
| Merchant money | Wallet balance is rendered through `formatKes` | D180 |
| Founder console | Segment loading and Sentry-reporting error boundaries added | D181 |
| Nairobi time | `friendlyTime` uses the Nairobi wall clock and Nairobi calendar day | D209 |
| Shopper inventory | Inventory-advertising routes refresh within 30 seconds and on resume | D213 criterion 4 |
| Counter queue | Queue lapse is confirmed server-side; uncertainty is neutral; rejoin is explicit only | D217 |
| Ledger grants | Fresh deployments revoke authenticated INSERT/UPDATE/DELETE on `merchant_transactions` | D169, pending CI/apply |
| Identity repair | Runbook now supplies the D124 service-role session claim | D155 |
| Drift governance | The second register is explicitly historical and D86's exercised process control is closed | D27, D86 |

## Verification

- Full Vitest board: **173 files, 1,719 tests passed**.
- ESLint: **no warnings or errors**.
- TypeScript: **passed** (`tsc --noEmit`).
- Production build: **passed**, including token, canonical and server-form gates.
- `git diff --check`: **passed**.
- Focused QR confirmation suite: API and component tests cover live membership,
  missing queue/claim, total confirmation bound, neutral failure state and the
  explicit-only rejoin path.

The disposable PostgreSQL gate could not run in this execution image: Docker
and the Supabase CLI are both absent, and privilege escalation is unavailable.
The PR must not merge until its real `db-tests` job passes the complete fresh
migration chain, including
`20260830120000_revoke_authenticated_ledger_writes.sql` and the three D169
privilege assertions.

## Open work is not silently converted into tonight's scope

The canonical register now has 48 open rows. Ten are labelled engineering-owned,
but none is another executable implementation under the current rulings:

| Row | Why it remains open |
|---|---|
| D26 | Needs the founder's ruling on which design states require drift citations |
| D39 | Needs a no-redirect external HTTP observation |
| D51 | Code is fixed; closure waits for the 2026-10-31 offer expiry |
| D54 | Code is fixed; closure needs authenticated visual proof |
| D83 | The residual IntaSend authentication model needs a product/security ruling |
| D93 | Repository work is shipped; closure needs Android device evidence |
| D112 | Must reproduce the iOS Safari map race before changing code |
| D118 | Explicitly deferred until result density approaches the row limits |
| D168 | Explicitly deferred; restoring broad merchant SELECT is forbidden |
| D169 | Authored here; awaits fresh-DB CI and separately authorized apply |

Founder-owned product decisions, field proofs and explicit post-Merchant-01
deferrals remain open as recorded. This branch does not merge itself and does
not apply a production migration; those are separate authorizations.
