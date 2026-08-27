# PR 1 — shopper clarity: what was found, fixed, and deliberately not done

**Date:** 2026-08-27 · **Branch:** `claude/pr-1-shopper-clarity` · **Base:** `a70fe67`
(`origin/main`, the same base as PR 5 — **not** PR 5's head).
**No PR opened** — founder asked to be consulted first.

---

## 1. State established from git, not from the brief

The brief asked which of the audit's cleared items had landed. **None of the three
had.** The audit document itself (`docs/ops/uiux-72h-audit-2026-08-27.md`) is not
in the repository or on any branch, so every claim below was checked directly.

| Claimed cleared | Reality on `main` |
|---|---|
| `frames.json` entries for `/qr/[token]`, `/you/rewards`, `/merchant/qr/print` | **Absent.** 32 surfaces, last amended 2026-08-19. → **D209** |
| Dead `stats.fastVisits` removed | **Still present** in `lib/merchant-owner-stats.ts` (lines 19, 60, 97, 301, 304), rendered by no `.tsx`. PR 3 territory, untouched. |
| Admin attention-item severity ordering | **Not sorted.** Items push in fixed order; the `urgent` no-supply item is emitted *after* several `attention` items. `/admin` is frozen under the founder's `/admin` fee-aggregation ruling (PR 5's D208), untouched. |

### PR 5 overlap check — **zero**

PR 5 (#286) touches 16 files, all under `admin/`, `founder/`, `lib/pilot-*`,
`lib/evidence-scope`. PR 1 touches five, all under `(shopper)/` and
`lib/shopper-read-state`. The only shared path is
`docs/maanta-drift-register.md`, and both branches independently open a **D208**.
PR 1 does *not* skip the number to dodge it: the register's own guard requires
the D sequence to stay contiguous, and a deliberate hole fails CI — which it did,
on the first run. The register's established collision rule applies instead —
whichever branch merges first keeps the number, the other renumbers carrying its
provenance.

Nothing here depends on, rebases onto, or merges PR 5.

---

## 2. S1 — Nairobi time: **nothing to convert, and converting would be wrong**

The brief's premise was that every shopper surface outside `/tickets/[id]`
renders time "in the SERVER's timezone". The sweep does not support it.

**Method.** Every `toLocale*` / `Intl.DateTimeFormat` in `src/`; every time
render inside `(shopper)/`; every component imported by a shopper route; every
caller of `friendlyTime`, `relativeAge`, `relativeAgo`, `timeLeftLabel`.

| Shopper call site | What it renders | Verdict |
|---|---|---|
| `/tickets/[id]` — `absoluteTimeLabel`, `formatClaimCountdown` | Wall clock + countdown | **Already correct** (a9bbd3f/#275) |
| `/my-deals`, `/feed`, `/browse`, `/search`, deal detail — `CountdownChip` → `formatExpiresIn` | `"Expires in 2h 14m"` | **Correct as-is — a duration** |
| `/notifications` — `NotificationRow` → `relativeAge` | `"2m"`, `"1h"`, `"1d"` | **Correct as-is — a duration** |
| `/you/rewards` — `relativeAgo`, `formatArrivalDuration` | `"3h ago"`, arrival gap | **Correct as-is — a duration** |
| `/you`, `/profile`, `/shops/[id]`, `/tickets`, `/deals/[id]`, `/qr/[token]` | No time render at all | Nothing to convert |
| `(shopper)` `toLocaleString("en-KE")` hits | **Money**, not time | Out of scope |

**A duration has no timezone.** `expiresAt.getTime() - now.getTime()` is the same
number of milliseconds wherever the process runs. Routing those through
`claim-ticket-time` would change nothing at best, and at worst would mean
forking a formatter — which is how D203 happened, exactly as the brief warns.

**The real defect exists, but not on a shopper surface.** `friendlyTime()` in
`lib/ui.ts` *is* server-timezone, and its day-word comparison uses
`toDateString()` — so between 21:00 and 24:00 EAT it names the wrong day. Its
ten call sites are all merchant, admin and agent screens, including
`/merchant/wallet`, where a merchant reconciles their own money. Recorded as **D208**, not fixed:
merchant surfaces are PR 3's, `/admin` is frozen.

**Nothing was converted. No formatter was forked.**

---

## 3. S2 — a failed read rendering as an empty list

Found on `/my-deals`, on both reads, in the sharpest possible place.

```ts
const { data } = await service.from("redemptions")...   // error DISCARDED
const rows = (data ?? []) as ...                        // failure → []
```

The error was never destructured. A transient PostgREST error produced
`rows = []`, and the page rendered **"No claimed deals yet."** That list is where
a shopper keeps the codes they redeem at a counter. A shopper told they hold no
tickets does not walk to the shop — so the read failure becomes a missed
redemption, a merchant who never sees them, and a KES 30 success fee that never
happens. The saved-shops tab had the same shape, inviting the shopper to go and
save a shop they may already have saved.

**Fix.** `lib/shopper-read-state.ts` — `listReadState()` returns
`failed | empty | ready` from the whole `{ data, error }`, because coalescing is
the bug: after `data ?? []` no later check can recover the difference.
`listReadRows()` returns `[]` on error so a partial result is never rendered as
a whole list. Both `/my-deals` reads use them, and each empty state is now
gated behind its own read state with the failure branch first.

Mirrors `MetricValue<T>` (`merchant-owner-stats.ts`) and the three-state
labelling in `claims-window.ts` rather than inventing a fourth vocabulary.

---

## 4. S3 — the silent absent-Navigate state

`shopNavigationTarget()` returns `null` when a shop has neither a what3words
address nor coordinates, and both call sites rendered `{navigate ? (…) : null}` —
no route, no explanation. A shopper holding a live code for a shop they cannot
find gets silence, which reads as a broken screen rather than an incomplete shop
record.

Both surfaces now state it: *"This shop hasn't shared a map location yet — use
the floor and unit above to find it, or ask at the mall information desk."*

No fabricated destination and no map centred on the mall — either would send
someone confidently to the wrong place, which is worse than saying nothing. The
copy is asserted to contain no URL, no `lat=`/`lng=`, and not to call a missing
shop location an "error": it is a gap in the shop's record, not a failure of
this screen, so telling the shopper to retry would be a lie.

---

## 5. Proof

Every fix mutation-proven — and **one mutant exposed a weak guard of my own**.

| Mutant | Result |
|---|---|
| `listReadState` loses its error branch (two-state again) | ❌ 2 tests fail |
| `/my-deals` reverts to `?? []` | ❌ 1 test fails — **only after the guard was strengthened** |
| `/shops/[id]` reverts to the silent `: null` | ❌ 1 test fails |

The second mutant **passed first time.** The guard asserted
`not.toMatch(/\(data \?\? \[\]\)/)` — the *old variable name* — so renaming the
read to `ticketsRead` and writing `ticketsRead.data ?? []` reintroduced the exact
defect with the suite still green. That is the D182 failure the brief names: a
guard that checks a spelling instead of a rule. Rewritten to forbid `.data ?? []`
under any name and to require both reads to go through the helper, then
re-mutated and confirmed failing.

The behavioural tests force the failure directly rather than grepping for it,
and the assertion that matters is the asymmetry: `state(failed) !== state(empty)`.

---

## 6. Commands run, and what they printed

| Command | Result |
|---|---|
| `npm run lint` | ✅ `No ESLint warnings or errors` |
| `npx tsc --noEmit` | ✅ exit 0, no output |
| `npm test` (vitest) | ✅ **1383 passed, 152 files** (from 1366 — 17 new) |
| `npm run build` + 3 chained gates | ✅ `check-tokens: clean` · `check-canonicals: clean — 16 marketing routes` · `check-server-forms: clean` |
| `make db-verify` / SQL suites | **Not executed — not passing, not failing.** No SQL is in scope; this PR changes no migration and no `supabase/tests` file. |

---

## 7. Deliberately not done

- **No copy inviting a shopper to scan the counter QR.** Deferred pending Shopper 01.
- **No queue position, wait estimate or shopper-facing queue view.**
- **`fast_visit_enabled` untouched**; no Fast Visit surface un-darkened.
- **The `/qr/[token]` `fastVisitEligible` hardcode left alone** — harmless while the flag is off, belongs with the flag flip.
- **Discovery untouched** — `/feed`, `/browse`, `/map`, `/search` unchanged, as they have been all window.
- **`/admin` untouched** — the founder's fee-aggregation ruling (PR 5's D208). **`friendlyTime` not fixed** — this branch's D208. **`frames.json` not amended** — D209 — classifying a dark surface as `gated` vs `design-ahead` is a founder call, not a guess.
- **D187's ~60-screen read-failure sweep not attempted.** S2 covers the shopper surfaces in scope and stops.

## 8. Frozen rules honoured

No production mutation · no migration · no `app_config` write · keypad money path
untouched · no amber added, no money coloured, no celebration · every new state is
word-first and readable in greyscale.
