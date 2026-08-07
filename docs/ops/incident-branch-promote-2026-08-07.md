# Incident — fifth branch-promote to production, first caught by the tripwire (2026-08-07)

## What happened

- **~11:46 UTC**: deployment `dpl_3dGPhDtqN26BYvjMGzQbUgNejzBU` reached
  production via `action: promote` (creator `admin@maanta.app`). It is the
  preview build of the **unmerged** branch
  `claude/maanta-cleanup-dead-code-l68779` @ `be08837` (dead-code cleanup +
  two governance docs, no PR), displacing `main` @ `556499d`
  (`dpl_Cp4BfLvNYXpWiD6aeTrm8eg34WJv`, the #175 build).
- **12:24 UTC**: `prod-branch-guard` scheduled run #21 went red with the exact
  diagnosis: `Production is serving a build from
  'claude/maanta-cleanup-dead-code-l68779' (commit be08837), not main`.
  Red again at 13:51 (#22). Last green run 11:25.
- **Detection gap ≈ 38 minutes** (promote → first red), set by the 30-minute
  cadence. The pre-tripwire incidents (D37/D53/D71) went unnoticed for hours
  to days and were found only when a session looked.
- Deployment history also shows **two more branch promotes on 08-05/08-06**
  (`claude/solo-founder-achievements-cyf4u1` @ `866de2b` then `316419a`;
  `claude/docs-sync-production-state-smnnoj` @ `df50c9f`), matching the guard
  failures on the evening of 08-06 (16:56, 18:36), each later recovered to
  `main`. So the D37/D53/D71 pattern has more occurrences than the register
  currently counts; all promotes come from the founder's own account
  (single-member team).

Content risk of the exposure was low — the branch was CI-green, its app diff
is behavior-identical dead-code removal, the rest is docs — but production
serving an unmerged branch is exactly the incident class the pending D71
closure policy defines, and this one is the policy's first live test.

## Resolution (founder decision, this session) — VERIFIED 15:17 UTC

Founder chose **rollback over merge**: promote
`dpl_Cp4BfLvNYXpWiD6aeTrm8eg34WJv` (`main` @ `556499d`, newest READY `main`
deployment) back to production via the dashboard. The Vercel MCP surface in
this session exposes no promote action, so the clicks were human-run with the
session verifying each one by `workflow_dispatch` of `prod-branch-guard`.

**The rollback took three attempts, and the failed ones are part of the
lesson:**

1. **~15:07 UTC — wrong target.** The founder clicked Promote on the topmost
   deployments row, which is always the *newest preview of the branch*
   (`64dfcf6`) — production re-pinned to the branch again. Caught by guard
   run #25 (15:08 UTC, red, still branch).
2. **~15:11 UTC — near-miss, cancelled.** The Instant Rollback dialog was
   opened; its target was the *previous production deployment*, which after
   two stacked branch promotes was the **first** bad promote (`be08837`),
   not `main`. The dialog's own preview text showed this; cancelled on
   advice before confirming.
3. **~15:16 UTC — correct.** Promote of `dpl_Cp4BfLvNYXpWiD6aeTrm8eg34WJv`
   (`556499d`, `main`), confirmed in the dialog before clicking. Because the
   target was already a production build, the promote re-pointed the alias
   without minting a new deployment record — the read-back is the healthz
   response, not a deployment row.

- Rolled back at: **~15:16 UTC, 2026-08-07**
- Verified by guard run: **#26** (run id `31191847523`, dispatched 15:17:17,
  `conclusion: success` at 15:17:32 UTC) — healthz returned
  `{"commit":"556499d","ref":"main"}`: "Production serves main (commit 556499d)."

**Runbook lessons from the failed attempts** (fold into the promote policy
paragraph when pasting it):

- The top of the Deployments list is always the newest branch preview — the
  most prominent row is the wrong one. **Verify the branch column reads
  `main` and the commit matches before every Promote confirm.** If the
  confirmation dialog shows a `claude/…` (or any non-`main`) branch, cancel.
- **Instant Rollback only targets the immediately previous production
  deployment.** After stacked bad promotes, that target is another bad
  promote — read the dialog's target preview, and prefer promoting the named
  `main` deployment directly.

## Drift-register row to paste (verified — no placeholders left)

Numbering: this assumes the placeholder-disclosure row from
`docs/ops/governance-brief-d75-d24-d71-2026-08-06.md` is pasted first as
**D75**; paste this as **D76** (the register test enforces contiguous IDs —
if D75 is not pasted first, this row becomes D75 and the disclosure row D76).

> | D76 | closed | process | 2026-08-07 | Ops | **Fifth branch-promote to production — the first caught by the tripwire rather than by a session looking.** At ~11:46 UTC deployment `dpl_3dGPhDtqN26BYvjMGzQbUgNejzBU` (`action: promote`, creator `admin@maanta.app`) put the preview of unmerged branch `claude/maanta-cleanup-dead-code-l68779` @ `be08837` (dead-code cleanup + governance docs, no PR) on `www.maanta.app`, displacing `main` @ `556499d`. `prod-branch-guard` went red on its next scheduled run (12:24 UTC, again 13:51) with the exact diagnosis — detection gap ≈ 38 minutes, versus hours-to-days for the pre-tripwire incidents D37/D53/D71. Deployment history shows two further branch promotes on 08-05/08-06 (`claude/solo-founder-achievements-cyf4u1`, `claude/docs-sync-production-state-smnnoj`) matching that evening's guard failures, both later recovered — so the pattern's occurrence count is higher than the register recorded, and every promote comes from the founder's own account. Content risk low (branch was CI-green; app diff was behavior-identical dead-code removal), but an unmerged branch served production again — the exact incident class the D71 closure policy defines, caught by that policy's tripwire on its first live test | **Rolled back same day, founder-run, on the third attempt — the failed attempts are recorded because they are the operational lesson** (`docs/ops/incident-branch-promote-2026-08-07.md`): (1) ~15:07 UTC a Promote aimed at the top deployments row re-pinned production to the branch's newest preview (`64dfcf6`) — the newest row is always the branch, caught red by guard run #25 at 15:08; (2) ~15:11 an Instant Rollback was opened and cancelled — after two stacked branch promotes its "previous production" target was the **first** bad promote (`be08837`), not `main`; (3) ~15:16 `dpl_Cp4BfLvNYXpWiD6aeTrm8eg34WJv` (`main` @ `556499d`) promoted with the dialog verified before confirming. Verified by `workflow_dispatch` guard run **#26** (`31191847523`), green 15:17:32 UTC: healthz `{"commit":"556499d","ref":"main"}`. Guard: the tripwire that caught it — `.github/workflows/prod-branch-guard.yml` + `maanta-app/src/lib/__tests__/health.test.ts` — plus the promote policy in `docs/maanta-launch-ops-runbook.md` §"Production deployments and Promote", which now carries the two click-path lessons (verify the branch column reads `main` before any Promote confirm; Instant Rollback targets only the immediately previous production deployment, so after stacked bad promotes it is the wrong tool). Root cause unchanged from D71 (no Vercel setting restricts Promote; founder habit of trying branches live); the policy's answer — merge first, never promote a branch — applies to the founder too, which this row now demonstrates | founder |

## Amendment to the D71 closure text

When pasting the D71 closure row from `docs/ops/d71-closure-pack-2026-08-06.md`,
append this sentence to its evidence cell (before the "Known limits" sentence):

> A fifth promote occurred on 2026-08-07, before closure (see D76): the
> tripwire caught it within ~38 minutes and it was rolled back the same day —
> the guard's first live catch, which is the demonstration this ruling
> relies on.

This turns the closure from "we believe detection works" into "detection has
worked, once, end to end" — strictly stronger evidence for Option A.
