# Clerk instance change — identity prevention (D108)

**Status:** draft for a founder ruling. This is the **prevention** half of **D108**.
The **repair** half (fixing rows already orphaned) lives in the sibling runbook
`docs/ops/clerk-instance-identity-repair.md` and is, per D108's 2026-08-16
narrowing, answered for the one account that mattered (the working admin) and
cheap for the rest (test accounts).

This document does not change any code. It lays out the hazard precisely, the
options with their security trade-offs, a recommended phased plan, and the exact
decisions the founder needs to make. Once ruled, the Phase 1 build is a small,
shovel-ready diff.

---

## The hazard, precisely

`ensureAppUserFromClerk` (`maanta-app/src/lib/auth.ts`) resolves the app user
from the Clerk JWT `sub` **alone**:

```ts
.from("users").select(...).eq("clerk_user_id", userId).maybeSingle()
// miss → upsert { clerk_user_id, phone, email, full_name, role: "customer" }
//        onConflict: "clerk_user_id"
```

A Clerk `sub` is **scoped to the instance that minted it**. Change the Clerk
instance (a dev→prod cutover, or a new production instance) and every returning
human arrives with a `sub` that matches no `clerk_user_id`. The code then treats
them as brand new, and a UNIQUE constraint — not any decision — picks one of two
bad outcomes:

- **Path (a) — silent second account.** Their old row's `phone` is NULL, so the
  insert succeeds. They get a fresh row: new id, `role = 'customer'`, no claims,
  no merchant, no admin rights. Their real account is orphaned behind a
  `clerk_user_id` no live instance will ever present again. An admin becomes a
  customer with no console.
- **Path (b) — hard lockout.** Clerk returns a phone equal to their old row's
  `phone`, so the insert violates `users_phone_key` (`UNIQUE (phone)`). The catch
  path re-reads by `clerk_user_id`, finds nothing, and `ensureAppUser` returns
  **null** — no account at all.

The `auth_uid` fallback inside `current_user_id()` does **not** help: it exists
for legacy Supabase-Auth `sub`s (UUIDs), not for a new Clerk instance's opaque
`sub`. Email is not consulted and is not unique, so there is no fallback of any
kind today.

Measured on production 2026-08-16 (D108): 9 rows carry a `clerk_user_id`, 3 of
them `admin`; 8 of 9 have `phone` NULL (path a), 1 has a phone (path b). The
instance already changed once (D99). At pilot scale the blast radius is small;
at launch scale, an instance change without a fix re-identifies everyone.

### What D126 already changed (and why it matters here)

Since **D126**, `users.phone` is **verified-or-null** (only a Clerk-verified
primary phone is persisted, via `verifiedPrimaryPhone`) **and** immutable to the
row's holder (the `prevent_identity_self_change` trigger blocks holder writes to
`phone`/`clerk_user_id`/`auth_uid`). That makes **phone a trustworthy identity
key**: a stored phone can only have been placed there by someone who proved
control of it, and the holder cannot repoint it. `email` has neither property —
it is stored unverified and is still self-writable (the D126 trigger does **not**
cover `email`). That asymmetry drives the recommendation below.

---

## Design principle

When the `sub` misses, resolve identity by a **stable identifier the current
session has just verified**, then repoint `clerk_user_id` to the new `sub`
instead of minting a second account. "Just verified by the current (new)
instance" is the load-bearing phrase: matching on a *stored* identifier the new
session has not proven control of would be an account-takeover primitive, not a
recovery.

---

## Options

| Option | What it is | Verdict |
|---|---|---|
| **0. Accept + manual relink** | Do nothing in code; on an instance change, an admin runs the per-person `UPDATE users SET clerk_user_id = <new sub>` recipe (repair runbook). | Fine for a frozen instance / 3-person pilot. Does not scale, and an admin locked out by path (a) is the most expensive way to discover it. |
| **1. Verified-identity runtime fallback** | On a `sub` miss, look up an existing row by a session-verified identifier and repoint it. | **Recommended.** Automatic, self-healing, fixes both failure paths. Split into phone (safe today) and email (gated). |
| **3. Bulk relink for a planned cutover** | For a *known* instance change, export both instances' user lists, match offline on verified email/phone, and bulk-UPDATE `clerk_user_id`. | **Recommended as the primary step for any planned change**, with Option 1 as the runtime safety net. Mechanics in the repair runbook. |

(There is no "Option 2 — store a more stable key": Clerk has no cross-instance
stable user id. Email and phone are the only identifiers that survive an
instance change, which is exactly Option 1.)

---

## Recommendation — phased

### Phase 1 — phone-only runtime fallback (safe to build now)

On a `clerk_user_id` miss, **before** inserting a new row:

1. Compute the session's verified primary phone: `verifiedPrimaryPhone(cu)`
   (already exists, D126). Null for email-only users.
2. If non-null, look up `users WHERE phone = <phone>` — `phone` is UNIQUE, so at
   most one row.
3. **Found** → repoint and return it:
   `UPDATE users SET clerk_user_id = <new sub> WHERE id = <found.id>` (via the
   service client, which bypasses the D126 trigger — legitimate provisioning).
   The old `sub` is dead; the new `sub` is on no row, so no UNIQUE conflict.
4. **Not found / phone null** → insert a new row, exactly as today.

Why it is safe:

- The match key is a phone **the current session verified now** (the new
  instance's SMS OTP). The stored phone is itself verified (D126) and
  holder-immutable (D126), so "two parties with verified control of phone P" ⇒
  same person — the standard assumption behind any SMS-based recovery (SIM-swap
  is the ambient risk, unchanged).
- `phone` is UNIQUE, so the match is unambiguous.
- It cannot hijack: to land on a victim's row the attacker must verify the
  victim's phone on the new instance, i.e. control that phone — in which case it
  is not a hijack. And it fires only on a `sub` **miss**, so a live session is
  never redirected.

What it fixes:

- **Path (a)** for phone-verified users: they relink to their real row instead of
  getting a duplicate customer account.
- **Path (b)** entirely: the collision happens *because* the phone already exists
  on the old row — Phase 1 finds that row by phone and returns it instead of
  null.

Residual after Phase 1: a user who never verified a phone (email-only) still hits
path (a). That is Phase 2.

**Build cost:** one lookup + one conditional UPDATE in `ensureAppUserFromClerk`,
plus unit tests. **No migration** (uses existing verified+immutable `phone`).

### Phase 2 — email fallback (only after its prerequisites)

Needed only if email-only users must survive an instance change automatically.
It cannot be built safely on today's schema. Prerequisites, in order:

1. **Lock `users.email` against holder writes** — extend the D126
   `prevent_identity_self_change` trigger to include `email`. Without this, an
   attacker sets their own row's `email` to a victim's, and when the victim signs
   in on the new instance with a verified matching email, the fallback repoints
   the **attacker's** row → the victim lands on the attacker's account. Email
   must be holder-immutable *before* it is ever an identity key.
2. **Store verified-only email** — add a `verifiedPrimaryEmail(cu)` mirror of the
   phone helper so `users.email` becomes verified-or-null, the same guarantee
   phone already has.
3. **Exactly-one-match** — `email` is not UNIQUE (the `admin@maanta.app`
   duplicate is a live example). The fallback must match **exactly one** row; 0 or
   ≥2 → do not auto-link (insert new, or escalate to an admin). Auto-linking on
   an ambiguous email is how you hand someone the wrong account.

Match rule: the session's **primary AND verified** email → `users WHERE email =
…` → exactly one → repoint. Residual risk to name explicitly: this trusts that
the new instance really verified the email. If a future instance is misconfigured
to mark emails verified without a real challenge, the fallback is unsafe — which
is why phone is preferred and email carries the three prerequisites above.

### Option 3 — bulk relink for a planned instance change

For any *planned* cutover, the deterministic, admin-controlled path is best:
export the old and new instances' user lists, match offline on verified
phone/email, and bulk `UPDATE users SET clerk_user_id = <new sub>` (clearing any
duplicate's `clerk_user_id` first, since `users_clerk_user_id_key` is UNIQUE —
see the repair runbook). Phase 1 is then the runtime net for anyone the export
missed. Bulk relink needs both instances' `sub`s in hand, which only a planned
change provides.

---

## The decisions for the founder

1. **Is a Clerk instance change actually on the roadmap?** If the current
   production instance is permanent, the hazard is dormant and Phase 1 is cheap
   insurance. If a new prod instance / cutover is planned, this is urgent and
   Option 3 + Phase 1 should both land **before** it.
2. **Approve Phase 1 (phone-only runtime fallback)?** Recommended yes — it is
   safe on today's schema, needs no migration, and closes both failure paths for
   phone-verified users (which, given phone-required-at-claim and the phone-OTP
   launch strategy, is most shoppers).
3. **Approve Phase 2 (email fallback) and its prerequisites** (lock `users.email`,
   store verified-only email, exactly-one-match)? Recommended: defer unless
   email-only accounts must auto-survive an instance change. It is a real
   security surface and should not ship without all three prerequisites.
4. **For a planned change, do a bulk relink (Option 3) as the primary step?**
   Recommended yes, with Phase 1 as the net.

---

## Shovel-ready once ruled

- **Phase 1:** a `relinkByVerifiedPhone` step in `ensureAppUserFromClerk`
  (`maanta-app/src/lib/auth.ts`) before the insert; unit tests for miss+phone→
  relink, miss+no-phone→new row, and the path-(b) collision→relink-not-null. The
  concurrent-first-request race is benign (both converge on the same row and the
  same new `sub`); reuse the existing upsert/re-read shape.
- **Phase 2 (if approved):** a migration extending `prevent_identity_self_change`
  to `email`; a `verifiedPrimaryEmail` helper; the exactly-one-match email step;
  tests including the ≥2-match ambiguity (must NOT auto-link) and the
  unverified-session-email case (must NOT match).
- **Option 3:** documented in `docs/ops/clerk-instance-identity-repair.md`; add a
  "planned cutover" section there when a change is scheduled.

Only the Clerk auth path is touched. The Supabase-Auth path (the code default,
D59) is unaffected — it provisions from `auth.users`, not a Clerk `sub`.
