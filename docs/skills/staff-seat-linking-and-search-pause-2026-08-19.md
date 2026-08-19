# Skill — staff-seat linking, the `/search` pause filter, and what the 2026-08-19 audit got wrong

Session mode: **Builder**. Date: **2026-08-19**. Repo at `main @ 5040acd`.
Production read live throughout: Supabase `axrrslqssmbngbataejg`, Vercel
`maanta-nuia`.

Two behaviour fixes shipped, three documents corrected, one formula written down
for the first time, and seven tier-2 findings opened as founder-owned register
rows. This file is the durable record; the register is the state.

---

## 1. The one that matters — `users.phone` was NULL for every real user

### The shape of the defect

`ensureAppUserFromClerk` looked up `public.users` by `clerk_user_id` and
**returned immediately** when a row existed. `phone` was only ever written on the
insert path. Compose that with **D126**'s verified-only rule and the failure is
structural rather than accidental:

1. A shopper signs up by **email**. Clerk holds no verified phone at that moment,
   so `verifiedPrimaryPhone` correctly returns `null` and the column is written
   `NULL`.
2. They later verify a phone — because `POST /api/redemptions` requires one to
   claim. Clerk now holds it.
3. Nothing ever writes it to `public.users`. The lookup returns early.
4. `getMerchantContext` links a pre-invited `merchant_staff` seat behind
   `if (!staff && user.phone)`. `NULL` short-circuits the branch.

So the shop assistant you invited by phone signs in, verifies their number to get
past the claim gate, and lands as an ordinary shopper. No verify keypad. **No
error, no log, no state anywhere that says a link was attempted and failed.**

### What production said

| Read (2026-08-19) | Result |
|---|---|
| real `users` rows | **10** |
| of those, `phone` not null | **0** |
| `merchant_staff` rows on a real merchant | **0** (both existing rows sit on demo merchants) |
| real merchants | **1** — SKANDI SKAN, with no staff seat |

That last line is the important one: **this code path had never once run against
real data.** Every rehearsal that "worked" worked on demo rows.

### Why this was not a re-report

Three closed rows had already hardened this exact path, from three angles:

- **D124** froze `users.phone` against self-writes (a self-written phone is the
  primitive behind a staff-seat hijack).
- **D126** made provisioning write only a Clerk-**verified** primary phone.
- **D127** canonicalised the *invite* side, so two spellings of one number
  collide instead of creating a seat that can never link.

All three are about the *quality* of the two values being compared. None of them
notices that one side is empty. **D129** is that.

### The fix, and the three decisions inside it

The write stays in one place — `auth.ts` — because a second writer of an
access-control column is a second place to drift.

1. **NULL-only, never an overwrite.** The column is an access-control input that
   D124 froze against its own holder. A change of number is an identity event
   that belongs to an admin, not to a sign-in. The update carries
   `.is("phone", null)` so a race leaves one winner and the loser keeps the row
   it read.
2. **Canonicalised through `normalizeStaffPhone`** — the same function the invite
   route stores the other side with. It is a no-op for every well-formed E.164
   Clerk actually returns, and that is the point: D127 closed by noting the link
   had worked "by luck, not by contract", and one shared canonicaliser is what
   removes the luck. A number it cannot canonicalise passes through unchanged
   rather than being dropped — an un-normalizable value could never match a
   normalised invite row anyway, so nulling it would lose an admin's contact
   detail and buy nothing.
3. **Attempted only when the caller asked for `phone`.** `ensureAppUser("id")` is
   on the claim, favourites, push and `/me` paths; `getAppUser` — the only caller
   that can act on the column — asks for it. Gating there keeps a Clerk Backend
   API round trip off the hot paths for the phone-less majority, which today is
   100% of real users. Dropping `phone` from `getAppUser` would disable the
   backfill, but it would break staff linking outright either way, so the gate
   adds no new failure mode; the coupling is pinned by a test.

Checked and recorded rather than assumed:

- `createServiceClient()` runs as `service_role`, and
  `prevent_identity_self_change()` permits `service_role` and `admin` — trigger
  body read back from production, not inferred from the migration.
- `users_phone_key` is a plain `UNIQUE (phone)`. A collision returns an **error
  and no row**, not zero rows, so the code branches on the error explicitly and
  degrades to the un-backfilled row. It logs the error **code only** — never the
  number (**D85**'s lesson).

### The guard, and proving it is worth something

Three test files, deliberately layered:

| File | What it pins | Passes against the broken code? |
|---|---|---|
| `phone-backfill.test.ts` | the write itself: unverified stays NULL, no write when already set, the race, the collision, canonicalisation, no Clerk call when `phone` was not requested | no |
| `merchant-staff-linking.test.ts` | `getMerchantContext`'s branch in isolation | **yes** — and its header says so |
| `staff-seat-linking-chain.test.ts` | the real `ensureAppUser` → `getAppUser` → `getMerchantContext` chain against an in-memory store shaped like production | no |

The middle row is the trap worth naming. A `getMerchantContext` test alone
*looks* like a consequence guard and is vacuous for this fix, because the defect
is upstream of it. The chain test is the real one, and it was proven by reverting
the backfill and watching it go red — then restored and watched go green.

**No data migration.** There is no real staff row to backfill, and every affected
user self-heals on their next signed-in request once Clerk holds a verified
number.

---

## 2. `/search` now filters paused deals (D119, closed)

Already diagnosed on 2026-08-18; this session implemented it. Both selects in
`src/app/(shopper)/search/page.tsx` now carry `.eq("is_paused", false)`, matching
`selectLiveDealBucket`.

The guard is **behavioural, not a source grep**. `search-paused-filter.test.ts`
executes the page against a stubbed client and records the filters each query
actually applies — title match, shop-name match, and the type-only search the two
`/feed` rails link into. That distinction matters here specifically: the page
issues *two* selects, and a regex over the file cannot tell you that both of them
got the predicate. Proven non-vacuous by removing one predicate and watching
three of four cases fail.

One correction to D119's own text, made rather than left for the next reader: it
describes the first select as "the title/description query". The file has never
matched `description`. That wider gap is now **D131**.

---

## 3. Documentation corrections

**The `unknown` fee path writes no ledger row (D130).** `verify_redemption` wraps
the fee call in `BEGIN … EXCEPTION WHEN OTHERS THEN v_fee_status := 'unknown'`,
and that handler writes **only** a `fraud_review` `agent_tasks` row whose own
message says the fee "was neither charged nor recorded as arrears". Three repo
documents presented a two-outcome model — including
`maanta-production-rollout-plan.md` telling an operator to validate "one real
redemption is exactly one fee ledger entry" against production, a check that
fails legitimately on that path. All three corrected, with the three-outcome
table stated once in `payments-rails.md` and referenced from the others. **The
Notion pages carry the same wording; that correction is owed operations-side and
cannot be made from the repo.**

**The trust formula, written down for the first time.** Added to
`redemption-disputes.md` from a production `pg_get_functiondef` read-back:
`(0.5×R)+(0.3×A)−(0.2×F)`, clamped to [0,1]; `is_visible = false` below 0.50;
`is_featured = true` above 0.90; a high-priority `retraining` task on the *first*
crossing below 0.50; `pending` redemptions excluded from R and F because the
function counts terminal states only.

---

## 4. Tier 2 — investigated, not implemented

Seven new rows, all founder-owned, plus one widened. Every one carries
`path:line` or a live read-back, and either a named guard or a reason there is
none.

| Row | Finding | Why it is a ruling, not a cleanup |
|---|---|---|
| **D128** (widened) | `authenticated` holds full DML on **six** tables, not one — `users`, `fee_reversals`, `guardian_events`, `merchant_favourites`, `merchant_staff`, `notifications`; **no migration grants or revokes anything on `public.users`** | Codifying production's `TRUNCATE`/`DELETE` is not obviously right even behind RLS |
| **D131** | Search matches title and shop name only; three specs say merchant name, item, title, description or category | A `%q%` ilike over `description` changes result quality and cost; category matches nothing today (D122) |
| **D132** | Three `SECURITY DEFINER` views exist against Notion's D-002 ban | **The two browse views are already a documented exception** — see below. Only `demo_data_census` is uncovered |
| **D133** | `recalculate_trust_metric` unconditionally overwrites `is_featured`, silently reverting an admin's Feature action that `admin_ops_log` recorded | Placement is what Elite merchants pay KES 500/24h to influence — commercial, not just engineering |
| **D134** | 5 expired `pending` redemptions (3 real, expired 2026-08-14/15) are never swept; no cron job, no trigger | Choosing `failed` retroactively moves merchant trust for something no merchant did |
| **D135** | A real-tagged KES 300 ledger row belongs to a **demo** merchant, so every `is_demo = false` money figure over-reports by KES 300 | Do not correct production data from a session; the fix is a constraint |
| **D136** | "One claim per phone per day" is a frozen rule with **no implementation anywhere** | Per user or per phone? Does an abandoned claim consume the day? Which timezone? Each answer changes the code |
| **D137** | The authority order ranks `PROJECT_RULES` at position 2; no such file exists, and `CLAUDE.md`'s source-of-truth section is a different framing entirely | Creating it makes a fourth place for a rule to drift; dropping it amends a founder ruling |

---

## 5. What did not reproduce

Recorded because it means the audit that produced this work was wrong somewhere,
and that is more useful than the fixes.

1. **No repo doc calls the trust formula "proposed" or "future work".** The task
   asked for corrections to such wording. A search of every `.md` in the tree for
   the formula, its thresholds, and proposed/future/planned phrasing near "trust"
   returns nothing. The formula is not mis-described — **it is not described at
   all**, in any repo document. Absence is not drift, so no row was opened;
   instead the live formula is now documented in `redemption-disputes.md`.

2. **The `SECURITY DEFINER` view question is already ruled for the two views that
   matter.** `docs/maanta-decisions-log.md`, 2026-07-23: *"Public browse views run
   with `security_invoker = false` by design … an accepted, documented trade-off,
   not a defect."* The framing that a ruling is owed for `deals_public_browse` and
   `merchants_public_browse` is a month out of date. The genuinely uncovered view
   is `demo_data_census`, which no entry names — that, and reconciling Notion's
   D-002 with the repo's exception, is what **D132** asks for.

3. **There is no admin visibility override to revert.** The claim was that
   `recalculate_trust_metric` reverts an admin's `is_visible` override. A grep of
   `src/` finds **no write to `is_visible` anywhere** — the admin console offers
   `feature`/`unfeature` (`is_featured`), `shadow-ban`/`unban`
   (`is_shadow_banned`) and suspend/reactivate (`status`). The conflict is real
   but narrower: it is `is_featured` only. **D133** is written to the narrower,
   true version.

4. **The D59 evidence is not new.** Production serving `pk_live_…` /
   `clerk.maanta.app` was the exact read-back that **closed D99 on 2026-08-16**.
   Re-measuring it on 2026-08-19 confirms it still holds and is worth recording,
   but "D99's development-instance reading no longer reproduces" restates D99's
   own closure rather than adding to it. D59's founder question is untouched by
   it, and the wording that is actually wrong is a frozen decisions-log entry,
   which a session does not get to edit.

5. **Two small imprecisions in the tier-2 findings, corrected in the rows.**
   `merchant_staff` has no `is_demo` column, so "zero real `merchant_staff` rows"
   is only meaningful via the merchant join (both rows sit on demo merchants).
   And the KES 300 ledger row's `transaction_type` is `topup` —
   `node0_opening_credit` is a token inside its `description`, not a type.

---

## 6. Verification

Everything below was run in this session and is reported as it came back.

| Check | Result |
|---|---|
| `npm run lint` | ✅ No ESLint warnings or errors |
| `npm run typecheck` | ✅ clean |
| `npm test` | ✅ **946 passed, 111 files** (baseline at `5040acd`: 930 / 107) |
| `npm run build` | ✅ exit 0, with all three post-build gates: `check:tokens` clean over 48 rendered files and 425 chunks, `check:canonicals` clean over 16 marketing routes, `check:forms` clean |
| `make db-verify` | **not run — not applicable.** No file under `supabase/migrations/` or `supabase/tests/` was touched by this session |

**No migration was written and none was applied.** Everything shipped here is
application code and documentation.

---

## 7. For the next session

- **D129 is closed but unproven against a real staff seat**, because production
  has none. The first real staff invite at BBS Mall is the live test: invite by
  phone, have the person sign in and verify, and confirm the verify keypad
  appears. If it does not, read `public.users.phone` for their row first.
- **Do not add a second writer to `users.phone`.** Both writers go through
  `verifiedPrimaryPhone`. That is the whole trust chain `getMerchantContext`
  relies on, and its comment now says so.
- Seven founder rulings are queued in D131–D137. **D136** (the daily claim limit)
  is the one with product consequences at the counter; **D135** (the demo-tagged
  ledger row) is the one that silently corrupts a number in every report.
