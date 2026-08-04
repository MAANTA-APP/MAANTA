# Unmerged remote branch inventory — 2026-08-04

**What this is:** a fixed record of every remote branch carrying commits that are
not on `main`, with the SHAs each claim was measured against. It exists so that
drift row **D68** — and any future row about work stranded on a branch — stays
verifiable after the branch itself is deleted, renamed, or force-pushed.

A branch is not a tracker. Neither is a shell script's output in a session that
has ended. This file is checked in; the branches are not guaranteed to outlive it.

## Measurement basis

Every number below was computed with these two commits fixed. Re-running the same
commands later against a moved `main` will produce different numbers; that is not
a contradiction of this document, it is a different measurement.

| Anchor | SHA |
|---|---|
| `main` at time of inventory | `1826dc5a36b6bb23b82313c83d5dfe8d564e13cb` |
| Date computed | 2026-08-04 |

Per-branch figures are:

- **tip** — `git rev-parse origin/<branch>`
- **base** — `git merge-base origin/main origin/<branch>`
- **ahead** — `git rev-list --count origin/main..origin/<branch>`
- **diff** — `git diff --shortstat <base> origin/<branch>`

`ahead` counts commits reachable from the branch but not from `main`. For a branch
whose work was squash-merged, that count is **not** zero even though the content
landed: a squash mints a new SHA, so the original commits stay unreachable from
`main` forever. Content identity has to be judged by comparing trees, not by
ancestry. That trap is why the branches below are grouped by *PR state* rather
than by `ahead` alone.

## Group A — merged once, then the tip moved (7, plus one with no PR)

These branches had a PR merged, and then received further commits that were never
merged anywhere. This is the group that can hide finished, forgotten work, because
the merged PR makes the branch look done.

"Latest merged PR" is the highest-numbered merged PR whose head was on this branch.
Several of these branches fed more than one PR; the column names the last one, not
the only one.

| Branch | Latest merged PR | tip | base | ahead | diff vs base |
|---|---|---|---|---|---|
| `cursor/claude-design-system-7f6b` | #87 | `499f580e64df` | `16a12db8f725` | 3 | 28 files, +1528 −476 |
| `cursor/codebase-for-founders-7edd` | #101 | `80580e9126cd` | `46d8c00dd9e2` | 7 | 1 file, +504 |
| `cursor/design-changes-expiry-map-nav-2718` | #107 | `40bab4ebf71a` | `0dd792c1bc67` | 9 | 64 files, +2052 −261 |
| `cursor/dev-test-auth-strategy-f18c` | #111 | `9b6ad8c38193` | `834c2dc4ea4b` | 2 | 24 files, +904 −149 |
| `cursor/prod-schema-seed-fixup-1e20` | #105 | `ae625b9b90c9` | `e4ac8e400bf1` | 3 | 10 files, +164 −11 |
| `cursor/sentry-nextjs-setup-f89e` | #64 | `a9f9461b04d0` | `b914c2296402` | 3 | 9 files, +384 −7 |
| `cursor/wireframe-sync-pre10k-1e20` | #104 | `2fbec417d380` | `85b257802da8` | 2 | 24 files, +682 −211 |
| `cursor/document-database-url-env-example` | *(none)* | `087105756f1f` | `834c2dc4ea4b` | 1 | 1 file, +1 |

`cursor/document-database-url-env-example` is listed here for want of a better
group: it has **no PR at all**, merged or otherwise. Its single commit adds one
`DATABASE_URL` line to `maanta-app/.env.example`. Small enough to re-do from
scratch rather than reconcile.

Only one branch in this group has been inspected commit by commit
(`design-changes-expiry-map-nav-2718`, below). **The other seven are unassessed** —
being listed here is a statement that unmerged commits exist, not a claim about
whether they should land. Do not read this table as a backlog.

### `cursor/design-changes-expiry-map-nav-2718` — the D68 branch

The subject of drift row **D68**. Nine commits, `0dd792c1bc67..40bab4ebf71a`:

| SHA | Subject |
|---|---|
| `2ade1e9` | Shopper UI: expiry countdown, Map page, dropdown filters, back nav |
| `4c616bd` | Browse dropdowns, larger My deals segments, favourites heart in header |
| `8165a19` | Add merchant/ops test personas and lifecycle UI |
| `d999e94` | Merge origin/main into cursor/design-changes-expiry-map-nav-2718 |
| `5873190` | **Add cofounder RBAC, access review, and seed fixes** |
| `24507a4` | Document co-founder ops routes in test-accounts.md |
| `7893ff8` | Set Maanta shield-checkmark logo as site favicon |
| `3e9d231` | Add /download PWA install page and role-aware app bootstrap |
| `40bab4e` | Add 192px app icon for PWA manifest metadata |

`main` was **147 commits ahead** of the branch's base at the time of measurement,
which is why D68 calls this a reconcile rather than a merge.

The branch mixes at least four separable concerns — co-founder RBAC, merchant
lifecycle, PWA install, shopper deal-list controls — which is the argument for
landing it in reviewed slices rather than as one 64-file merge.

`5873190` is the RBAC slice. It adds a migration extending the `users_role_check`
constraint on `public.users.role` with a `cofounder` value, a central role-access
module, and a test; it rewires the `admin` / `agent` / `founder` guards to call
that module instead of comparing role strings inline. Because it changes a CHECK
constraint on a live table and touches access control, `CLAUDE.md` puts the apply
step in human hands: `make db-verify` locally, then a human `supabase db push`.

Two things in `5873190` should **not** be carried forward as-is:

- Its `src/lib/cofounder.ts` is dead on arrival — nothing in the commit imports it,
  and it re-declares a `requireFounderPage` that already exists in `founder.ts`.
- Its migration filename is timestamped `20260727010000`, which sorts **before**
  migrations already applied to production. Any reconcile has to renumber it to a
  current timestamp or it will land out of order in the ledger.

## Group B — open PR (10)

Not forgotten; awaiting review or a decision. Listed for completeness so this file
accounts for every held-back branch, not a filtered subset.

| Branch | PR |
|---|---|
| `cursor/node0-pilot-readiness-4b4b` | #149 |
| `cursor/prod-hardening-2026-07-ae69` | #121 |
| `cursor/prod-auth-landing-ux-f18c` | #117 |
| `cursor/elite-seed-test-accounts-pwa-f18c` | #112 |
| `cursor/global-e164-phone-auth-2718` | #108 |
| `cursor/founder-scale-and-ui-polish-7edd` | #102 |
| `cursor/avatars-notif-seed-7f6b` | #94 |
| `cursor/seed-feed-deals-c0f8` | #84 |
| `cursor/fix-sign-in-clerk-nav-c0f8` | #83 |
| `cursor/clerk-health-check-c0f8` | #80 |

## Group C — PR closed without merging (7)

A closed-unmerged PR is a decision, so these are the least likely to hide
forgotten work. Recorded anyway, because "someone closed it" and "someone decided
against it" are not the same thing and this file cannot tell them apart.

| Branch | PR |
|---|---|
| `cursor/prod-auth-redirect-www-909e` | #118 |
| `cursor/profile-map-seed-7f6b` | #96 |
| `cursor/discover-browse-w3w-7f6b` | #95 |
| `cursor/setup-dev-environment-3d65` | #89 |
| `cursor/setup-dev-environment-7fba` | #86 |
| `cursor/prod-ui-deploy-verify-dce0` | #76 |
| `cursor/setup-dev-environment-0bf5` | #67 |

## What is safe to delete, and what this file protects

Of 64 remote agent branches, 39 were classified safe to delete: the branch tip is
identical to the head of a merged PR and has not moved since. The 25 above are the
remainder and are held back — the cleanup refuses to delete a branch whose tip has
moved, precisely so Group A cannot be lost to a tidy-up.

**Do not delete `cursor/design-changes-expiry-map-nav-2718`** until D68 closes,
either by landing the work in reviewed slices or by a founder ruling that the
deferred co-founder enum stays deferred.

Once every slice of that branch has landed or been explicitly declined, this file
is the record of what was on it, and the branch itself can go.
