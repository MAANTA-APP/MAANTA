# Redemption enforcement audit — 2026-08-28

**Purpose.** Founder ruling after PR #291 (`f7f52a5`): before live Merchant 01
traffic, establish every layer that can refuse a redemption, and confirm whether
`VERIFICATION_BLOCKING_MERCHANT_STATUSES` — the shared predicate that decides
whether `/notifications` shows "your claimed code expires soon" — is complete.

**Method.** Static trace of the **preflight and verify** path plus production
read-back of the RPC's security mode, grants and both refusal mechanisms — the
errors it raises and the Guardian outcomes it returns. **No writes, no migrations.** This
is the desk half of the validation; the counter half is the field matrix in §6,
which only Merchant 01 testing can run.

**Headline: the predicate is complete for the question the notification asks.**
The only *merchant-status-dependent* refusal anywhere on the path is
`requireMerchant`'s blocked set. Every other refusal is per-identity or
per-redemption, not per-merchant, and so must not enter the predicate. §5
explains why, and names the two ways that conclusion could still be wrong.

---

## 1. The path, in order

**Step 0 — the client guard.** `redeem-keypad.tsx` renders nothing but a
permission message when the signed-in identity lacks `can_verify`, so for that
identity **no request is issued at all**. It is a UX stop, not an
access-control boundary — the route-level check behind it is what actually
enforces the rule — but it is the first thing that stops a redemption in the
field, and an audit that omits it predicts HTTP responses that can never be
observed.

**Beyond it, the flow does not start at `/verify`.** `redeem-keypad.tsx` always posts the
six-digit code to **`/api/redemptions/preflight`** first — that resolves the code
and discloses the fee — and only Confirm calls `/api/redemptions/verify`. A
redemption therefore crosses **two** route handlers, and an operator who never
reaches the fee screen was stopped in preflight, not in verify.

### Step A — `POST /api/redemptions/preflight` (resolve, charge nothing)

| # | Layer | Refuses with | Status-dependent? |
|---|---|---|---|
| A1 | `requireMerchant("can_verify")` | 401 · 404 · **403 blocked status** · 403 permission | **yes** |
| A2 | `isValidOtpCode` | 400 | no |
| A3 | Rate limit — **same `otp-check:<merchant.id>` bucket as verify** | 429 | no |
| A4 | lookup: pending redemption for this merchant + code | `{ found: false }` (200) | no |

### Step B — `POST /api/redemptions/verify` (charges the fee)

| # | Layer | Refuses with | Status-dependent? |
|---|---|---|---|
| 1 | `src/middleware.ts` | session only — Clerk `clerkMiddleware()` or Supabase `updateSession`; matcher covers `/(api\|trpc)(.*)` | **no** — gates nothing else |
| 2 | `requireMerchant("can_verify")` | 401 · 404 · **403 blocked status** · 403 permission | **yes — the only status-shaped refusal on the whole path** |
| 3 | Rate limit — the **same** bucket again | 429 | no |
| 4 | `EXECUTE` grant | `verify_redemption` granted to `authenticated`, `service_role` | no |
| 5 | `verify_redemption` — **raised** errors | see §3a | **no** |
| 6 | `verify_redemption` — **returned** Guardian outcome | see §3b | **no** |

**One successful redemption consumes the rate-limit bucket twice** (A3 and 3),
against `OTP_CHECK_RATE_LIMIT` per `OTP_CHECK_RATE_WINDOW_SECONDS`. A busy
counter reaches the 429 in roughly half the redemptions a naive reading of the
limit suggests. Worth watching in the field; not a defect until observed.

**The RPC is called with the user-scoped client** (`createClient()`), not the
service client — so the grant in layer 4 is a real gate. It is satisfied for any
signed-in user, so it refuses only anonymous callers, which layer 2 already
caught.

## 2. `requireMerchant` — the status gate

`maanta-app/src/lib/merchant-api.ts`, consuming
`VERIFICATION_BLOCKING_MERCHANT_STATUSES` from `merchant-visibility.ts`:

```
suspended · rejected · churned   → 403 "This shop account is not active."
```

Checked **before** any RPC call. This is the whole of the merchant-status
enforcement on the redemption path.

## 3. `verify_redemption` — read back from production

`prosecdef = true` (SECURITY DEFINER, owner `postgres`), so **RLS on the tables
it touches does not apply to it**; the grant is the access control.

It refuses in **two different ways**, and reading only the first is how the
first draft of this audit was wrong.

### 3a — raised errors

| Refusal | HTTP | Depends on |
|---|---|---|
| `merchant_not_found` | 500 | merchant row exists |
| `unauthorized` | 403 | caller identity vs `p_merchant_id` |
| `redemption_not_found_or_already_used` | 404 | the code |
| `redemption_expired` | 410 | the ticket clock |
| `redemption_already_verified` | 409 | prior state |

### 3b — Guardian outcomes returned as data, not raised

The RPC returns `redemption_status: "success" | "held" | "blocked"`, and the
route turns **both** non-success values into **HTTP 409**:

| Returned | Driven by | HTTP |
|---|---|---|
| `blocked` | `guardian_recommendation = hard_block` | **409** |
| `held` | `guardian_recommendation = soft_block` | **409** |

These are velocity, geofence and collusion checks — **per redemption and per
shopper, never per merchant status**. They do not appear in a `RAISE EXCEPTION`
scan, which is exactly why the first draft's refusal set claimed to be
exhaustive and was not.

**No merchant status, `is_visible` or `is_shadow_banned` check anywhere in the
RPC.** This is why reading the RPC alone gave the wrong answer in PR #291 and
why the route had to be read too — recorded in D215.

## 4. Identities and permissions

- **Owner** — `OWNER_PERMISSIONS` is hardcoded `can_verify: true`. An owner
  always holds the permission.
- **Staff** — `merchant_staff.can_verify`, default `true`, resolved by
  `user_id`, then phone, then email (D154).

**`merchant_staff` has no revocation column** — no `is_active`, no `revoked_at`.
A seat is therefore withdrawn either by deleting the row or by clearing
`can_verify`, and those are not equivalent: clearing `can_verify` leaves the
person holding merchant context for every other merchant surface. **Confirm
which the merchant UI does** (§6.3). Not filed as drift — no evidence yet that
either behaviour is wrong, only that the distinction is unrecorded.

## 5. Why the predicate is complete — and how that could be wrong

The notification asks a **merchant-level** question: *can this ticket be redeemed
at all?* Only a refusal that holds for **every identity at that merchant** makes
a ticket unredeemable.

| Refusal | Per-merchant? | In the predicate? |
|---|---|---|
| blocked status (403) | **yes** | **yes** — correct |
| `can_verify` false (403) | no — owner always has it | no — correct |
| `unauthorized` (RPC) | no — per call | no — correct |
| rate limit (429) | no — transient | no — correct |
| `redemption_expired` | no — per ticket | no — correct |
| Guardian `held` / `blocked` (409) | no — per redemption and shopper | no — correct |

So the predicate is complete **with respect to merchant status**, which is the
only axis it claims to cover.

**Two ways this conclusion could still be wrong, and neither is closable from a
desk:**

1. **A refusal reachable only at runtime** — a Clerk organisation/session state,
   a Vercel edge rule, or a Supabase policy on a table the RPC touches that
   behaves differently under a real merchant JWT than the definer context
   suggests.
2. **A refusal that is per-merchant in practice** — e.g. a merchant whose only
   staff seat has `can_verify` cleared *and* whose owner never attends the
   counter. Structurally per-identity; operationally per-merchant.

Both are field questions, which is why §6 exists.

## 6. Field matrix — to run before live shopper traffic

Record the **HTTP status, the error body, and which layer produced it** for
every cell. A refusal that is not one of §1's five layers is the finding.

### 6.1 Identity × merchant status

| Merchant status | Owner verifies | Staff (`can_verify`) verifies |
|---|---|---|
| `active` | expect success | expect success |
| `pending` | **expect success** — not in the blocked set | expect success |
| hidden (`is_visible = false`) | **expect success** | expect success |
| shadow-banned | **expect success** | expect success |
| `suspended` | expect 403 | expect 403 |
| `rejected` | expect 403 | expect 403 |
| `churned` | expect 403 | expect 403 |

The four **expect success** rows are the load-bearing ones: each is a case where
the shopper keeps the expiry notice, so a refusal there is the signal to
investigate.

> **A refusal in an expect-success row does NOT by itself mean the predicate is
> short.** Classify it first, because two very different things produce a stop
> here and only one of them is a finding:
>
> | Observed | Meaning | Action |
> |---|---|---|
> | **409** with a Guardian reason (`held` / `blocked`) | working as designed — velocity, geofence or collusion, decided per redemption and per shopper | **not a predicate finding.** Re-test with a clean ticket |
> | **403** `"This shop account is not active."` | the merchant's **status** is blocked | expected only in the three blocked rows; in an expect-success row it **is** the finding |
> | **403** `"You don't have permission to do this."` | the **seat's** `can_verify`, nothing to do with merchant status | **not a predicate finding.** Restore the permission and re-test |
> | 429 | the shared bucket, consumed twice per redemption (§1) | wait out the window and re-test |
> | anything else | unclassified | capture it — §6.5 |
>
> **`requireMerchant` emits two different 403s and only one of them is about
> merchant status.** The status code alone cannot tell them apart — read the
> body. A permission 403 is reachable in an expect-success row whenever a seat's
> `can_verify` is cleared after the redeem page was loaded, and treating it as a
> status refusal would widen the predicate on evidence about one staff seat.
>
> Widening `VERIFICATION_BLOCKING_MERCHANT_STATUSES` because of a Guardian 409 or
> a permission 403 would gate expiry notices on a per-shopper fraud signal or a
> per-seat permission, silencing notices for merchants who verify perfectly well.
> **Read the body, not just the status code, before concluding anything.**

### 6.2 Permission states

| Seat | Expected |
|---|---|
| `can_verify = true` | success |
| `can_verify = false`, **through the UI** | **no request is made at all** — `redeem-keypad.tsx` returns *"You don't have permission to verify codes."* instead of rendering the keypad. Expect **no** HTTP 403, because neither preflight nor verify is called |
| `can_verify` cleared **after** the page loaded | the in-flight request reaches `requireMerchant` → 403 `"You don't have permission to do this."` — **not** a status finding |
| `can_verify = false`, **direct request** to either route | 403 `"You don't have permission to do this."`, from `requireMerchant`, **not** from the RPC |
| seat row deleted mid-session | 404 no-merchant, or 403 — record which |
| unclaimed seat, first sign-in | links by phone/email, then success (D154) |

**The client guard is a real stop and belongs in the inventory.** Expecting a
route-level 403 from the shipped UI is not merely optimistic, it is
unobservable: the request never leaves the browser. Reserve the route 403 for a
direct request or a permission change after page load, and treat "no request in
the network log" as the *correct* result for the first row rather than as a
failed test.

### 6.3 Seat withdrawal

Confirm what the merchant UI does when a seat is removed: deletes the row, or
clears `can_verify`. If it clears the flag, confirm the person loses access to
the other merchant surfaces too — and if not, that is a finding for its own row.

### 6.4 QR → arrival leg

`record_shopper_arrival` is granted to **`postgres` and `service_role` only —
not `authenticated`**, unlike `claim_deal` and `verify_redemption` which both
carry `authenticated`. So the arrival check-in must go through a server route
using the service client; any client-side call fails on the grant. Exercise the
real `/qr/[token]` path and confirm the arrival persists.

### 6.5 Anything unexpected

Any refusal whose source is not one of the layers in §1 — now **A1-A4 plus 1-6**,
across both route handlers. Capture the status, the response body and the request
id, and record **which of the two steps** produced it: a stop before the fee
screen is preflight, a stop after Confirm is verify. The distinction matters,
because they share a rate-limit bucket but not their other failure modes.

## 7. If a further layer is found

Add its statuses to `VERIFICATION_BLOCKING_MERCHANT_STATUSES` in
`maanta-app/src/lib/merchant-visibility.ts` — the one constant consumed by both
`requireMerchant` and `/notifications`, so route and notice cannot drift. The
guard `notifications-visibility.test.ts` derives its assertion from that
constant, and a mutant adding a status to the route without carrying it to the
surface fails. **Do not restate the list at a call site.**

If the new layer is not status-shaped, the predicate is the wrong instrument and
the finding needs its own drift row rather than an extra string.

## 8. Sources

Production read-back 2026-08-28: `pg_proc.prosecdef`, `proacl` and the refusal
set for `verify_redemption`, `claim_deal`, `record_shopper_arrival`;
`information_schema.columns` for `merchant_staff`. Repo:
`src/middleware.ts`, `src/lib/merchant-api.ts`, `src/lib/merchant.ts`,
`src/lib/merchant-visibility.ts`, `src/app/api/redemptions/verify/route.ts`,
`src/app/api/redemptions/preflight/route.ts`,
`src/app/merchant/(app)/redeem/redeem-keypad.tsx`.

**Revisions, both before merge.** Draft 1 traced only `/verify` and built its
refusal set from a `RAISE EXCEPTION` scan, so it missed the preflight step and
presented the Guardian `held` / `blocked` 409s — returned as data, never raised
— as though they did not exist. Draft 2 fixed those but still collapsed
`requireMerchant`'s **two** 403s into one branch, and predicted a route-level
403 for `can_verify = false` that the shipped UI makes unobservable, because
the client guard stops the flow before any request.

Every correction was the same mistake in a different place: **a classification
too coarse for the thing being classified.** Guardian-vs-status, then
permission-vs-status, then client-stop-vs-route-stop. That is worth more to the
field operator than the conclusion itself, because the operational risk here was
never a missing layer — it was a real refusal being read as evidence for
widening a live predicate.

The headline conclusion survived all of it unchanged, and each correction
strengthened it: every refusal added is per redemption, per shopper or per seat,
so `requireMerchant`'s status branch remains the only merchant-status-shaped
refusal on the path.
