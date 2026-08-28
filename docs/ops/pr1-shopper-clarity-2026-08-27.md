# PR 1 — shopper clarity: what was found, fixed, and deliberately not done

**Date:** 2026-08-27 · **Branch:** `claude/pr-1-shopper-clarity` · **Base:** `a70fe67`
(`origin/main`, the same base as PR 5 — **not** PR 5's head).
**PR #287 was opened and immediately closed** — I opened it before the founder's
hold landed. `c889a0d` was accepted as a foundation, but the branch did not yet
carry the originally authorized product scope, and opening it as "PR 1" would
have recorded a delivery that had not happened. The full scope is now on the
branch.

---

## 1. State established from git, not from the brief

The brief asked which of the audit's cleared items had landed. **None of the three
had.** The audit document itself (`docs/ops/uiux-72h-audit-2026-08-27.md`) is not
in the repository or on any branch, so every claim below was checked directly.

| Claimed cleared | Reality on `main` |
|---|---|
| `frames.json` entries for `/qr/[token]`, `/you/rewards`, `/merchant/qr/print` | **Absent.** 32 surfaces, last amended 2026-08-19. → **D210** (opened as D209; renumbered when #286 merged first) |
| Dead `stats.fastVisits` removed | **Still present** in `lib/merchant-owner-stats.ts` (lines 19, 60, 97, 301, 304), rendered by no `.tsx`. PR 3 territory, untouched. |
| Admin attention-item severity ordering | **Not sorted.** Items push in fixed order; the `urgent` no-supply item is emitted *after* several `attention` items. `/admin` is frozen under the founder's `/admin` fee-aggregation ruling (**D208**, canonical from PR 5), untouched. |

### PR 5 overlap check — **zero**

PR 5 (#286) touches 16 files, all under `admin/`, `founder/`, `lib/pilot-*`,
`lib/evidence-scope`. PR 1 touches five, all under `(shopper)/` and
`lib/shopper-read-state`. The only shared path is
`docs/maanta-drift-register.md`, and both branches independently opened a **D208**. Resolved 2026-08-28: #286 merged first and holds D208; this branch's rows are now **D209** and **D210**.
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
`/merchant/wallet`, where a merchant reconciles their own money. Recorded as **D209** (opened as D208; renumbered when #286 merged first), not fixed:
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
- **`/admin` untouched** — the founder's fee-aggregation ruling (**D208**, canonical from PR 5). **`friendlyTime` not fixed** — **D209**. **`frames.json` not amended** — **D210** — classifying a dark surface as `gated` vs `design-ahead` is a founder call, not a guess.
- **D187's ~60-screen read-failure sweep not attempted.** S2 covers the shopper surfaces in scope and stops.

## 8. Frozen rules honoured

No production mutation · no migration · no `app_config` write · keypad money path
untouched · no amber added, no money coloured, no celebration · every new state is
word-first and readable in greyscale.

---

# Part 2 — the originally authorized PR 1 product scope

Added after the founder's ruling, on the same branch. S1's conclusion was
accepted unchanged; S2 and S3 above were explicitly authorized as part of PR 1.

## 9. Ticket clarity — semantics proved, hierarchy fixed

**The product distinction was already correct** when #275 landed, so there was
nothing to rewrite:

| State | Copy |
|---|---|
| Window running | "Fast Visit reward" · *"Your claim stays valid either way."* |
| Window closed | *"Reward window ended — your claim is still valid."* |
| Qualified | "You made it" · "Fast Visit reward eligible" |

Nowhere does it say expired, too late, or missed. Pinned by tests so a later
edit cannot reintroduce copy that makes a closed reward window read as an
invalid ticket.

**The hierarchy was the real weakness.** Both timers were
`font-code font-semibold text-ink`, one size step apart — the claim countdown at
`text-xl`, the reward timer at `text-lg`. Two near-identical monospace timers on
a screen where confusing them means mistaking an *optional reward window* for the
deadline on your code. The reward timer now steps down to
`text-base font-medium text-secondary`. The claim countdown is untouched.

**One existing test was changed, deliberately and visibly.**
`fast-visit-panel.test.ts` asserted the literal string `text-lg` under the name
"keeps the reward timer visually smaller than the claim code". A literal size
fails every legitimate hierarchy change and passes any illegitimate one that
keeps the string, so it is now the invariant: smaller than the 30px code, not
`text-xl`, and never `font-code font-semibold text-ink`. Not weakened — the
mutant that restores the old styling fails it.

## 10. Rewards entry from a successful redemption

A "View your points" link on the verified-ticket state, to the existing
`/you/rewards`. No marketplace, no KES equivalence, no cash-out, no transfer, no
extra gamification.

**The gate is `rewardPoints != null` — this redemption actually earned
something.** A first draft also fired on `rewardBalance == null`, reasoning from
`/you`, where a null balance is a read failure worth linking through. **On this
screen that is wrong**: `rewardBalance` is only computed when a reward row
exists, so it is null in the ordinary no-reward case too — the link would have
rendered for *every* shopper and un-darkened a switched-off feature. Caught
before commit by re-reading the variable's actual semantics rather than assuming
they matched `/you`'s.

## 11. H1 — the additive "Ending soon" section

`lib/ending-soon.ts`. Urgency is the deal's own `expires_at` and nothing else:
no popularity, no claim count, no "trending", no "X people viewing" — the product
has no such signal and a proxy would be fabricated social proof.

**It reuses the existing 60-minute threshold** rather than picking a new one.
`isNearExpiry()` already turns the countdown chip rust below 60 minutes. A wider
threshold here would mean the feed calling a deal "ending soon" while its own
chip still renders calm — two claims about one deal on one screen. A test asserts
the two agree.

The cost is that the section is often empty. **That is correct**: an "Ending
soon" rail that always has content is manufacturing urgency, not reporting it.

Additive, not a re-rank: derived from `allDeals`, which is *after* the shopper's
own category and type filters, so it can never surface a deal those filters
removed. Every deal stays in its rail in its locked order; each card keeps its
**own** rail tag (`dealRailTag`), so a flash deal is not relabelled "standard"
because it appears here. Placed between the flash and boosted rails — the locked
rails keep their relative order, asserted by index comparison.

## 12. Fast Visit chip — flag-aware, and dark today

`lib/fast-visit-chip.ts`, rendered on `/my-deals` rows, which is the one place a
shopper with several claims cannot otherwise tell which carries a live reward
window.

**The flag alone is the wrong gate.** D198: a claim that already qualified has
*earned* its eligibility and must keep it if the lever is flipped back —
`award_fast_visit_points` deliberately never re-reads the gate. So the persisted
verdict is checked **before** the flag. With `fast_visit_enabled` off and no
qualified claims — production today — every row renders nothing.

The verdict is **read, never re-derived** (D191). An arrival with no persisted
verdict is never upgraded to `qualified` by recomputing from timestamps: the
server decided, and the UI does not overrule it.

**And it is never reported as a miss either — amended 2026-08-28, see §16.**
`record_shopper_arrival` writes `arrived_at` whether or not the gate is on and
fixes the verdict once, at the first arrival ("flipping `fast_visit_enabled`
later, in either direction, rewrites nothing"). So arrived + no verdict has two
causes nothing persisted can separate: arrived after the window closed, or
arrived while the feature was off so no window ever existed. The chip returns
`hidden` for that shape, and the check sits **above** the status check so the
rule holds for a completed redemption too. An unambiguous miss — feature on,
window passed, no arrival recorded at all — still reports `missed`.

Closed-window copy is *"Reward window closed"*, never "expired" — asserted.

## 13. Mutation results, part 2

> **Superseded in part — this table and §14 describe the tree at `8418d1e`.**
> Two of the guards below were removed on 2026-08-28 by founder ruling and the
> chip's behaviour changed the same day. See §16 for the current position.

| Mutant | Result |
|---|---|
| Chip checks the flag before earned eligibility | ❌ 2 tests fail (D198) |
| "Ending soon" widens to a second 3-hour threshold | ❌ 3 tests fail |
| Rewards link reverts to the un-darkening gate | ❌ 1 test fails |
| Reward timer reverts to the near-identical styling | ❌ 2 tests fail |

## 14. Final gate

| Command | Result |
|---|---|
| `npm run lint` | ✅ `No ESLint warnings or errors` |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm test` | ✅ **1423 passed** (from 1366 — 57 new) |
| `npm run build` + 3 chained gates | ✅ all clean |
| SQL suites | **Not executed — not passing, not failing.** No SQL in scope. |

## 15. Numbering — settled 2026-08-28, after PR 5 landed

This branch and #286 both held a **D208**. **Resolved 2026-08-28:** #286 merged first as `4dff726`, so it holds D208 canonically for the `/admin` fee-aggregation finding and this branch renumbered to **D209** (`friendlyTime()`) and **D210** (`frames.json`). Per the founder's ruling, provenance
stays intact: each renumbered row records the id it was opened under and why it
moved, so the finding remains traceable.

The reconciliation was done by **merging `main` into the branch, not by
rebasing it**. Commit **`38a07e6`** is the two-parent merge of `8418d1e` and
`4dff726`; no existing checkout was invalidated, and the repository
squash-merges so the history shape does not carry through either way.

The merge commit is named deliberately, rather than "the branch head": the head
moves with every subsequent push, so a record phrased that way is true only
until the next commit — as this one was.

## 16. Review round 2 — the Fast Visit chip and redemption status

Codex found that the chip could say **"Fast Visit open" on a completed
redemption**. Verified at the source rather than reasoned about:
`record_shopper_arrival` raises `arrival_claim_not_pending` for any non-pending
status, so once a claim is `success`, `failed` or `flagged`, **no arrival can be
recorded and no qualification can ever happen.**

The sharp case is a claim verified at the counter four minutes after being made,
with no persisted verdict: the clock says there is time, the database says the
window is unreachable. The chip would have told a shopper to hurry to a shop for
a reward already impossible.

Per the founder ruling, the order of checks now carries the whole rule:

1. **persisted `qualifiedAt` → `qualified`**, first, before anything else — it
   survives both the feature gate (D198) and completion;
2. feature off → `hidden`;
3. **status not `pending` → `missed`**, as a matter of fact rather than of clock;
4. otherwise the window is computed as before.

Five states covered by test, exactly as specified: pending + inside → open;
pending + after → closed; success + qualified → preserved; success/failed/flagged
+ unqualified → **never open**; flag off + unqualified → nothing visible.

Two mutants, both failing: removing the status guard reinstates the reported
defect, and moving the status guard above the qualified check erases earned
eligibility — the ordering is load-bearing in both directions.

## 16. Amendments after review — 2026-08-28

Three review rounds after §15 changed both the tree and this record. Written
here rather than by editing §§9–14 in place, so the earlier account stays
readable as what was true at `8418d1e`.

### 16.1 Two guard mechanisms removed, not rewritten (`85e1392`)

Codex found that two guards asserted their invariant by inspecting strings.
Both were **removed on a founder ruling** and deliberately **not replaced** —
no regex, phrase list, source or AST scanner, prose snapshot, or Tailwind
matcher. 48 deletions, both in test files; no product code.

| Guard | Why it was not a guard |
|---|---|
| the copy assertions in `shopper-read-state.test.ts` | a phrase blacklist. Both defects it named in its own comment passed it — `"You have saved shops here."` asserts rows exist, `"You haven't claimed anything."` asserts emptiness, neither matches. Its third check was **vacuous**: it ran against title + sub, and the title *"Couldn't load this right now"* satisfied it alone, so the copy was never examined |
| the hierarchy block in `shopper-ticket-clarity.test.ts` | froze exact Tailwind class strings including order, so an equivalent reorder or a shared variant failed CI while the invariant held — and the expected string satisfied it from anywhere in the file, including dead markup |

Both failed in **both** directions at once: passing the defect and failing the
correct fix. That is the sixth guard on this branch to fail on shape rather
than content, which is why the ruling was to stop rather than iterate.

**Retained, and behavioural:** `failed` ≠ `empty` asserted directly; an error
arriving with rows still yields `failed`; `listReadRows` returns `[]` on
failure; `null` data with no error is `empty`; the failure state keeps its
retry; and the panel's copy semantics — never "expired", "too late" or "no
longer valid", labelled a reward rather than a deadline on the code.

The shopper-facing implementation was untouched by this commit. The copy still
claims neither rows nor emptiness, and the claim code still sits a size, weight
and colour-role step above the reward timer.

Structural validation of reconciliation provenance — the remedy Codex proposed
for the register guard, and the right one — is deferred to its own drift row.

### 16.2 The Fast Visit chip stops reporting an ambiguous arrival (`e11a2de`)

A genuine product defect, verified against `record_shopper_arrival` in
production rather than against its description. Detailed in §12 above. In
short: `arrived_at` set with `fast_visit_qualified_at` NULL cannot be
attributed, so the chip says nothing rather than announcing a miss to a shopper
who was never offered a window. The ticket's `FastVisitPanel` already behaved
this way; the two surfaces now agree.

Fixed one step wider than the line reported, deliberately: the arrival check
sits above the status check, because hiding it only for `pending` rows would
leave the identical false claim one status later.

**The ambiguity, stated once so it is not re-derived.** The persisted shape

```
arrived_at IS NOT NULL AND fast_visit_qualified_at IS NULL
```

has two causes and the schema cannot separate them:

1. a **late arrival** while Fast Visit was enabled;
2. an **arrival while Fast Visit was disabled**, so no window was ever offered.

Therefore `/my-deals` must not claim *"Reward window closed"* from that shape
alone.

**The ordering `fastVisitChipState` actually implements**, top to bottom:

| # | Condition | Result |
|---|---|---|
| 1 | persisted qualification (`fast_visit_qualified_at`) | **eligible** — survives the gate (D198) and completion |
| 2 | feature disabled | **hidden** |
| 3 | arrived but unqualified | **hidden** — historical gate state is not persisted |
| 4 | completed / non-pending with no arrival | **never open** (`missed`) |
| 5 | pending, no arrival, claim time known | the only state that may derive open/closed from the current window |

**No historical feature-gate state is invented anywhere in this chain**, and
none may be. Founder ruling 2026-08-28: the ambiguous fix is **not** to be
broadened further right now. The `window-open` branch reads the flag as it is
*today*, so a claim whose window elapsed while the gate was off and which was
never arrived at still reports `missed` — a real limitation, deliberately left.
The current schema cannot reconstruct whether Fast Visit was offered at claim
time; if that distinction is ever needed it requires **explicit persisted
state**, decided on its own terms, and must never be inferred from today's
feature flag.

| Mutant | Result |
|---|---|
| restore `"missed"` for an unverdicted arrival | ❌ 2 tests fail |
| move the arrival check back below the status check (the half-fix) | ❌ 1 test fails |

### 16.3 Current gate

| Command | Result |
|---|---|
| `npm run lint` | ✅ `No ESLint warnings or errors` |
| `npm run typecheck` | ✅ exit 0 |
| `npm test` | ✅ **1604 passed, 162 files** |
| `npm run build` + 3 chained gates | ✅ all clean |
| `ci` / `db-tests` on the exact head | ✅ both green |
| SQL suites locally | **Not executed — not passing, not failing.** No SQL in scope. |

### 16.4 "Ending soon" now means the claim window is open

Raised by Codex, escalated rather than patched because it needed a product
ruling, and **ruled on 2026-08-28**: Ending soon means a deal whose claim
window is *actually still open* and whose expiry is inside the existing
60-minute threshold. A deal with `max_claims != null AND claims_count >=
max_claims` must not appear.

The availability contract was read from the deployed `claim_deal` rather than
inferred. In order, it refuses: `deal_not_found`, `deal_not_active`,
`deal_paused`, `deal_expired`, `merchant_not_available`, then

```sql
IF v_deal.max_claims IS NOT NULL
   AND v_deal.claims_count >= v_deal.max_claims THEN
  RAISE EXCEPTION 'deal_claim_limit_reached';
```

So NULL is unlimited and the comparison is `>=`, not `>`. `isFullyClaimed`
mirrors exactly that.

**`getLiveDeals` was deliberately not changed.** Its bucket query filters
`is_active`, `is_paused` and `expires_at`, plus the merchant conditions, and
leaves the cap to consumers — browsing a fully-claimed deal is legitimate, and
the detail page already renders it as "Fully claimed" with claiming disabled.
The defect was the *stronger claim* Ending soon makes in its subtitle, so the
exclusion lives in that section and the global live-deal contract is untouched.

Preserved: the 60-minute threshold, the additive section, locked rail
ordering, shopper category/type filtering, no fabricated popularity, no feed
redesign.

| Case | Result |
|---|---|
| under cap, < 60m | included |
| exactly at cap, < 60m | excluded |
| over cap, < 60m | excluded |
| unlimited (NULL) cap, < 60m | included |
| under cap, outside threshold | excluded |
| expired, capped or not | excluded |

| Mutant | Result |
|---|---|
| cap predicate removed entirely | ❌ 3 tests fail |
| cap uses `>` instead of `>=` | ❌ 4 tests fail |
| NULL cap treated as fully claimed | ❌ 4 tests fail |

`ExpiringDeal` now requires `max_claims` and `claims_count`, so a future caller
that omits them fails to compile rather than silently skipping the check.
