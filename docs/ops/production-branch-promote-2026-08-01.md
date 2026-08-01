# Production served an open PR branch — twice, 2026-08-01

Evidence artifact for drift rows **D53** (closed) and **D56** (open). Written
because the evidence for both lives outside this repository — in the Vercel API
and in a bot comment — and neither survives. A deployment record ages out; a
session transcript is not a durable record. If this happens a third time, this
file is what the next person should read first.

**Status:** both incidents resolved. The control that would prevent a third is a
Vercel project setting and remains an open founder decision — see §6.

---

## 1. What happened, in one line

On two occasions roughly four hours apart, `www.maanta.app` and `maanta.app`
were served from a deployment built from an **open pull request branch** rather
than from `main`.

| | First (D53) | Second (D56) |
|---|---|---|
| Deployment | `dpl_kwm9shnHG6T1M17syCDfrKjjeSqW` | `dpl_ALPrV9RBGrbncco8YE2bzpsF7jMd` |
| PR | #161 | #166 |
| Branch commit | `8bd96374` | `602323e` |
| Promoted tree | `69a462eb…` | `a959d669…` |
| `main` tree at the time | `69a462eb…` — **identical** | `ed3b3d4d…` — **different** |
| Content risk | none; provenance only | real: `main` lacked the `/contact` fix |
| Resolved by | merging #161 → `b6f19716` | merging #166 → `225db23` |

The second is the one that mattered. See §4.

---

## 2. Read-backs — second occurrence (D56)

Retrieved from the Vercel API, not inferred. Fields trimmed to what is load-bearing.

### The promote

```
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

```
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

```
$ git rev-parse 602323e^{tree}          # the promoted branch commit
a959d66922ec63b964139688d069a6d0f432b093

$ git rev-parse origin/main^{tree}      # main, before the merge (302c6fd)
ed3b3d4ddca235f9efb2464822a09b19f7ff3067

$ git log --oneline origin/main..602323e
602323e fix(marketing): bind the form gate's checks to the route's own form
ac8c788 fix(marketing): server-render the /contact form — Step 5, D41
```

After merging:

```
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

D56's differed by two commits, and `main` was the one missing them. So for the
seven minutes between the promote and the merge, a push to `main` — or any
deploy triggered from it — would have silently reverted `www.maanta.app` to the
state drift **D41** describes: `/contact` shipping **zero `<form>` elements and
zero inputs**, directly beneath its own server-rendered promise that "This form
and email — We reply within 1 business day".

Nothing would have alerted anyone. The revert would have looked like a normal
production deploy from `main`.

---

## 5. How it was detected, and why that is not a control

Neither occurrence was found by a check. Both were found by reading the Vercel
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
Claude session can take them, which is why D56 stays **open** while the two
incidents behind it are resolved.

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
2. Confirm `meta.githubCommitRef` is **`main`** and `source` is **`git`**, not
   `redeploy` with `meta.action: promote`.
3. Confirm tree equality, not SHA equality:

   ```
   git fetch origin main
   git rev-parse origin/main^{tree}
   git rev-parse <deployed-sha>^{tree}
   ```

   These must match. If the deployed SHA is not in the repository at all, the
   deployment is from a branch that has been force-pushed or deleted — treat
   that as unresolved and escalate.

A mismatch is not automatically an incident: it may simply mean `main` has moved
ahead and the deploy has not run yet. What makes it an incident is
`meta.githubCommitRef` naming something other than `main`.
