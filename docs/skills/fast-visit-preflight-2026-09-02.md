# Fast Visit reward path — preflight findings (2026-09-02)

**Mode:** Node 0 Field Validation. Verification engineer session. **Investigation
only — no code, migration, config or branch was changed.**
`app_config.fast_visit_enabled` was not read from or written to production; the
gate is treated throughout as `false`, per the founder's statement.

**Repository state examined:** local branch `claude/fast-visit-investigation-6lve1f`
at `7e59410`, which is byte-identical to `origin/main` at `7e59410`
("Close D169 on verified production reconciliation (#299)"). Verified by
`git fetch origin main` followed by `git log --oneline origin/main..HEAD` → 0
commits. Every citation below is `path:line` on that tree.

The database layer (`record_shopper_arrival`, `award_fast_visit_points`,
`verify_redemption`, `reward_events`, grants, and the 401/405 `claimed_at IS NULL`
census) was verified directly by the founder and is **taken as given, not
re-derived**. This document answers only the application-, UI-, docs- and
branch-level questions, and cites SQL only where the application answer depends
on a specific line.

---

## Verdict

**Under real counter behaviour, can the Fast Visit reward fire at all? No.**

Two independent reasons, either of which is sufficient. First, today: the gate is
`false`, and `record_shopper_arrival` reads it at arrival and only then writes
`redemptions.fast_visit_qualified_at`
(`maanta-app/supabase/migrations/20260826120000_fast_visit_points.sql:155`). Since
`award_fast_visit_points` requires that persisted verdict and never re-derives it
(same file, `:353`–`:358`), zero awards are reachable while the flag is off, and
no later flip can retro-qualify an arrival made now. Second, and the reason that
survives a flag flip: nothing in the shipped counter flow makes the shopper scan
before staff verify. The keypad renders unconditionally for anyone with
`can_verify` (`maanta-app/src/app/merchant/(app)/redeem/page.tsx:77-81`), the
queue panel renders **nothing at all** when empty
(`maanta-app/src/app/merchant/(app)/redeem/queue-panel.tsx:156`), and the printed
sheet — the only physical instruction that exists — actively decouples the two
acts: *"Staff will verify your deal separately."*
(`maanta-app/src/app/merchant/(app)/qr/print/page.tsx:97`). The ordinary counter
act is therefore verify-first, and verify-first is terminal: once `status` flips
to `success`, `record_shopper_arrival` raises `arrival_claim_not_pending`, no
`arrived_at` and no verdict are ever written, and because the verdict is
first-arrival-only and immutable, that redemption's reward is permanently
unreachable — no retry, no self-heal and no later scan can recover it. On top of
that, **no document any merchant, counter employee, field operator or shopper
carries mentions the counter QR, arrival check-in, the till queue, or Fast Visit
at all** (Q7). So the only path that can fire the reward — shopper scans a wall
sticker within 15 minutes of claiming, *before* reaching the till — is a path
nobody at Node 0 has been told exists. Flipping `fast_visit_enabled` to `true`
would not change this; it would produce arrivals whose verdicts are written only
in the minority case where a shopper happens to scan first.

---

## Q1 — Ordering

### Call sites

`record_shopper_arrival` — **exactly one** application call site:

- `maanta-app/src/app/api/qr/check-in/route.ts:185` (`POST`), on the service
  client.

`award_fast_visit_points` — **exactly three** application call sites:

- `maanta-app/src/app/api/redemptions/verify/route.ts:188` — the primary award,
  immediately after a successful `verify_redemption`.
- `maanta-app/src/app/api/redemptions/verify/route.ts:95` — the
  `redemption_already_verified` (409) repair path.
- `maanta-app/src/app/(shopper)/tickets/[id]/page.tsx:127` — the ticket success
  screen's self-heal.

No other call site exists anywhere in `src/` (grep over `*.ts`/`*.tsx`, tests
excluded). There is no cron, no scheduled job and no `vercel.json` `crons` block.

### Can staff verify before the shopper scans? Yes.

`POST /api/redemptions/verify` requires only `requireMerchant("can_verify")` and a
well-formed OTP (`route.ts:11-18`). It never reads `arrived_at`,
`fast_visit_qualified_at`, or `merchant_presentations`. The keypad that drives it
is rendered for every verifying seat, unconditionally
(`merchant/(app)/redeem/page.tsx:77-81`). The queue panel that would surface a
checked-in shopper is rendered above it but returns `null` on an empty queue
(`queue-panel.tsx:156`), so on a counter where nobody has scanned, the screen is
just a keypad. Tapping a queue row does not verify either — it only hands the
code to that same keypad in memory (`queue-panel.tsx:179`,
`publishQueueCode`). There is one money path and it does not consult arrival.

### Is the reward then permanently unreachable? Yes.

`verify_redemption` sets `redemptions.status = 'success'`. A subsequent scan calls
`record_shopper_arrival`, which requires `status = 'pending'` and raises
`arrival_claim_not_pending`; the route maps that to HTTP 409 with
`code: "claim_not_pending"` and the message *"This claim has already been
redeemed."* (`api/qr/check-in/route.ts:210-215`). Because the arrival RPC stamps
`arrived_at` and the verdict **only at the first arrival** and never rewrites
them, and because `award_fast_visit_points` requires a non-NULL verdict
(`20260826120000_fast_visit_points.sql:355`), that redemption can never earn
points — by any route, at any later time. The application code states this
explicitly at `maanta-app/src/lib/fast-visit-chip.ts:34-40`.

### Is there any UI, copy or route ordering that forces scan-before-verify?

**No — and the shipped copy states the opposite.** Quoting all of it:

- `maanta-app/src/app/merchant/(app)/qr/print/page.tsx:73-76` (merchant screen):
  > "Shoppers scan it to check in when they arrive. **You still verify their
  > 6-digit code at the counter exactly as you do now.**"
- `maanta-app/src/app/merchant/(app)/qr/print/page.tsx:94-98` (the printed sheet
  the shopper reads):
  > "Open MAANTA and scan this code to check in."
  > "**Staff will verify your deal separately.**"
- `maanta-app/src/app/merchant/(app)/qr/print/page.tsx:23-26` (the sheet's own
  rationale): *"It deliberately does NOT promise points or rewards."*
- `maanta-app/src/app/(shopper)/tickets/[id]/fast-visit-panel.tsx:98-101` — the
  strongest shopper-side nudge that exists, and it is advisory, on a screen the
  shopper reaches only by opening their ticket:
  > "Scan the MAANTA QR at the shop within the time to earn points. Your claim
  > stays valid either way."
- `maanta-app/src/app/(shopper)/you/rewards/page.tsx:71-73` (empty state):
  > "No rewards yet. Claim a deal, scan the MAANTA QR at the shop within 15
  > minutes, and have staff verify your code."

That last line is the only place in the product that states the correct order,
and it renders on a rewards page a shopper has no reason to open before their
first reward exists.

**Related observation (not a defect, recorded for the field run).** The check-in
success screen tells the shopper *"Staff will call your name."*
(`maanta-app/src/app/(shopper)/qr/[token]/qr-check-in.tsx:339`). On `main` there
is no call-forward feature: the queue panel offers only "tap to load the code"
and "Dismiss" (`queue-panel.tsx:176-201`). Staff can of course call a name aloud
— the panel shows first name + last initial — but nothing in the product prompts
them to, and no document tells them the queue exists (Q7). The software half of
call-forward lives on the unmerged `codex/queue-call-app` (Q8).

---

## Q2 — Orchestration

**Separate call, separate transaction.** `verify_redemption` is invoked on the
user-scoped client (`api/redemptions/verify/route.ts:35-45`);
`award_fast_visit_points` is a **second, independent PostgREST round trip** on the
service client (`:187-189`), issued after `verify_redemption` has already
committed. They are not in one transaction, and by design — the migration's header
says so at `20260826120000_fast_visit_points.sql:40-49`: inlining the award into
the money function was rejected because exactly-once is already guaranteed by the
`UNIQUE` reference.

**If it throws, or the request drops after verify succeeds:** the award is
skipped and **there is no retry and no queue**. What exists instead are two
opportunistic repair paths, both requiring somebody to act again:

1. **Merchant retries the same code.** `verify_redemption` answers
   `redemption_already_verified`; the 409 branch re-looks-up the most recent
   `success` under that code and re-runs the idempotent award
   (`route.ts:84-101`). Requires the counter to type the code a second time.
2. **Shopper opens the ticket.** `tickets/[id]/page.tsx:122-153` calls the award
   again on the `status === 'success'` render. Requires the shopper to reopen the
   app on that specific ticket.

If neither happens, the award is simply lost. Failure is at least visible now:
both call sites destructure and log the PostgREST error rather than relying on a
`catch` that supabase-js never fires (`verify/route.ts:190-197`;
`tickets/[id]/page.tsx:130-132` — this is closed drift D200). Nothing escalates,
alerts, or re-drives it.

**Reliability note.** Both repair paths are strictly less reliable than the
primary call, and one of them (the ticket self-heal) requires the shopper to
navigate back to a ticket whose success screen they have usually already left. In
a field run this is a silent-loss channel, not a safety net.

---

## Q3 — Identity

**One route calls `record_shopper_arrival` with a service_role client**, and its
`p_user_id` is clean.

`maanta-app/src/app/api/qr/check-in/route.ts:121` derives the user first:

```ts
const appUser = await ensureAppUser<{ id: string }>("id");
if (!appUser) return 401 sign_in_required;
```

`ensureAppUser` (`maanta-app/src/lib/auth.ts:167-174`) branches on the auth
strategy; the Clerk path (`:176-192`) reads `currentClerkUserId()` and looks up
`public.users` by `clerk_user_id`. There is no parameter by which a caller can
name a different user.

The RPC is then called with that value and nothing else from the request
(`route.ts:184-194`):

```ts
.rpc("record_shopper_arrival", {
  p_user_id: appUser.id,          // session-derived
  p_merchant_id: merchant.id,     // resolved from the scanned token, :158-169
  p_redemption_id: redemptionId,  // from the body, but re-checked by the RPC
})
```

`p_merchant_id` comes from the **token lookup**, not the body — the body's `token`
is only ever used as a `WHERE qr_token = ?` predicate (`:161`). `p_redemption_id`
is the one body-supplied value, it is shape-checked as a UUID (`:138`), and the
RPC independently enforces that the redemption belongs to `p_user_id` at
`p_merchant_id` and is pending and unexpired.

The `GET` and `DELETE` handlers on the same route are scoped the same way
(`:52`, `:92`/`:100` for GET; `:371`, `:400` for DELETE).

**No path lets the caller name the user. Nothing to report as a finding here.**

---

## Q4 — QR surface

### The URL, end to end

1. Owner-only page mints the printable sheet:
   `merchant/(app)/qr/print/page.tsx:38` redirects a non-owner; `:40-46` reads
   `qr_token` with the service client; `:61` builds
   `${publicOrigin()}/qr/${token}`; `:90` renders it **only as the QR's encoded
   value** via `<CounterQr url={url}>`. The owner dashboard does the same behind
   `if (isOwner)` (`merchant/(app)/dashboard/page.tsx:30-39`, rendered at `:190`).
2. Shopper scans → `GET /qr/<token>`
   (`maanta-app/src/app/(shopper)/qr/[token]/page.tsx`). Token shape-checked
   (`:50`), sign-in required (`:53`), merchant resolved from the token (`:56-75`),
   and **only that shopper's own pending unexpired claims at that merchant** are
   loaded (`:78-85`).
3. Client auto-checks-in on mount when there is exactly one claim
   (`qr-check-in.tsx:12-15`), POSTing to `/api/qr/check-in`.
4. Route re-resolves the merchant from the token and calls the arrival RPC
   (`api/qr/check-in/route.ts:157-194`), then writes the queue row from
   server-derived ids only (`:294-303`).

### Is `qr_token` exposed where a shopper can read it?

**No.** Every read of the column in the codebase is one of five, and none is
shopper-reachable:

| Site | Reachable by |
|---|---|
| `(shopper)/qr/[token]/page.tsx:59` | predicate only (`WHERE qr_token = <the token you already scanned>`); never selected |
| `api/qr/check-in/route.ts:71`, `:161` | predicate only; never selected |
| `merchant/(app)/qr/print/page.tsx:42-46` | merchant **owner** only (`:38`) |
| `merchant/(app)/dashboard/page.tsx:34-38` | merchant **owner** only (`:31`) |

- **Browse views:** `deals_public_browse` enumerates its columns
  (`20260818150000_deal_categories.sql:100`); `qr_token` is not among them, and
  `maanta-app/supabase/tests/merchant_qr_queue_test.sql:62-69` asserts it appears
  in **no** public browse view.
- **`DEAL_SELECT`:** enumerated, not `*`
  (`maanta-app/src/lib/data.ts:167-171`) — merchant columns are
  `id, merchant_name, floor, unit_number, what3words_address, lat, lng,
  mall_name, node, is_visible, is_shadow_banned, status`. No `qr_token`.
- **Any `select("*")` on `merchants`:** none in `src/`.
- **API responses / page props / RSC payloads:** the token never becomes a
  serialized prop. On the print page it is interpolated into `url` and passed to
  `CounterQr`, which is the QR image. `POST /api/qr/check-in` returns
  `merchantName`, `arrivedAt`, `fastVisitEligible`, `firstArrival`,
  `queueExpiresAt` — not the token (`route.ts:358-366`).

The one place the token is unavoidably visible is the shopper's own address bar
after they scan, which is inherent to a URL-encoded QR.

### Can arrival be triggered by anyone who has the URL, from any location?

**Yes, subject to holding a live claim — and there is no location check anywhere.**
`record_shopper_arrival` takes `(p_user_id, p_merchant_id, p_redemption_id)` and
nothing else; the migration contains no `lat`, `lng`, `distance` or geofence term
(grep over `20260826120000_fast_visit_points.sql`). So a shopper who obtains the
URL — a photo of the sticker, a friend forwarding the link, a screenshot — can
check in from anywhere on earth, provided they personally hold a pending,
unexpired claim at that merchant. Rate limiting is 10 per minute per user
(`api/qr/check-in/route.ts:34-35`).

**Assessment: this is the designed trade, not a defect.** The token "identifies
the merchant and authorizes nothing" (`route.ts:16-22`), and arrival alone awards
nothing — points still require staff to verify the 6-digit code at the till
(`20260826120000_fast_visit_points.sql:353-358`). The residual exposure is that
Fast Visit measures *"claimed and then scanned a URL"*, not *"claimed and then
physically walked to the shop"*, for anyone who has the link. For the Node 0
question — whether a claim converts to a walk-in — that distinction matters, and
the counter's own verification is what actually closes it.

---

## Q5 — Demo contamination

**`reward_events` is read by exactly three application sites, and none is an
admin or founder dashboard:**

- `maanta-app/src/lib/fast-visit.ts:41` — `getRewardBalance(userId)`, one shopper.
- `maanta-app/src/lib/fast-visit.ts:64` — `listRewardEvents(userId)`, one shopper.
- `maanta-app/src/app/(shopper)/tickets/[id]/page.tsx:134`, `:144` — this
  redemption's row, and the shopper's own balance.

**No admin, founder or agent surface counts reward events at all.** Grep for
`reward_events` across `src/app/admin`, `src/app/founder` and `src/app/agent`
returns nothing. So the question "how do the dashboards count reward events"
has the answer: **they do not.** There is no operational visibility into the
points ledger anywhere outside a single shopper's own view. That is a reporting
gap rather than a contamination one, but it is the gap that matters: if points
start being awarded in the field, no MAANTA-side surface will show it.

**What the dashboards labelled "Fast Visit" actually count is
`redemptions.fast_visit_qualified_at` — arrival verdicts, not awards:**

- `maanta-app/src/app/admin/pilot/page.tsx:268-279` — `.gte("fast_visit_qualified_at", since)`
  wrapped in `genuineTagged(...)` over `GENUINE_JOIN_SELECT`.
- `maanta-app/src/app/founder/yesterday/page.tsx:147-152` and `:730` — same
  pattern.

`genuineTagged` applies the full D188 three-way parent chain —
`is_demo = false` on the redemption **and** `merchants.is_demo = false` **and**
`deals.is_demo = false` (`maanta-app/src/lib/evidence-scope.ts:73-77`). **These two
surfaces are demo-safe**, and they are safe for the right reason: they join
through the parents rather than trusting `redemptions.is_demo`.

### The one surface that would mix demo and genuine

`maanta-app/src/lib/merchant-owner-stats.ts:118-125` counts a merchant's Fast
Visits with **no demo predicate of any kind**:

```ts
.select("id, deal_id, success_fee_charged, fast_visit_qualified_at")
.eq("merchant_id", merchantId)
.eq("status", "success")
.gte("redeemed_at", windowStart)
```

filtered at `:98` on `fast_visit_qualified_at !== null`, and surfaced on the
merchant dashboard. Scoped to one merchant, so it cannot mix *across* merchants;
but a genuine merchant carrying any seeded demo deal would see demo-derived
qualifications counted into their own Fast Visit figure, with nothing marking
them. **Low severity and merchant-facing only** — no admin or founder number is
affected — but it is the one place the D188 join is absent from a Fast Visit
count. Reported, not fixed.

**On `reward_events` having no `is_demo` column:** that is deliberate and
documented (`20260826120000_fast_visit_points.sql:59-62`) — D188 proved that a
live-path demo flag nothing sets is worse than no flag, and demo-ness is derivable
by joining `merchants.is_demo`/`deals.is_demo` through `redemption_id`. **It is
derivable, so a future reward count *can* be filtered.** No code does it yet
because no code counts rewards yet.

---

## Q6 — Window mismatch

**Not found. No UI promises a 15-minute reward window on a claim whose code dies
first, and the arithmetic makes that impossible.**

- Claim ticket lifetime is frozen at `redemption.expires_at = deal.expires_at +
  15 minutes` (`20260818120000_claim_deal_csprng_otp.sql:149`, and the same at
  `:165`).
- `claim_deal` refuses a deal that has already ended:
  `IF v_deal.expires_at IS NOT NULL AND v_deal.expires_at <= NOW() THEN` reject
  (`:106`). So `claimed_at < deal.expires_at`, always.
- The reward window is `claimed_at + 15 minutes`
  (`maanta-app/src/lib/fast-visit-window.ts:98-108`).

Therefore `claimed_at + 15min < deal.expires_at + 15min = redemption.expires_at`
strictly, for every claim. **The code always outlives the reward window**, by
exactly the margin between claim time and deal end. A shopper who claims two
minutes before a deal ends gets a 15-minute reward window and a ~17-minute code.

Two adjacent surfaces were checked for the same shape and are also clean:

- `tickets/[id]/page.tsx:317-325` renders `FastVisitPanel` only inside the pending
  branch, below `ExpiryGate` (`:289`), which swaps the whole screen to the expired
  view the moment the code dies — so the reward countdown cannot outlive it on an
  open page.
- `fastVisitChipState` (`maanta-app/src/lib/fast-visit-chip.ts:200-238`) returns
  `"window-open"` only while `status === 'pending'` and `now < claimed + 15min`; by
  the inequality above, that is always inside the code's life.

The panel's copy is also careful in the right direction — *"Reward window ended —
your claim is still valid."* (`fast-visit-panel.tsx:77-79`) and *"Your claim stays
valid either way."* (`:98-101`). The mismatch Q6 asks about does not exist in this
tree.

---

## Q7 — Field docs (D222)

**First, a bookkeeping note:** there is no row `D222` in
`docs/maanta-drift-register.md`. The highest existing row is **D218**. The ID in
the brief is forward-looking; this session opened no row (investigation only —
recording a row is a founder call, and the finding below is stated here in full
so it can be transcribed verbatim if the founder wants it registered).

**The features in question are live and ungated at the application layer.** Only
three shopper *display* surfaces read `fast_visit_enabled`
(`my-deals/page.tsx:134`, `you/page.tsx:43`, `tickets/[id]/page.tsx:278`). The
counter QR page, `POST /api/qr/check-in`, `/api/queue`, the queue panel, the
printable sheet and the dashboard QR card read **no gate at all** — they are on
production for every active merchant right now.

**Documents under `docs/ops/` that a merchant, counter employee, field operator or
shopper carries**, and what each says about counter QR / arrival check-in / till
queue / Fast Visit:

| Document | Carried by | Dated | Counter QR? | Arrival check-in? | Till queue? | Fast Visit? |
|---|---|---|---|---|---|---|
| `field-operator-day-sheet.md` | Field operator | 2026-08-22 | **No** | **No** | **No** | **No** |
| `merchant-welcome-pack.md` | Merchant | 2026-08-22 | **No** | **No** | **No** | **No** |
| `merchant-staff-counter-card.md` | Counter employee | 2026-08-23 | **No** | **No** | **No** | **No** |
| `d158-self-serve-live-test.md` | Field operator (observation sheet) | 2026-08-23 | **No** | **No** | **No** | **No** |
| `first-merchant-loop-test.md` | Field operator | 2026-08-22 | **No** | **No** | **No** | **No** |
| `node0-evidence-protocol-2026-08-24.md` | Founder / operator | 2026-08-24 | **No** | **No** | **No** | **No** |
| `live-pilot-3-person-2026-07-30.md` | Founder + merchant + shopper | 2026-07-30 | **No** | **No** | **No** | **No** |
| `live-pilot-day-one-prep-2026-07-30.md` | Operator / founder | 2026-07-30 | **No** | **No** | **No** | **No** |
| `founder-e2e-checklist-2026-07-30.md` | Founder | 2026-07-30 | **No** | **No** | **No** | **No** |
| `merchant-pilot-bbs-launch-plan-2026-08-01.md` | Founder / operator | 2026-08-01 | **No** | **No** | **No** | **No** |
| `pwa-real-device-pilot-checklist.md` | Operator, on real phones | 2026-08-12 | **No** | **No** | **No** | **No** |
| `merchant-lifecycle.md` | Operator (click paths) | 2026-07-26 | **No** | **No** | **No** | **No** |

Method: a case-insensitive grep for `counter QR`, `/qr/`, `qr_token`,
`fast visit`, `fast_visit`, `shopper queue`, `merchant_presentations`, and
`arrival check` across **all 89 files** in `docs/ops/`. It returns exactly **two**
files, and neither is carried by anyone in the field:

- `docs/ops/pr1-shopper-clarity-2026-08-27.md` — an engineering PR report.
- `docs/ops/redemption-enforcement-audit-2026-08-28.md` — an engineering audit.

The three purpose-built field documents (`merchant-welcome-pack.md`,
`merchant-staff-counter-card.md`, `field-operator-day-sheet.md`) predate the
2026-08-26 QR/Fast Visit/queue migrations by three to four days and were never
revised. The counter card walks staff through *"Type the six digits"* (`:32`) and
*"Checking a code costs nothing. Only a confirmed one counts."* (`:104`) — which
is correct, complete for the money path, and describes a till with no queue panel
on it.

**Finding, stated for the register.** Three shipped, ungated, merchant- and
shopper-facing features — the counter QR sheet, arrival check-in, and the till
queue panel — exist on production with **zero coverage in any document a human
carries into BBS Mall**. A merchant will not print the sheet because nothing tells
them it exists; counter staff will not recognise the queue panel when it appears
above their keypad; the field operator has no line on the day sheet to record
whether a scan happened. This is the operational half of the Q1 verdict: even if
the gate were flipped, the field would not know to produce the behaviour the
reward requires.

---

## Q8 — Merge hazard

All four assertions **confirmed**, as of this session:

1. **`codex/queue-call-app` sets `fast_visit_enabled` to `true`.** Confirmed. The
   branch carries a migration absent from `main`:
   `maanta-app/supabase/migrations/20260901100100_enable_fast_visit_after_call_forward.sql`,
   whose entire body is:

   ```sql
   -- Apply only after the staff call-forward application deployment is live.
   -- Qualification remains stamped at arrival; points move only after a
   -- successful staff verification of the shopper's deal code.
   UPDATE public.app_config
   SET value = 'true'
   WHERE key = 'fast_visit_enabled';
   ```

   Its companion `supabase/tests/enable_fast_visit_after_call_forward_test.sql`
   asserts `value = 'true'` for that key. Branch head `6d772ef` ("Prove explicit
   called-row rejoin", 2026-09-01 22:22 +0200).

2. **PR #314 is still a draft.** Confirmed via the GitHub API: `"draft": true`,
   `"state": "open"`, `"merged": false`, base `main`, head `codex/queue-call-app`
   at `6d772ef`, 25 commits / 21 files / +669 −46. Title: *"Archive: queue
   call-forward, application half (not for merge)"*. Its body names the flag flip
   as the specific reason it is a draft. Its `mergeable_state` is `clean`, so the
   **draft status is the only thing preventing a merge from turning Fast Visit
   on** — there is no conflict and no failing required check standing in the way.
   Link: [maanta-app/maanta#314](https://github.com/MAANTA-APP/MAANTA/pull/314)

3. **Neither branch is merged into `main`.** Confirmed by
   `git merge-base --is-ancestor origin/<branch> origin/main` — both return
   non-zero (NOT an ancestor).

4. **Neither branch is deleted.** Confirmed by `git ls-remote --heads origin`:
   `refs/heads/codex/queue-call-app` → `6d772ef85240a18f6803dda8617ea74d3f3f236d`,
   `refs/heads/codex/queue-call-schema` → `02d26de20fc4f1c6d88b599b67967ccd81681150`.

**One correction to the PR body, worth knowing before acting on it.** #314 says
its schema half is #313, closed unmerged, and that the two must be restored or
discarded together. That is consistent with what is on the remote. It also states
the ledger reconciles **107/107** as of 2026-09-01; this repository contains
**107** files under `maanta-app/supabase/migrations/`, which agrees. `CLAUDE.md`
still says **105/105** (2026-08-27). The repo and the PR agree with each other and
`CLAUDE.md` is two behind — a documentation lag, not a ledger problem, and no
production read was performed to confirm the production side.

---

## Q9 — Kill switch

**Confirmed on both halves.**

**`fast_visit_points = 0` is the only way to stop new awards once qualifications
exist.** In `award_fast_visit_points`
(`20260826120000_fast_visit_points.sql:306-380`) the award is guarded by a single
conjunction at `:353-358`:

```sql
IF v_points > 0
   AND v_status = 'success'
   AND v_qualified_at IS NOT NULL
   AND v_claimed_at IS NOT NULL
   AND v_arrived_at IS NOT NULL
   AND v_arrived_at <= v_claimed_at + INTERVAL '15 minutes'
```

Of those six terms, the last five are immutable facts about a redemption that has
already qualified — nothing an operator can change alters them. `v_points > 0` is
the sole operator-controlled term, and the migration says so in the code comment
at `:352`: *"`v_points > 0` remains the operator's kill switch for NEW awards."*
Note the failure mode of the parse (`:339-345`): a missing row, a malformed value,
or any exception leaves `v_points` NULL and it **falls back to 50** — so deleting
the config row or blanking it *increases* exposure. Only an explicit `'0'` (or a
negative integer) stops awards.

**Setting `fast_visit_enabled = false` does NOT stop pending awards.**
`award_fast_visit_points` contains no gate read at all — the only
`fast_visit_enabled` reference in the migration is inside the arrival path
(`:155`) and in the config seed (`:412`). The comment at `:346-352` states the
rationale: re-checking the gate at award time is the retroactivity bug D191
recorded and fixed, so it would deny a legitimately earned reward. The function's
own `COMMENT ON FUNCTION` (`:392-398`) says it outright: *"Does NOT read
fast_visit_enabled: a later gate flip neither retro-qualifies old arrivals nor
erases earned eligibility."* The app agrees on the display side: the ticket panel
renders on `fastVisitOn || ticket.fast_visit_qualified_at`
(`tickets/[id]/page.tsx:317`) and the chip checks the verdict before the flag
(`fast-visit-chip.ts:204`) — both closed drift D198.

**Operationally, this means:** flipping the gate off stops *new qualifications*
from being created, and nothing else. Every redemption already carrying a
`fast_visit_qualified_at` remains payable indefinitely, awarded the moment staff
verify it — which, given a claim ticket lives until `deal.expires_at + 15min`,
can be days after the flag is turned off on a multi-day deal. To stop payment on
an already-qualified population, `fast_visit_points` must be set to `'0'`.

---

## Summary of findings

| # | Finding | Severity | Where |
|---|---|---|---|
| 1 | The shipped counter flow does not order scan before verify, and the printed sheet actively decouples them. Verify-first permanently forecloses the reward for that redemption. | **Blocking for the feature's purpose** | `qr/print/page.tsx:73-76`, `:97`; `redeem/page.tsx:77-81`; `queue-panel.tsx:156` |
| 2 | No document carried by a merchant, counter employee, field operator or shopper mentions the counter QR, arrival check-in, the till queue, or Fast Visit — though all three features are live and ungated. | **Blocking for a field run** | all 89 files in `docs/ops/`; the three field docs date 2026-08-22/23 |
| 3 | The award is a separate call after verify commits, with no retry and no queue — only two opportunistic self-heals, each requiring a human to act again. | Defect risk (silent loss) | `verify/route.ts:186-210`, `:84-101`; `tickets/[id]/page.tsx:122-153` |
| 4 | `merchant-owner-stats.ts` counts Fast Visits with no demo predicate — the one Fast Visit count missing the D188 parent-chain join. Merchant-facing only. | Low | `merchant-owner-stats.ts:118-125`, `:98` |
| 5 | No admin or founder surface reads `reward_events` at all; if points start being awarded, no operational surface shows it. Demo filtering is derivable but unwritten. | Low (reporting gap) | grep over `src/app/admin`, `src/app/founder` |
| 6 | Arrival has no location check — anyone holding a live claim who obtains the URL can check in from anywhere. Designed trade; awards still require counter verification. | Observation | `20260826120000_fast_visit_points.sql` (no geo term); `check-in/route.ts:34-35` |
| 7 | `codex/queue-call-app` carries a live `fast_visit_enabled = 'true'` migration; PR #314's draft flag is the only thing stopping a merge that would turn Fast Visit on. `mergeable_state: clean`. | Merge hazard, contained | migration `20260901100100`; PR #314 |
| 8 | `D222` does not exist in `docs/maanta-drift-register.md`; the highest row is D218. `CLAUDE.md` says the ledger is 105/105 while the repo holds 107 migrations. | Bookkeeping | `docs/maanta-drift-register.md`; `CLAUDE.md` |

**Nothing above was fixed.** No code, migration, config, branch or `app_config`
row was changed; `fast_visit_enabled` remains `false` and was neither read from
nor written to production. No drift row was opened — findings 1, 2, 3, 4, 5 and 8
are stated here in registrable form for the founder to transcribe if wanted.

**Open decisions for the founder.** (a) Whether Fast Visit is worth the ordering
change and the field-documentation work at all, given Node 0's actual question is
claim → walk-in, which the counter's own verification already measures without
any of this. (b) ~~Whether to delete `codex/queue-call-app`~~ — **decided
2026-09-02: delete it.** See the addendum below. (c) Whether findings 1 and 2
warrant drift rows before Merchant 01 goes live.

---

## Addendum — 2026-09-02: deletion of `codex/queue-call-app`

**Founder decision:** delete the branch, now that PR #314 preserves it, removing
the `fast_visit_enabled = 'true'` migration from the working set (finding 7).

**Preservation verified before attempting anything.** Deleting an unmerged branch
is only as safe as the ref that outlives it, so the archival claim was checked at
the ref level rather than taken from #314's prose:

```
$ git ls-remote origin 'refs/pull/314/*'
6d772ef85240a18f6803dda8617ea74d3f3f236d  refs/pull/314/head
2313c7a1c7a57ad55b01ae844f3f70d511d5ffeb  refs/pull/314/merge
```

`refs/pull/314/head` equals the branch head `6d772ef` exactly, and that ref
survives branch deletion. PR #314 was re-read the same day and is still
`open` / `draft: true` / `merged: false`, head `6d772ef`, base `main`. **The work
is genuinely recoverable from #314 after the branch is gone.**

**The deletion did NOT happen — this session lacks the permission.**
`git push origin --delete codex/queue-call-app` returned:

```
error: RPC failed; HTTP 403
send-pack: unexpected disconnect while reading sideband packet
```

A push to this session's own `claude/*` branch had succeeded minutes earlier over
the same remote, so connectivity and credentials are fine; the 403 is a
write-scope denial specific to deleting a ref this session does not own. Per
`/root/.ccr/README.md` (§"403 / 407 from the proxy"), such a denial is to be
reported, not retried or routed around — so it was not. The GitHub MCP server
exposes no delete-branch or delete-ref tool, so no sanctioned tool path exists
from here.

**The branch is therefore still present at `6d772ef`, and finding 7 stands
open.** A human with push rights closes it with one command:

```
git push origin --delete codex/queue-call-app
```

or **Delete branch** on the #314 page / the repository's branches list.

**One side effect to expect, and it is benign.** GitHub closes a pull request when
its head branch is deleted, so #314 will move from *open draft* to *closed*. That
does not weaken the archive — `refs/pull/314/head` persists, the diff and all 25
commits stay viewable, and the page gains a **Restore branch** button. It is
arguably the better end state: #314 is titled "not for merge", and a closed PR
cannot be merged at all, which retires the flag-flip hazard rather than leaving it
resting on a draft flag whose `mergeable_state` is `clean`.

**Still true after this addendum:** no code, migration, `app_config` row or branch
was changed by this session, and `fast_visit_enabled` remains `false`.
