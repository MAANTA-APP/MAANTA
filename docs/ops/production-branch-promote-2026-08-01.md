# Production served an open PR branch — five times, 2026-08-01 → 04

Evidence artifact for drift rows **D53** (closed) and **D56** (open). Written
because the evidence lives outside this repository — in the Vercel API and in a
bot comment — and neither survives. A deployment record ages out; a session
transcript is not a durable record.

The filename carries the date of the first occurrence; the file is the record for
the whole family, not for one day.

> **This document was already out of date when it was written.** It closed with
> "if this happens a third time, this file is what the next person should read
> first" and predicted the control would need escalating. The third occurrence
> landed **13 hours later**, on the branch of the pull request that added this
> file — see §8. That is not an anecdote: it is the third data point in under 24
> hours, and it is what makes §6 a standing decision rather than a precaution.

**Status:** all three incidents resolved. The control that would prevent a fourth
is a Vercel project setting and remains an open founder decision — see §6.

---

## 1. What happened, in one line

On three occasions within 24 hours, `www.maanta.app` and `maanta.app` were served
from a deployment built from an **open pull request branch** rather than from
`main`.

| | First (D53) | Second (D56) | Third (§8) |
|---|---|---|---|
| When | 2026-08-01 ~14:20Z | 2026-08-01 18:31Z | 2026-08-02 07:36Z |
| Deployment | `dpl_kwm9shnHG6T1M17syCDfrKjjeSqW` | `dpl_ALPrV9RBGrbncco8YE2bzpsF7jMd` | `dpl_6zKSsfbFeVWtrjpvbfKuSvSuEaUz` |
| PR | #161 | #166 | #167 |
| Branch commit | `8bd96374` | `602323e` | `205a7ed` |
| Promoted tree | `69a462eb…` | `a959d669…` | `2458a8da…` |
| `main` tree at the time | `69a462eb…` — **identical** | `ed3b3d4d…` — **different** | `a959d669…` — **different** |
| Diff vs `main` | none | 2 commits, **app code** | 2 commits, **docs only** |
| Content risk | none; provenance only | real: `main` lacked the `/contact` fix | none; nothing under `maanta-app/` |
| Resolved by | merging #161 → `b6f19716` | merging #166 → `225db23` | merging #167 |

**Only the second carried live risk.** That is the point worth holding on to,
and also the trap: two of three were harmless, which is exactly the pattern that
makes a recurring failure easy to keep tolerating until the one that is not
harmless arrives. It already did once, in the middle of the three.

---

## 2. Read-backs — second occurrence (D56)

Retrieved from the Vercel API, not inferred. Fields trimmed to what is load-bearing.

### The promote

```text
id:              dpl_ALPrV9RBGrbncco8YE2bzpsF7jMd
createdAt:       2026-08-01 18:31:47Z
ready:           2026-08-01 18:34:37Z
state:           READY
target:          production
source:          redeploy
meta.action:     promote
meta.originalDeploymentId: dpl_DQUge5UKRJ237egWvbpEZJ6oXs37
meta.githubCommitRef:  claude/install-superpowers-plugin-na574p
meta.githubCommitSha:  602323e3702f732277603dcffcd6ccd3e7f8c0ea
meta.githubPrId:       166
alias:
  - www.maanta.app
  - maanta.app
  - maanta-nuia.vercel.app
  - maanta-nuia-maanta.vercel.app
  - maanta-nuia-git-claude-install-superpowers-plugin-na574p-maanta.vercel.app
```

`meta.action: promote` with `target: production` on a `githubCommitRef` that is
not `main`, while `githubPrId: 166` was still open, is the whole finding.

### The repair

```text
id:              dpl_HiNU4vwbuhTJfEwoS5uUfPmLs3Xk
createdAt:       2026-08-01 18:36:13Z
ready:           2026-08-01 18:38:47Z
state:           READY
target:          production
source:          git                      ← not a promote
meta.githubCommitRef: main                ← not a branch
meta.githubCommitSha: 225db230a502504f966597e017559cdd2c388978
alias:
  - www.maanta.app
  - maanta.app
  - maanta-nuia-git-main-maanta.vercel.app
```

Triggered automatically by the merge. No manual step was needed, which is also
why the divergence was only ever one merge deep.

---

## 3. Tree comparison — the method, not just the result

```shell
$ git rev-parse 602323e^{tree}          # the promoted branch commit
a959d66922ec63b964139688d069a6d0f432b093

$ git rev-parse origin/main^{tree}      # main, before the merge (302c6fd)
ed3b3d4ddca235f9efb2464822a09b19f7ff3067

$ git log --oneline origin/main..602323e
602323e fix(marketing): bind the form gate's checks to the route's own form
ac8c788 fix(marketing): server-render the /contact form — Step 5, D41
```

After merging:

```shell
$ git rev-parse origin/main^{tree}      # main, after the merge (225db23)
a959d66922ec63b964139688d069a6d0f432b093   ← equals the deployed tree
```

**Compare trees, not commit SHAs.** This cuts both ways and both directions have
already caused a wrong conclusion here:

- A squash merge mints a new SHA, so `git merge-base --is-ancestor` against a
  promoted branch commit fails **forever**, even when the content is byte-identical.
  That is what made D53 look unresolved after it was resolved.
- Conversely, matching SHAs are not what proves agreement. Tree equality is.
  `main` and the promoted deployment agreeing on `a959d669…` is the statement
  worth making.

---

## 4. Why the second occurrence was worse

D53's promoted tree and `main`'s were the identical git object. The site served
correct code throughout; only provenance was wrong.

D56's differed by two commits, and `main` was the one missing them. The exposure
window is **18:31:47Z to 18:38:47Z** — from the promote's `createdAt` to the
moment the replacement deployment reached `READY` and took the production
aliases. Both endpoints are timestamps recorded in §2; the merge time is not,
which is why the window is stated against the deployment rather than against the
merge. Seven minutes.

Throughout it, a push to `main` — or any deploy triggered from it — would have
silently reverted `www.maanta.app` to the state drift **D41** describes:
`/contact` shipping **zero `<form>` elements and zero inputs**, directly beneath
its own server-rendered promise that "This form and email — We reply within 1
business day".

Nothing would have alerted anyone. The revert would have looked like a normal
production deploy from `main`.

**The third occurrence carried no such risk, and the check that establishes that
is worth copying** — a promoted tree differing from `main` is not automatically
dangerous, and it matters whether the difference reaches the app:

```shell
$ git diff --name-only origin/main 205a7ed
docs/maanta-drift-register.md
docs/ops/production-branch-promote-2026-08-01.md

$ git diff --name-only origin/main 205a7ed -- maanta-app/
                                     ← empty: the rendered site is unaffected
```

Two of the three were harmless by this test. That is the trap rather than the
reassurance: a failure mode that is usually harmless is one people learn to
tolerate, and the one occurrence that was not harmless sat in the middle of the
three.

---

## 5. How it was detected, and why that is not a control

No occurrence was found by a check. All three were found by reading the Vercel
bot's PR comment, whose base64 payload carries:

```json
{"previewUrl":"www.maanta.app", "livefeedback":{"link":"www.maanta.app"}}
```

instead of the usual branch alias
(`maanta-nuia-git-<branch>-maanta.vercel.app`). That single field is the only
signal that reached GitHub. Everything else on the PR looked normal: check runs
green, "Preview" link present, no warning of any kind.

A person reviewing the PR in the GitHub UI would not see it. Decoding a bot
comment's payload is luck, not a control.

---

## 6. What would actually close D56

A configuration decision on the Vercel project — not code, and not another
document:

- **Option A** — disable manual production promotes for `prj_9ZcvFgpVsaUpP9hv2UlNoU5Sdw4c`.
- **Option B** — restrict promote so only deployments built from `main` may take
  the production aliases.

Either removes the failure mode at the source. Both are founder calls, so no
Claude session can take them, which is why D56 stays **open** while the three
incidents behind it are resolved.

**Three occurrences in under 24 hours is the escalation trigger this section was
written to anticipate.** The first version of this file called a third occurrence
the point at which the control needs taking seriously; it then happened 13 hours
later, on the branch of the pull request that added the file. A pattern that
reproduces three times in a day is not a lapse to be more careful about — it is
the normal way this project currently reaches production, and the only reason it
keeps being caught is a human decoding a bot comment.

If promoting the working branch is in fact the intended workflow rather than an
accident, that is a legitimate choice — but then D56 should be rewritten to
record it as a deliberate practice with its risks named, not left as an incident
awaiting a control that is never going to be applied. What is not sustainable is
the current state: a documented incident class, no control, and a recurrence rate
of once every eight hours.

**Until one is taken, the operational rule is: if a branch must go live before
merge, merge it.** Merging is fast, reversible through the normal path, and
leaves `main` as the thing production is built from. A promote from an open
branch is a production state nothing in this repository can observe.

### Why D56 is not closed

D53 closed with a stated control — "production deploys are driven by `main`
pushes by default, so this only recurs when a human promotes a branch by hand."
That reasoning was correct. Events tested it the same day and it did not hold.

Closing D56 on the same reasoning would assert the risk is contained when
nothing has changed to contain it. That is the "we already fixed that" failure
the drift register exists to prevent, and D53 → D56 is a worked example of it
happening inside the register itself.

---

## 7. Checking for it — copy-paste

There is no automated check. To verify by hand what production is actually
serving:

1. Read the current production deployment (Vercel dashboard, or `get_deployment`
   on the project's production alias).
2. **`meta.githubCommitRef` must be `main`. That single field is the incident
   condition.** Anything else means production is serving a branch.

   `source` and `meta.action` are **supporting evidence only, never the test.**
   Vercel documents `source` as "a best-effort guess for metrics only", explicitly
   not authoritative and not to be gated on, and a legitimate redeploy of a
   `main`-built deployment can carry `source: redeploy` while `githubCommitRef`
   still reads `main`. Gating on it would manufacture incidents that are not one.
   All three occurrences in §1 did show `action: promote`, which is why they are
   quoted throughout — as corroboration of how the deployment was made, not as the
   thing that made it wrong.

3. Compare two trees. Be precise about which is which — the two sides are
   different things and an earlier draft of this step conflated them:

   - **deployed** = `meta.githubCommitSha` from step 1. What production is
     serving.
   - **expected** = the `main` revision production *should* be serving. Normally
     `origin/main` after a fetch. If you know a `main` deploy is still in flight,
     it is the `main` revision from *before* that push, not the tip.

   ```shell
   git fetch origin main
   EXPECTED=origin/main          # or the specific main revision expected to be live
   git rev-parse <deployed-sha>^{tree}
   git rev-parse "$EXPECTED^{tree}"
   ```

   Equality means production matches the expected `main` revision's content.
   **Inequality is ambiguous on its own**, and step 2 is what disambiguates it:

   - **`githubCommitRef` is not `main`** → the incident, whether or not the trees
     happen to match. Content agreeing today does not make the provenance right,
     and the next push to `main` is what exposes the difference.
   - **`githubCommitRef: main`, deployed SHA is an ancestor of `origin/main`** →
     `main` has moved ahead and the next deploy has not landed. Deployment lag,
     not an incident. Re-check once it has.
   - **`githubCommitRef: main`, deployed SHA is *not* an ancestor** → do not
     escalate on the ancestry alone; this is the squash-merge case §3 warns
     about, where the pre-merge SHA never becomes an ancestor even though the
     content is identical. **Compare trees first.** Trees equal → content match,
     nothing to do. Trees differ → validate the repository and history as in
     step 4, and escalate if the SHA is still non-ancestral afterwards.

4. If the deployed SHA is not in the local repository, **it cannot be verified
   from this checkout** — that is a statement about the checkout, not yet about
   the deployment. A missing object is equally consistent with a shallow or
   partial clone, a stale fetch, a fork, or the wrong Vercel project. Rule those
   out before drawing any conclusion:

   ```shell
   git remote get-url origin        # must match meta.githubOrg/meta.githubRepo
   git rev-parse --is-shallow-repository
   # true  → git fetch --unshallow --tags
   # false → git fetch --all --tags
   git cat-file -e <deployed-sha>^{commit} && echo present || echo absent
   ```

   `--unshallow` is the part that matters and the part easy to get wrong:
   `git fetch --all --tags` does **not** remove a shallow boundary, so on a
   shallow clone it will leave the commit missing and the procedure would
   escalate a checkout problem as a deployment one. Only if the SHA is still
   absent after this does it escalate — at that point the deployed commit
   genuinely is not reachable from the repository, and no tree comparison can be
   made.

---

## 8. Third occurrence — 2026-08-02, on this file's own pull request

Thirteen hours after §1–§7 were written, and while **#167** — the PR adding this
file — was open, its branch was promoted to production.

```text
id:              dpl_6zKSsfbFeVWtrjpvbfKuSvSuEaUz
createdAt:       2026-08-02 07:36:26Z
ready:           2026-08-02 07:38:50Z
state:           READY
target:          production
source:          redeploy
meta.action:     promote
meta.originalDeploymentId: dpl_EcuMzBo2HAvrycuzLFEVk6dReFp6
meta.githubCommitRef: claude/install-superpowers-plugin-na574p
meta.githubCommitSha: 205a7edd5afedbd8f7fe3d92b17ec175cd1a7076
meta.githubPrId:      167
alias:
  - www.maanta.app
  - maanta.app
  - maanta-nuia.vercel.app
  - maanta-nuia-maanta.vercel.app
  - maanta-nuia-git-claude-install-superpowers-plugin-na574p-maanta.vercel.app
```

Trees differed — deployed `2458a8da…`, `main` `a959d669…` — but the entire diff
was `docs/maanta-drift-register.md` and this file. Nothing under `maanta-app/`,
so the rendered site was byte-identical to what `main` produces. Confirmed with
the path check in §4 rather than assumed from the commit messages.

Detected the same way as the other two, by the `previewUrl` field in the Vercel
bot comment. Resolved the same way, by merging #167.

**What this occurrence adds to the record**, beyond being a third tally mark:

- It happened on the pull request whose only content is the documentation of the
  problem. Writing the incident down changed nothing about the behaviour, which
  is the strongest available argument that the missing piece is a configuration
  setting rather than more prose.
- It is the second of three where the divergence was harmless. That ratio is
  what makes this easy to keep tolerating — and the harmful one was the middle
  of the three, not the last.
- The §7 procedure was used to triage it and worked, including the
  `git diff --name-only … -- maanta-app/` step that separated "trees differ" from
  "the site is wrong". That distinction is the difference between a note and an
  incident, and it should be the first thing checked next time.

## 9. Fourth and fifth occurrences — 2026-08-04, resolved by merge

Two more promotes of an open PR branch, two days after this file said a
recurrence rate of once every eight hours was not sustainable. Recorded here so
the register's **D71** row rests on a checked-in artifact rather than on
Vercel's deployment list, which ages out.

| # | Time (UTC) | Deployment | Ref @ commit | Note |
|---|---|---|---|---|
| 4 | 15:09 | `dpl_7tkPxRZ8dt7wej3kspDFs5RDxjya` | `claude/install-superpowers-plugin-na574p` @ `6e817424` | `action: promote`, serving `www.maanta.app` by 15:11. PR #172 open and unmerged |
| 5 | 15:43 | `dpl_83SmoigxTmfsRsfpUbVqNC6MgCYA` | same branch @ `7d4af48` | `action: promote`, `originalDeploymentId: dpl_BUD7posm5jPi6nYmiBCVbMeCsTPL`. Production was *tracking* the branch push-by-push |

Also relevant: `dpl_8VVhSaarcgajWvQi`, an earlier promote of
`claude/scaling-costs-security-audit-vfcp97` @ `2ed98ade` — the release tag on
the Sentry events behind **D70**. That is the incident class's first *measured*
shopper impact: a defect from an unmerged branch crashed `/verify-phone` on the
claim path in production.

**Resolution — merge, not rollback.** The founder merged #172 (squash
`e167c3d`); the git integration minted `dpl_3ac8FEZ59jnWf7vpNrQtC6qvnCCj`
(`target: production`, `source: git`, ref `main` @ `e167c3d`), READY at 15:57
UTC holding the `www.maanta.app` and `maanta.app` aliases. Verified by
`get_deployment` read-back per §7's discipline, not assumed. One incidental
upside: the D70 fix reached shoppers hours before the merge, via the very
failure mode this file records.

### What Vercel's settings actually do — corrected

Earlier drafts of the register pointed at "deployment protection / required
checks" as the guard. That was wrong, and the error matters because it sends
the person taking the control to the wrong screen:

- **Deployment Protection** governs **URL access** — Vercel Authentication,
  password, trusted IPs. Confirmed two ways: Vercel's docs, and the Vercel MCP's
  own `get_project_deployment_protection` schema, which exposes exactly those
  three fields and nothing about promotion. It does not block a promote.
- **Deployment Checks** hold the production-domain assignment until required
  checks pass — but the dashboard offers **Force Promote**, which bypasses
  them. A bypassable check is a speed bump, not a guard, for an action that is
  itself already a deliberate dashboard click.
- **Disabling "Auto-assign Custom Production Domains"** (Settings →
  Environments → Production → Branch Tracking) makes *every* production
  assignment a manual promote. It changes the workflow; it does not restrict
  which branch may be promoted.
- **Deployment policies** (Build & Deployment settings) can restrict which
  *sources* (Git/CLI/API) may deploy to production, and are the closest thing
  to §6's Option A. Whether the plan tier for
  `prj_9ZcvFgpVsaUpP9hv2UlNoU5Sdw4c` exposes them is unverified from here.

Consequence for **D71**: it stays open until a human **configures a control and
demonstrates it** — attempts a promote of a non-`main` deployment and watches it
be rejected (or records `no guard: <reason>` if the plan tier offers nothing
that rejects it). A named setting that has not been demonstrated is exactly the
"stated control that events then tested" failure §6 records for D53 → D56.
