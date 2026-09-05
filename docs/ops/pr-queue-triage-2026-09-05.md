# Stale PR queue triage — 2026-09-05

**Status:** CURRENT — every open pull request classified against `main` at `18d2a1a`.
**Audience:** founder, eng.
**Result:** 33 open → **9 feature PRs + 8 dependency bumps**. 17 closed (16 here, plus
#317 closed the same day by founder instruction). **No branch was deleted**, so every
close is reversible by reopening.
**Register rows opened:** **D279–D284**, all verified on `main` during this pass.

## Why this was not a bulk close

The queue looked like clutter. It was not, entirely. Roughly half the open PRs
held work `main` does not have, and two carried things that would have caused
harm if merged blind. Each PR was checked by reading `main` — the file, the
migration, the register row — rather than inferred from its age.

Two findings justify the method on their own:

- **PR #112 carries `elite_merchants_100.sql`.** Three documents on `main`
  already forbid applying it: it would consume the entire 100-slot Elite launch
  offer on placeholder merchants, and `20260730130000_enforce_elite_trial_first_100_cap.sql`
  makes that irreversible — `elite_trial_granted_at` is stamped once and never
  cleared. Closed, with the reason on the PR.
- **PR #94's avatar work is genuinely missing**, while two documents on `main`
  say it shipped. Kept open, and the contradiction is now **D279**.

## What was closed (17)

| PR | Verdict | Superseded by |
|---|---|---|
| #317 | superseded | Six rows landed in #318 as D225–D230; offline work held under D277 |
| #35 | superseded | `main`'s golden-path suite names this PR as its origin, and reverses two of its structural choices |
| #56 | superseded | Server capture with no SDK dependency (D20); its provider fix landed separately |
| #80 | superseded | `envPresence()` plus the public readiness probe, which is not circular as `?auth=1` was |
| #83 | obsolete | Its file and `SignInButton` are both gone; the fix exists via D259 |
| #84 | superseded | `node0_100_deals_seed.sql`, which is cap-aware; per-rail bucket queries replaced the limit change |
| #97 | superseded | Wrong base, and a second analytics vendor conflicts with the published cookie notice |
| #99 | obsolete | Certifies a feed cap and a seed that no longer exist (D206) |
| #102 | superseded | The same audit file on `main` is the post-implementation record |
| #108 | superseded | Strategy ruled out 2026-08-22 (D151); the dropdown and country codes landed anyway |
| #112 | superseded | Test accounts and PWA landed; the Elite seed is forbidden — see above |
| #117 | superseded | Auth half on `main` in stronger form; landing half reversed by design board 1 (D272) |
| #143 | superseded | Both ledger defects closed by D24 and the D73 reland |
| #149 | obsolete | Its landing order ends in a `db push` that a 2026-08-05 correction already voided |
| #173 | superseded | Its register edit is already on `main`, verbatim |
| #198 | obsolete | Measures marketing surfaces rebuilt and deleted by `4618db5` |
| #206 | declined | Frozen demand, unpinned third-party source, hashes covering one file in seven |

Only #206 was closed as a judgement call rather than as superseded. It is
third-party skills vendored during a design freeze, its lock entries carry no
commit SHA, and the computed hash covers `SKILL.md` alone while six companion
files are covered by nothing. Reversible if the founder disagrees.

## What was kept, and why (9)

| PR | What `main` genuinely lacks |
|---|---|
| #94 | **Avatars** — no code anywhere, two docs claim otherwise (**D279**). Its other two slices are dead and must not be carried forward |
| #121 | Eight ops documents, the environment catalogue, the migration-checklist target. Drop its readiness change; no deployed environment hits that path |
| #131 | Merchant staff nav gating (**D281**), the boosted search filter (**D282**), a fail-closed top-up status, archived-deal gating |
| #132 | The top-up money-path fix (**D280**), the design-truth schema and contract. **Collides** with `main`'s `frames.json` — re-land additively, never as a replacement |
| #142 | Six analytics events; no server-side substitute exists. One file is at a dead path |
| #168 | The `public.nodes` registry (**D283**) and the scale/cost model |
| #185 | 72-hour SLA aging. D81 is open, but its founder ruling exists only in this PR's diff |
| #199 | The metadata quality gate (**D284**) |
| #316 | **The content release form. P0 legal, with a Merchant 01 deadline** — see below |

**PR #316 is the most time-sensitive item in the queue.** The documentation
register lists the content release and photography consent form as MISSING — P0,
needed before the Merchant 01 visit, and the legal gap checklist calls it the one
item to action if nothing else is. Its blocker still holds: MAANTA is not
incorporated, so a release has no legal counterparty. One operational rule in it
is missing from the field kit right now — take no photographs and record no
quotes until the party question is answered.

## Dependency bumps (8) — no action taken

Five are green, three are permanently red. None was merged: every one changes
what gets built or shipped, and the repo is in a frozen operating state days from
its first genuine merchant.

| PR | Bump | CI | Note |
|---|---|---|---|
| #188 | actions/checkout 4→7 | green | Clears a live Node 20 deprecation warning. CI-only |
| #189 | actions/setup-node 4→7 | green | Same |
| #300 | supabase/setup-cli 1→3 | green | CI-only |
| #191 | stripe 22.3→22.4 | green | Minor, but the money path |
| #190 | posthog-js 1.406→1.418 | green | Minor, analytics only |
| #192 | vitest 2→4 | **red** | Major |
| #193 | typescript 5→7 | **red** | Major |
| #194 | next 14→16 | **red** | `next lint` was removed in Next 16, so the build script dies immediately. Next 15+ also made request APIs async, which this app uses throughout |

The three action bumps are the lowest-risk merges available and have a real
reason — GitHub is already force-running those actions on Node 24. The two npm
bumps touch production runtime. The three majors are migration projects, not
cleanup.

## Safety check

Before closing anything, every remote branch was checked for migrations `main`
does not have — the **D121** failure mode, where production held five migrations
that existed only on an unmerged branch. `main` has 115 migration files and **no
open branch carries more**. Clean.

## What this leaves for the founder

1. **D280** — the top-up screen tells a merchant their payment was received
   before anything confirms it. Fix before any merchant funds a wallet with real
   money.
2. **PR #316** — the content release form, P0 legal, Merchant 01 deadline,
   blocked on incorporation.
3. **D279** — land avatars or correct the two documents that say they shipped.
4. **D283** — decide whether nodes get a registry before there is a second node.
5. The five green dependency bumps: merge the three CI-only ones, or leave them.
