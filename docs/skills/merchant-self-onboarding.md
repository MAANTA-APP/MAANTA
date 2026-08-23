# Merchant self-onboarding — what it is, what gates it, and how to change it

Status: current as of 2026-08-23, with D158 **live on production** (migration
`20260823130000`, ledger 100/100). Owner rule: **read the migration and the
route before this doc** — they win.

## The path, end to end

`/merchants/join` (public lead form: shop name + phone) → `/login?next=/merchant/onboard?shop=…`
→ the four-step wizard (`src/app/merchant/onboard/onboard-wizard.tsx`)
→ `POST /api/merchants/onboard` → the `onboard_merchant` RPC.

No agent or admin is in that loop. The route authenticates the caller and passes
`p_user_id = appUser.id`, so **a merchant can only ever onboard themselves**. The
wizard's "Were you helped by a Maanta agent?" step is *attribution only* — "No"
is the ordinary self-serve case (`onboarding_mode = 'self_serve'`).

The shop name travels in the URL; the phone travels in `sessionStorage`
(`@/lib/merchant-join-handoff`) so it stays out of history, `Referer` and the
PostHog `$current_url`. **Do not add `?phone=` back.**

## Two gates, and only one of them is approval

1. **Admin approval.** `onboard_merchant` inserts `status = 'pending'` and
   promotes the user to `merchant_admin` in the same transaction. A pending
   merchant can sign in, reach the merchant app and top up — but **cannot
   publish**: `api/deals/route.ts` and `api/deals/repost/route.ts` both return
   403 unless `merchant.status === 'active'`. Only
   `/api/admin/merchants/[id]/approve` flips that (and grants the Elite trial).
   The app-shell layout gates on *having* a merchant record, not on approval, so
   the lifecycle banner ("Waitlist — pending approval") is display only. The
   enforcement lives on the deal-write routes.

2. **Contact requirements.** See below.

## D158 — owner phone is optional with a verified email

Founder ruling 2026-08-23, option B. Before it, step 1 held Continue disabled
until Owner phone was filled and `merchants.phone` was `TEXT NOT NULL`, which
contradicted the email-primary ruling and forced the pilot merchant through the
admin-assisted path.

**The rule now:** owner phone is optional when the authenticated account already
has a verified email. Phone remains available as an optional business contact,
and a phone that IS supplied is still format-checked as Kenyan on this
merchant-authored path (the admin route is deliberately wider —
`isValidInternationalPhone`).

Three things to keep straight:

- **The signal is `users.email`, not the email typed into the wizard.** That
  column is written from `verifiedPrimaryEmail()` alone and frozen against its
  holder by D142, so its presence *is* proof the account controls the mailbox —
  the same argument D154 used to link staff seats by email. The typed field is
  shop contact detail nobody has proven. Using it would let anyone skip the
  requirement by typing anything.
- **The route is the gate; the wizard is a convenience.** Both read one predicate
  (`src/lib/merchant-onboarding.ts`) so they cannot drift, but the route
  re-derives `hasVerifiedEmail` from the session and ignores any
  `hasVerifiedEmail` in the request body. A guard asserts that.
- **A shop can never hold zero contact channels.** When no phone is given, the
  account's verified address becomes the shop contact unless the merchant typed
  one. `merchants_contact_present` is the DB backstop, and `onboard_merchant`
  raises a named `contact_required` so the route can return an actionable 400
  instead of a CHECK violation surfacing as a 500.

**The contact fallback is internal data, not storefront data.** Letting a
private login address stand in as the shop contact is only acceptable because
`merchants.email` cannot reach a shopper: it is absent from
`merchants_public_browse` and from `DEAL_SELECT`, and D147 revoked
anon/authenticated SELECT on the base table. That was true incidentally before
D158; it is now asserted in both suites (the SQL test reads
`information_schema` for the view's columns, the vitest guard reads the join in
`DEAL_SELECT`). **If a contact should ever appear on a storefront it needs the
merchant's explicit consent and its own column — do not promote this one.**

Unlike D154 this weakens no guard: `merchants.phone` is contact detail and the
M-Pesa top-up **prefill** (a prefill only — `/api/topup` re-validates what is
submitted). Nothing links or authenticates on it. Staff linking keys on
`users.phone`/`users.email`, a different table; no notification path reads
`merchants.phone` at all (D109 corrected the comment that claimed otherwise).

Because the column became nullable, four display sites now fall back rather than
render blank: merchant staff list, admin approvals, admin merchant detail, and
the top-up prefill (which already refused a non-Kenyan number).

## The trap: `onboard_merchant` has had two signatures

**Read the CURRENT function before editing it — never an older migration that
happens to describe one.** This is D106's rule and it bit during D158.

- `20260702085628` created an **11-argument** version.
- `20260816020000` created the **12-argument** version
  (`p_admin_user_id` trailing) and **dropped the 11-arg overload on purpose** —
  two overloads with defaults make every existing call ambiguous
  (`function public.onboard_merchant(...) is not unique`). Its own comment records
  that this is how that file first failed CI.

The D158 migration was first drafted against the superseded 11-arg body, which
silently **re-created the dropped overload**. Every onboarding call — merchant,
admin and agent-assisted — would have started failing on an ambiguous function.
Three SQL suites caught it (`admin_assisted_onboarding_test`,
`onboard_agent_attribution_test`, and the new `merchant_phone_optional_test`).
It never reached a commit.

The apply itself carried the same lesson forward: the MCP apply minted its own
version (`20260823134241`, **eight for eight**) and the ledger had to be repaired
to the repo filename `20260823130000` before anything else. Always read the
ledger back after an MCP apply.

Two habits that catch this class of bug:

- After any `onboard_merchant` change, assert **exactly one** overload survives:
  ```sql
  SELECT p.oid::regprocedure FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'onboard_merchant';
  ```
- Call it with **named** parameters in tests, so a reintroduced overload fails
  loudly instead of silently binding to the wrong function.

## Running the SQL locally without Docker

`make db-verify` needs `supabase start`, which needs a Docker daemon. Where there
isn't one, a bare Postgres 16 plus a small Supabase shim replays the whole
migration history and runs `supabase/tests/*.sql` — this is how D158 was verified:

- `initdb` as an unprivileged user (it refuses to run as root);
- shim: schemas `auth`, `extensions`, `storage`, `supabase_migrations`; roles
  `anon` / `authenticated` / `service_role` / `authenticator`; `auth.jwt()`,
  `auth.uid()`, `auth.role()` reading `request.jwt.claims`; `storage.buckets`,
  `storage.objects`, `storage.foldername()`;
- `uuid-ossp` and `pgcrypto` must be created **`WITH SCHEMA extensions`**, and
  the database needs `search_path = public, extensions`, or PostGIS's `geography`
  and `extensions.uuid_generate_v4()` fail to resolve;
- `postgresql-16-postgis-3` must be installed.

This is a **mirror, not the gate**. The CI `db-tests` job on a real Supabase
stack is what counts, and a fresh-DB `make db-verify` is still owed.

## Checklist for the next change here

1. Read `onboard_merchant`'s current definition (`pg_get_functiondef`), not a
   migration file, and keep the signature — or drop the old one in the same
   migration.
2. Keep the phone rule in `src/lib/merchant-onboarding.ts`. A second copy is a
   second place to drift.
3. Any relaxation of a contact requirement must keep
   `merchants_contact_present` satisfiable, and must derive its exemption from a
   *proven* value, never from form input.
4. Claude does not apply migrations to production. Write it, test it locally,
   hand the apply to a human (`docs/ops/supabase-migrations.md`).
