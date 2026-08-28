# Redemption enforcement audit — 2026-08-28

**Purpose.** Founder ruling after PR #291 (`f7f52a5`): before live Merchant 01
traffic, establish every layer that can refuse a redemption, and confirm whether
`VERIFICATION_BLOCKING_MERCHANT_STATUSES` — the shared predicate that decides
whether `/notifications` shows "your claimed code expires soon" — is complete.

**Method.** Static trace of the verify path plus production read-back of the
RPC's security mode, grants and refusal set. **No writes, no migrations.** This
is the desk half of the validation; the counter half is the field matrix in §6,
which only Merchant 01 testing can run.

**Headline: the predicate is complete for the question the notification asks.**
The only *merchant-status-dependent* refusal anywhere on the path is
`requireMerchant`'s blocked set. Every other refusal is per-identity or
per-redemption, not per-merchant, and so must not enter the predicate. §5
explains why, and names the two ways that conclusion could still be wrong.

---

## 1. The path, in order

`POST /api/redemptions/verify`

| # | Layer | Can it refuse? | Merchant-status dependent? |
|---|---|---|---|
| 1 | `src/middleware.ts` | Session only — Clerk `clerkMiddleware()` or Supabase `updateSession`. Matcher covers `/(api\|trpc)(.*)` | **No.** It refreshes/populates auth and gates nothing else |
| 2 | `requireMerchant("can_verify")` | 401 signed-out · 404 no-merchant · **403 blocked status** · 403 missing permission | **Yes — the only one** |
| 3 | Rate limit | 429 on `otp-check:<merchant.id>` | No — per merchant per window |
| 4 | `EXECUTE` grant | `verify_redemption` granted to `authenticated`, `service_role` | No |
| 5 | `verify_redemption` RPC | see §3 | **No** |

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
it touches does not apply to it**; the grant is the access control. Its refusals:

| Refusal | Depends on |
|---|---|
| `merchant_not_found` | merchant row exists |
| `unauthorized` | caller identity vs `p_merchant_id` |
| `redemption_not_found_or_already_used` | the code |
| `redemption_expired` | the ticket clock |
| `redemption_already_verified` | prior state |

**No merchant status, `is_visible` or `is_shadow_banned` check.** This is why
reading the RPC alone gave the wrong answer in PR #291 and why the route had to
be read too — recorded in D215.

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
the shopper keeps the expiry notice, so a refusal there means the predicate is
short and must be widened before shoppers receive affected notifications.

### 6.2 Permission states

| Seat | Expected |
|---|---|
| `can_verify = true` | success |
| `can_verify = false` | 403 from `requireMerchant`, **not** from the RPC |
| seat row deleted mid-session | 404 no-merchant, or 403 — record which |
| unclaimed seat, first sign-in | links by phone/email, then success (D154) |

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

Any 403, 404 or 409 whose source is not one of §1's five layers. Capture the
response body and the request id.

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
`src/lib/merchant-visibility.ts`, `src/app/api/redemptions/verify/route.ts`.
