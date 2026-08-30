# Clerk instance change — detecting and repairing orphaned identities

Owner: founder · Opened 2026-08-16 · Drift row: **D108** (open)

This is the operational half of D108. It does not decide anything D108 leaves
open — it tells you how to **detect** an orphaned account and how to **repair**
one, using the relink statement this repo already documents
(`docs/ops/test-accounts.md:14`), in the order the database's constraints
actually require.

Read D108 in `docs/maanta-drift-register.md` first. One-line version: the app
finds a person by their Clerk `sub` and nothing else, a `sub` belongs to the
instance that minted it, and production has now served two different instances
(**D99**).

## Why this matters right now

The friends-and-family pilot at Node 0 is the live gate, and the person most
exposed is the admin — an orphaned shopper loses their claim history, an
orphaned admin loses the console.

> **Status 2026-08-16 — the working admin account is NOT orphaned, and the
> decisive test below is moot for it.** Row
> `d8c1aa1e-f89e-4aeb-8ec1-e42b06101409` (`admin@maanta.app`) has **29**
> `admin_ops_log` rows, **4 written after 14:51 UTC on 2026-08-16** — when D99
> measured production serving the *production* Clerk instance — most recent
> 18:53 UTC. `logAdminOp` is reachable only through `requireAdminApi()` →
> `ensureAppUser()` → `currentClerkUserId()`, and a Clerk session is verified
> against the serving instance's keys, so a `sub` minted by the retired
> development instance could not have produced those writes. Clerk user ids are
> stable per instance per user, so a fresh sign-in returns the same id.
>
> **Do not run the sign-out/sign-in test on that account as though the question
> were open** — signing out to prove something already proven is how you turn a
> non-problem into a lockout at a bad moment. The rest of this document stands
> for the other 8 Clerk-linked rows, and for any future instance change. See
> **D108**.

## What is already true in production (measured 2026-08-16)

- **9** `public.users` rows carry a `clerk_user_id`; **3** are `admin`.
- **8 of 9** have `phone` NULL. That decides which failure they get — see below.
- **`admin@maanta.app` already has two `admin` rows**, with different
  `clerk_user_id`s, created 2026-07-22 and 2026-07-26. The newer one has **25**
  rows in `admin_ops_log` (most recent 2026-08-16 02:20 UTC); the older has
  **zero**. So one is the working account and one is a shadow.

That duplicate is the exact shape D108 describes. It is **not** proof the
instance change caused it — two Clerk sign-in methods on one instance produce
the same shape — and this document does not claim otherwise. It is proof the
shape occurs here.

## The two failure modes, and which one a person gets

When someone signs in with a `sub` that matches no row, `ensureAppUser`
(`maanta-app/src/lib/auth.ts:83`) upserts a new row. What happens next is
decided by `users_phone_key`, a `UNIQUE (phone)` constraint:

| Their old row's `phone` | What happens | How it looks to them |
|---|---|---|
| **NULL** (8 of 9 today) | Insert succeeds | Signed in, but as a brand-new `customer`: no claims, no shop, no admin nav. Their old row still exists, untouched. |
| **set**, and Clerk returns the same number | Insert violates `users_phone_key`; the catch path re-reads by `clerk_user_id`, finds nothing, returns `null` | No app account at all — whatever the surface does with a null user. Louder, and easier to diagnose. |

Email is **not** unique and is never consulted. There is no fallback.

## Detection

### Before anyone signs in — take a baseline

```sql
SELECT id, email, role, clerk_user_id, phone, created_at
FROM public.users
WHERE clerk_user_id IS NOT NULL
ORDER BY created_at;
```

Keep this. Repair is much easier when you know which row was the real one.

### The cheap decisive test

**Not needed for `admin@maanta.app` as of 2026-08-16** — see the status note at
the top. Use it for an account whose provenance is genuinely untested.

Nothing in the database records which instance minted a `sub`, so the only way
to know whether the current instance still matches is to sign in.

1. Note the admin's row `id` from the baseline.
2. Sign out fully, then sign in at `https://www.maanta.app/login`.
3. If the admin console is there, that account is fine — the current instance
   still presents the `sub` on their row. Nothing to repair.
4. If they land as an ordinary shopper, the orphan happened, and **the new row
   now holds the new `sub`** — which is exactly what the repair needs.

Do this with the admin account first and deliberately, at a time you can fix
it, rather than discovering it during a pilot session at the counter.

### Find orphans after the fact

```sql
-- Rows sharing an email, which is the duplicate-account signature.
SELECT lower(email) AS email_key,
       count(*)                                         AS rows_sharing_email,
       array_agg(id            ORDER BY created_at)     AS ids,
       array_agg(role          ORDER BY created_at)     AS roles,
       array_agg(clerk_user_id ORDER BY created_at)     AS clerk_ids,
       array_agg(created_at    ORDER BY created_at)     AS created
FROM public.users
WHERE email IS NOT NULL
GROUP BY lower(email)
HAVING count(*) > 1
ORDER BY 2 DESC;
```

To tell a working admin row from a shadow one, ask which has done anything:

```sql
SELECT u.id, u.role, u.clerk_user_id, u.created_at,
       count(l.id)       AS admin_ops,
       max(l.created_at) AS last_admin_op
FROM public.users u
LEFT JOIN public.admin_ops_log l ON l.admin_user_id = u.id
WHERE lower(u.email) = 'admin@maanta.app'
GROUP BY u.id, u.role, u.clerk_user_id, u.created_at
ORDER BY u.created_at;
```

For shoppers the equivalent question is which row has redemptions
(`public.redemptions.user_id`); for merchants, which row `public.merchants`
points at.

## Repair — order matters, because of a UNIQUE index

`users_clerk_user_id_key` is `UNIQUE (clerk_user_id)`. You therefore **cannot**
write the new `sub` onto the old row while the new row still holds it — the
statement fails. Clear it first.

Run as one transaction, substituting the two ids from detection:

```sql
BEGIN;

-- D124: the identity-freeze trigger permits this operator repair only when
-- the transaction carries the service_role claim. Run this in the Supabase
-- SQL editor; the MCP execute_sql session classifier does not provide this
-- practical repair path.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- 1. Release the new sub from the duplicate row.
UPDATE public.users
   SET clerk_user_id = NULL
 WHERE id = '<NEW_ROW_ID>';

-- 2. Move it onto the real row, which keeps its role, history and relations.
UPDATE public.users
   SET clerk_user_id = '<THE_NEW_SUB>'
 WHERE id = '<OLD_ROW_ID>';

-- 3. Read back before committing: exactly one row, the right one.
SELECT id, email, role, clerk_user_id
  FROM public.users
 WHERE id IN ('<OLD_ROW_ID>', '<NEW_ROW_ID>');

COMMIT;
```

The person signs in again and lands on their real account.

**What to do with the leftover row is not decided here.** It is now a
`clerk_user_id`-less `customer` row with no way to sign in, which is inert but
untidy. Deleting it touches foreign keys (`redemptions`, `merchants`,
`admin_ops_log`) and is a data-destroying act on a table the dispute path reads —
so it needs a founder call, not a line in a runbook. Leaving it is safe.

**For the phone-collision case** (the person had a phone number set), there is no
duplicate row to harvest a `sub` from — the insert never succeeded. You need the
new `sub` from the Clerk dashboard for that user, then step 2 alone.

## What this runbook deliberately does not do

- It does not change `ensureAppUser`. Whether the lookup should fall back to a
  verified email is a security decision — email is identity only if the new
  instance verified it — and it belongs in the decisions log, not here. That is
  D108's prevention half, still open.
- It does not re-point the 9 existing rows pre-emptively. Without a
  production-instance `sub` in hand, there is nothing to write; and re-pointing
  a row that was never orphaned would create the problem it is meant to fix.
- It does not rule on whether the instance change was intended. D99 closed on
  measurement with the cause unestablished, and that is still true.
