# Fast Visit, MAANTA Points, and the counter QR — how they actually work

Read this before touching arrival, points, the merchant QR, or the till queue.
Written 2026-08-27, after the three packages merged (#275/#276/#277) and both
migrations were applied to production (ledger **104/104**, verified by a full
version+name read-back).

Companion rows: **D190–D205** in `docs/maanta-drift-register.md`. The founder
authorization and the product rules are the 2026-08-26 (second entry) row in
`docs/maanta-decisions-log.md`.

---

## 1. The three timers on one screen, and why they are different things

The claimed-ticket screen shows two countdowns and one absolute time. Confusing
them is the single easiest way to break this feature.

| What | Source of truth | Ends when | What ending means |
|---|---|---|---|
| **Claim validity** | `redemptions.expires_at` = `deals.expires_at + 15 min` (frozen in `claim_deal`) | The deal ends, plus the grace | The code can no longer be redeemed |
| **Fast Visit reward window** | `redemptions.claimed_at + 15 min` | 15 minutes after the claim | **Nothing.** The claim continues untouched; only the reward is off the table |
| **"code valid until…"** | the same `expires_at`, rendered absolutely | — | Secondary, informational |

Two rules follow, and both have already been violated once:

- **The reward window must never be described as expiry.** No "expired", no
  "too late", no "redemption unavailable" when it hits zero. It says *"Reward
  window ended — your claim is still valid."* Guarded in
  `src/components/__tests__/fast-visit-panel.test.ts`.
- **One duration formatter, not two.** `formatClaimCountdown`
  (`lib/claim-ticket-time.ts`) rolls minutes into hours and days, because a
  day-long claim rendered as `1449:12` was the original D167 defect. The reward
  countdown was briefly a second, weaker copy of the same sub-hour logic and
  could reproduce exactly that string on a slow device clock (**D203**); it now
  delegates. If you add a third timer here, delegate too.

---

## 2. Fast Visit qualification is decided ONCE, at arrival

The load-bearing design decision (**D191**), and the thing most likely to be
"simplified" wrongly by a future session:

> Qualification is evaluated by `record_shopper_arrival` **at the moment of
> arrival** and persisted as `redemptions.fast_visit_qualified_at`. It is never
> re-derived from raw timestamps afterwards.

The reason is not tidiness. Timestamps alone cannot answer *"was the feature
switched on when this shopper walked in?"* — only a verdict recorded at that
instant can. So:

- `arrived_at <= claimed_at + 15 minutes` **inclusive**, both database-stamped.
  A device clock is never an input to anything that matters.
- Historical rows with `claimed_at` NULL (deliberately never backfilled — see
  `20260824130000`) can never qualify. Guarded at both arrival and award.
- **Earned eligibility is never erased.** `award_fast_visit_points` deliberately
  does not re-read the feature gate, so a qualification earned while the gate
  was ON still pays after it is turned OFF. Every surface that *states*
  eligibility must honour the same carve-out — render on `fast_visit_enabled`
  **or** a non-null `fast_visit_qualified_at`. The ticket screen got this wrong
  and showed the shopper nothing while the award still paid (**D198**).

The QR scan itself **never awards**. Points land only after staff complete a
successful verification of the same claim at the same merchant, exactly once,
enforced by a real `UNIQUE` constraint on `reward_events.reference`.

---

## 3. Points are not money

Frozen by the 2026-08-26 ruling: no KES conversion, not withdrawable, not
transferable, not purchasable, never rendered as currency or with money styling.
The amount is `app_config.fast_visit_points` (50), not a hardcoded constant.

`src/lib/__tests__/rewards-not-money.test.ts` ratchets this. Note the shape of
the ticket-screen assertion: that file legitimately contains `KES` (the YOU PAY
figure), so the guard is **scoped to the reward card's own source region** rather
than the whole file (**D205**). Any new reward surface needs a guard of one of
those two shapes — do not skip it because the file "obviously" has no money in
it today.

---

## 4. The counter QR authorizes nothing

`merchants.qr_token` is 32 hex chars of CSPRNG. One token per merchant — the
**same** sticker at the entrance and the till; the shopper's state decides what
happens, not which sticker they scanned.

The token identifies a merchant and grants **no capability**. Everything behind
it re-authorizes independently:

- **Arrival**: `record_shopper_arrival` is REVOKED from `authenticated` and
  called on the **service client** from `/api/qr/check-in`. This is deliberate
  and was a P1 correction to the first draft: with an `authenticated` grant, a
  shopper could call the RPC directly through PostgREST and stamp an arrival
  **without ever scanning the QR**, which defeats the entire proof-of-presence
  premise. Making the route the only door is what gives the token check meaning.
  The RPC still enforces claim ownership against `p_user_id` — which is why
  `p_user_id` must stay the session-derived `appUser.id` and never anything from
  the request body.
- **Redemption**: unchanged. `verify_redemption`, staff seat, `can_verify`.

> **Do not "standardise" the redemption routes onto the service client.**
> `/api/redemptions/verify` must keep using `createClient()` (anon key + session
> JWT), because `verify_redemption`'s tenant-isolation check is skipped for
> `service_role`. The arrival RPC is the opposite case *because it is revoked
> from `authenticated`*. The two look inconsistent and are both correct; the
> distinguishing question is always **"who is allowed to call this directly?"**

A photographed or copied QR buys an attacker a remote check-in at worst, which
staff verification renders harmless: no arrival moves money, and no points move
without a verified redemption.

---

## 5. The queue is ephemeral, and is NOT redemption state

`merchant_presentations` says only *"this shopper is standing in the shop right
now."* The redemption's own status stays canonical and unchanged — the CHECK is
still exactly `pending | success | failed | flagged`, and **no "presented" status
was added**, despite older docs mentioning one.

Rules that are easy to break:

- Entries live ~10 minutes (`QUEUE_ENTRY_TTL_MINUTES`), filtered by
  `expires_at`. **No cron.** Queue expiry never touches the claim.
- The partial unique index covers **every** `waiting` row, lapsed or not. So a
  re-scan cannot simply "insert a fresh row" — it would collide. The write
  branches on age instead: extend a live row (keeping its `arrived_at` — a
  re-scan by someone already queued is not a new arrival), or supersede a lapsed
  one with a new `arrived_at`. Getting this wrong let a shopper who scanned the
  entrance 40 minutes earlier jump an oldest-first queue (**D199**).
- Every queue write must confirm **what it actually wrote** (`.select("id")` and
  check the rows). An entry can be dismissed between a lookup and an update, and
  answering "you're checked in" regardless told a shopper they were queued while
  staff never saw them (**D197**).
- Staff dismissal and shopper cancellation touch **only** the queue row. Never
  the claim.

**Identity minimisation** (`staffFacingName`): staff see first name + last
initial, the deal, arrival time, eligibility, and the claim code. Full name,
phone, email, GPS and history never leave the server.

---

## 6. Both paths converge on one money path

Manual 6-digit entry keeps working everywhere it worked before. The QR is an
**alternative presentation method**, not a replacement — the wireframe rule that
"the code is something the shopper PRESENTS; it is never scanned-to-pay" still
holds, because here the **shopper scans the merchant's** sticker, not the
reverse.

Tapping a queue row hands the code to the keypad **in memory**
(`lib/queue-code-handoff.ts`) and then follows the identical flow typing does:
preflight → fee disclosure → explicit Confirm. The first version navigated with
`?code=<OTP>`, putting a live credential into the till URL, shared-device
history, `Referer` headers and PostHog's `$current_url` (**D193**).

Nothing auto-confirms. The two-step resolve-then-charge contract is a frozen UI
rule, not a convention.

---

## 7. A trap this feature keeps re-teaching: the test environment cannot see effects

`vitest.config.ts` sets `environment: "node"`, and there is no
`@testing-library/react`. Component tests are `renderToStaticMarkup` — so
**effects, handlers and state transitions never execute**. A client state machine
is therefore *structurally unguardable* by the normal component test.

That is exactly how **D196** shipped: cancelling a check-in set state back to
`idle`, but the single-claim auto-check-in effect is one-shot, so the shopper sat
on "Checking you in…" forever with nothing in flight — and no test could have
caught it.

When you write a client state machine here, guard it in two parts:

1. assert the branches that are reachable **without** effects, and
2. add a **source-level** assertion on the transition itself (e.g. "the cancel
   handler targets `cancelled` and never `idle`").

The second is ugly and it is the only thing that works in this environment.

---

## 8. Current state (2026-08-27)

- All three packages **merged** (#275, #276, #277) and both migrations
  **applied** to production; ledger reconciles **104/104**.
- `app_config.fast_visit_enabled = **false**` — the reward UI and awarding ship
  **dark**. Turn it on only when counter QRs are physically printed at Node 0.
- `fast_visit_points = 50`, `success_fee_kes = 30.00` (untouched),
  `demo_mode_enabled = true` (by the 2026-08-26 ruling).
- **The QR check-in and queue are NOT behind the Fast Visit gate.** They are live
  the moment a merchant's counter link is printed. Only the reward UI and the
  awarding are gated.
- **Still owed: field evidence.** Nothing here has been exercised by a real
  shopper at a real counter. Deployment is not proof.
