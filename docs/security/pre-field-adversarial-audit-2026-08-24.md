# MAANTA — Pre-field adversarial security audit

**Date:** 2026-08-24 · **Scope:** whole product, ahead of BBS Mall Node 0 Merchant 01
**Repo state:** `main` @ `49c2e39ebcc2e002e093428a1bb94e7a7beae728`, working tree clean
**Production:** Supabase `axrrslqssmbngbataejg` · **Migration ledger:** 100/100, verified by md5 of all version+name pairs
**Method:** read-only inspection of production, plus a fresh database built from all 100 migrations and attacked directly

---

## 1. Executive verdict

**CONDITIONAL GO.**

No finding in this audit exposes one party's data, money or account to another. Every
boundary the brief names — shopper → merchant, Merchant A → Merchant B, Staff A → Merchant B,
ordinary user → admin, and direct RPC invocation bypassing the UI — was attacked with a real
authenticated identity and **held**. The money path was proven exactly-once under an 8-way
concurrent race. Merchant 01, Staff 01 and Shopper 01 can use the product without being able to
access, alter or financially affect anyone else's data.

The conditions are **not** security blockers, and all of them were dispositioned by founder
ruling on 2026-08-24 (decisions log, same date). Every finding now has a decision:

| Finding | Ruling |
|---|---|
| **D168** — inert isolation policies | **Record and defer.** Do **not** repair by restoring broad SELECT on `merchants` — this audit showed that resurrects D147's critical leak. Fails closed today. Resolve later with a deliberately designed isolation mechanism, not before Merchant 01. |
| **D169** — fresh deploy weaker than prod | **Fix required before the next production migration is deployed**, with a ratchet. Does not delay Merchant 01; gates the *next* migration. |
| **SEC-C** — residual TRUNCATE/REFERENCES/TRIGGER | **Record/defer.** Low priority while unreachable through the app. Does not open a hardening cycle. |
| **SEC-D** — no `UNIQUE` on `users.email` | **Investigate before changing schema.** Understand what the duplicate group represents first; do **not** blindly add `UNIQUE(email)` given this product's identity/relink history and possible null/historical states. |
| **SEC-E / D171** — `is_blacklisted` unenforced | **Defer.** Decide what blacklisting is supposed to prevent before wiring it in. |
| **D170** — silent staff enrolment | **Ruled: staff acceptance required before access becomes active.** Merchant 01 / Staff 01 may proceed under explicit in-person consent recorded operationally; the productized acceptance flow is required **before scaled staff-seat issuance**. |

### The pre-field gate

| Gate | State |
|---|---|
| **Security** | **CONDITIONAL GO** ✅ |
| **D162 — what3words quota** | **Must unblock.** Now the practical blocker: there is no value sending the first independent merchant into a journey already known to be uncompletable. |
| **Demo mode** | **Switch off** before genuine field measurement (per the existing D14/D18 launch procedure). 208 synthetic merchants visible while observing Merchant 01 and Shopper 01 contaminates the experiment; the shopper should see the actual Node 0 marketplace, even if it initially contains one shop. |
| **Merchant 01** | **then GO** |

Neither non-security condition was actioned by this audit — both are founder/ops steps, and
flipping demo mode is a production mutation this session is not authorised to make.

What would have made this a NO-GO — cross-tenant reads, forgeable identity, client-supplied fee
amounts, a double-charge under concurrency, an admin RPC reachable by a merchant, a secret in the
browser bundle — was tested for specifically and found absent.

### Market-validation baseline (unchanged, and preserved)

Production holds **2 merchants, both internal** (`SKANDI SKAN`, `E2E Full Sweep Shop`), **2 real
deals**, and **1 non-demo `success` redemption** — controlled E2E evidence from internal
rehearsal. This audit did not delete, relabel or reinterpret any of it. The baseline remains
**0 genuine external merchants and 0 genuine external shoppers** until BBS field activity proves
otherwise.

---

## 2. Attack-surface matrix

Every row was executed, not reasoned about. Cross-tenant and money rows ran against a fresh
database seeded with two independent merchants; read-isolation rows were additionally confirmed
against production with real identities inside a rolled-back transaction.

| Principal | Legitimate surface | Attempted unauthorized action | Result |
|---|---|---|---|
| Anonymous | `deals_public_browse`, `merchants_public_browse`, marketing | read `merchants` / `deals` base tables | **BLOCKED** — no grant |
| Anonymous | — | read wallet/PII via public views | **BLOCKED** — columns absent from view |
| Shopper | own claims, own user row, browse | read any merchant ledger | **BLOCKED** — 42501 |
| Shopper | — | read all `users` rows | **BLOCKED** — RLS returned own row only (1) |
| Shopper | — | read `fraud_events`, `app_config` | **BLOCKED** — no grant |
| Shopper | — | read `admin_ops_log` | **BLOCKED** — grant exists, RLS returned 0 rows |
| Shopper | — | `claim_deal` as another user's id | **BLOCKED** — identity mismatch |
| Shopper | — | `verify_redemption` on own ticket | **BLOCKED** — not a verifier |
| Shopper | — | `activate_merchant`, incl. passing a real admin's id | **BLOCKED** — admin only |
| Shopper | — | `reverse_success_fee`, `admin_redemption_detail` | **BLOCKED** — admin only |
| Shopper | — | `deduct_success_fee_or_record_arrears`, `record_merchant_ledger_entry`, `wipe_demo_data`, `capture_lead`, `check_rate_limit` | **BLOCKED** — EXECUTE revoked |
| Shopper | — | `onboard_merchant` for another user's id | **BLOCKED** — caller must be the merchant |
| Shopper | — | self-escalate `users.role` to `admin` | **BLOCKED** — trigger |
| Merchant A owner | own shop, deals, wallet, staff | read Merchant B ledger / staff / redemptions / topups | **BLOCKED** (all four) |
| Merchant A owner | — | insert a staff seat into Merchant B | **BLOCKED** |
| Merchant A owner | — | `verify_redemption` against Merchant B | **BLOCKED** — not verifier of B |
| Merchant A owner | — | verify a Merchant A ticket presented at B | **BLOCKED** — ticket scoped to merchant |
| Merchant A owner | — | raise own `account_balance` directly | **BLOCKED** — write grant revoked |
| Merchant A owner | — | insert a fabricated KES 999,999 top-up | **BLOCKED** — RLS default-deny |
| Merchant A owner | — | `activate_merchant` on own pending shop | **BLOCKED** — admin only |
| Merchant A owner | — | `reverse_success_fee` on own charged fee | **BLOCKED** — admin only |
| Merchant A owner | — | `admin_redemption_detail` | **BLOCKED** — admin only |
| Staff A (can_verify) | verify at Merchant A's counter | read Merchant B ledger | **BLOCKED** |
| Staff A | — | insert a staff seat into Merchant B | **BLOCKED** |
| Staff A | — | self-promote own permissions | **BLOCKED** |
| Staff A | — | `verify_redemption` against Merchant B | **BLOCKED** |
| Staff A | — | `admin_redemption_detail` | **BLOCKED** — admin only |
| Staff A | — | `deduct_success_fee_or_record_arrears` directly | **BLOCKED** — EXECUTE revoked |
| Admin | approvals, reversals, disputes | replay `activate_merchant` to farm opening credit | **BLOCKED** — `already_active`, then UNIQUE |
| Pending merchant | onboarding only | publish a deal | **BLOCKED** — 403, status gate |
| Any caller | — | supply the success-fee amount | **BLOCKED** — amount must equal `app_config` |
| Any caller | — | mass-assign `status` / `tier` / `role` / `merchant_id` via API body | **BLOCKED** — routes destructure explicit fields; tenant from session |

---

## 3. Findings

Nothing reached 🔴 CRITICAL or 🟠 HIGH. No fixes were applied, because the audit's own rule is
that MEDIUM and below are recorded first and not silently changed — and both MEDIUM findings are
migrations against money-path objects during an active field validation.

### 🟡 MEDIUM — SEC-A · Four tenant-isolation RLS policies are inert (drift **D168**)

* **Component:** `transactions_merchant`, `staff_owner_manage`, `redemptions_merchant`,
  `pending_topups_merchant_read`
* **Attack path:** none — this is a failure *of a control*, not an exposure.
* **Mechanism:** each policy's `USING` clause sub-selects `public.merchants`. A policy expression
  runs with the **querying role's** privileges. D147 (`20260820120000`) revoked `authenticated`'s
  SELECT on `merchants`, so these four policies — living on *other* tables — can no longer read
  the table they reference.
* **Evidence:** on production, impersonating a real merchant owner's Clerk `sub` under
  `SET LOCAL ROLE authenticated`, a bare `select count(*) from public.merchant_transactions`
  raises `ERROR 42501: permission denied for table merchants`. Identical on `redemptions` and
  `merchant_staff`. Reproduced on the fresh DB. In a rolled-back transaction with SELECT
  re-granted, the same policies filter **correctly** (owner A saw 1 merchants row and 0 of
  merchant B's ledger rows) — proving the policies are right and simply never execute.
* **Impact:** fails **closed**; no data is exposed and no live surface is broken, because every
  server route reads these tables via `createServiceClient()` or a SECURITY DEFINER RPC. The cost
  is that isolation on four money/PII tables rests on the app's service-role habit plus the
  absence of a grant, not on the policy a schema reader would believe is enforcing it — and the
  obvious repair for the error (re-granting table-wide SELECT on `merchants`) reintroduces D147's
  CRITICAL exactly. That was confirmed: with the grant and the old broad policy restored, a plain
  shopper read another merchant's `account_balance` and `phone` off the base table.
* **Production affected:** yes — production and a fresh deploy behave identically here.
* **Status:** recorded, not fixed. Recommended fix is a SECURITY DEFINER helper
  (`public.user_owns_merchant(uuid)`) substituted into the four `USING` clauses, mirroring
  `current_user_id()` / `merchant_verify_authorized()`.
* **Regression guard:** none exists. Recommended companion: a SQL scenario that walks
  `pg_policies` for cross-table references and asserts each referenced table is readable by the
  roles the policy applies to.

### 🟡 MEDIUM — SEC-B · A fresh deploy is weaker than production on the wallet ledger (drift **D169**)

* **Component:** `public.merchant_transactions` grants
* **Attack path:** none today — RLS default-deny blocks the write.
* **Mechanism:** `20260723120000` revokes `authenticated` writes on `merchants`, `deals` and
  `redemptions` but **not** `merchant_transactions`, while Supabase's default privileges grant
  ALL on every new `public` table.
* **Evidence:** fresh-vs-production grant diff is exactly three rows — `merchant_transactions` /
  `authenticated` / INSERT, UPDATE, DELETE — present in fresh, absent in production. Attempting a
  fabricated KES 999,999 top-up as an authenticated merchant owner on the fresh DB returns
  `new row violates row-level security policy for table "merchant_transactions"`.
* **Impact:** repo ≠ production on a money table, in the direction where the **repo is weaker**.
  A rebuild, DR restore, staging clone or second node would come up holding write grants
  production does not have, with nothing between that grant and arbitrary ledger writes except the
  continued absence of any INSERT policy on the table.
* **Production affected:** no — production already lacks the grants. The defect is in what a fresh
  deploy would recreate.
* **Status:** recorded, not fixed. One-line fix:
  `REVOKE INSERT, UPDATE, DELETE ON public.merchant_transactions FROM authenticated;` — it changes
  no production behaviour, it makes a future deploy match what production already is.
* **Regression guard:** recommended scenario in `revoke_authenticated_writes_core_tables_test.sql`.

### 🔵 LOW — SEC-C · Residual `TRUNCATE` / `REFERENCES` / `TRIGGER` grants to `authenticated`

Twelve tables — including `users`, `merchants`, `redemptions`, `merchant_transactions` and
`admin_ops_log` — still carry Supabase's default `TRUNCATE`, `REFERENCES` and `TRIGGER` grants to
`authenticated`. **TRUNCATE is not subject to row-level security**, so were a SQL-capable path
ever to exist for a customer role, an audit log or the ledger could be emptied outright. It is not
reachable today: PostgREST exposes no TRUNCATE verb and no DDL, and the Supabase SQL editor
authenticates as a dashboard/service identity, not an `authenticated` JWT. Least-privilege
hardening, not an exploitable weakness. Not recorded as its own drift row — it is the same class
as D153 and belongs with whatever least-privilege sweep answers it.

### 🔵 LOW — SEC-D · `users.email` carries no uniqueness constraint while being an identity key

`users` is unique on `auth_uid`, `clerk_user_id` and `phone` — **not** on `email`. Since D154
(staff seats link by email) and D158 (the phone exemption is derived from `users.email`), email is
load-bearing for access control. Production currently holds one duplicate-email group: the
founder's own address on a seeded `is_demo` **admin** row and a real `merchant_admin` row, under
different Clerk IDs. No exploit exists, because both consumers fail closed — the verified-email
relink matches only `is_demo = false` rows and hard-fails on more than one match, and staff-seat
linking uses `.maybeSingle()`, which errors rather than picking a winner when two seats share an
address. The invariant is therefore enforced by convention in two call sites rather than by the
schema. Worth a partial unique index (`WHERE is_demo = false AND email IS NOT NULL`) when the
duplicate is cleaned up; not urgent, and not safe to add while the duplicate exists.

### 🔵 LOW — SEC-E · `users.is_blacklisted` is enforced nowhere (drift **D171**)

The column exists and the admin console renders it as a status chip, but on production **zero**
functions and **zero** RLS policies reference it. `claim_deal` does not consult it and neither does
`verify_redemption`. An admin who blacklists an abusive shopper during Node 0 would see the label
change and nothing else: that shopper can still claim and still redeem. Not currently harmful —
production has 0 blacklisted users, real or demo, and the shopper-side fraud story that actually
runs is Guardian plus `review_required`. It matters because it is a control-shaped label that
controls nothing, and Node 0 is exactly when an operator would reach for it. Compounding: a `users`
row with no foreign-key references can be deleted by its own holder (RLS correctly scopes the
delete to self — deleting another user's row affects 0 rows), and the next sign-in re-provisions a
fresh row, so even an enforced flag would be resettable by an unreferenced account. In practice any
shopper worth blacklisting has redemptions, and `redemptions_user_id_fkey` blocks the delete —
both verified. Founder ruling, not an engineering fix: enforce it, remove it, or relabel it.

### ⚪ INFORMATIONAL — SEC-F · Dependency advisories

`npm audit --omit=dev` reports **2 high**: the Next.js 14.2.35 advisory chain and transitive
`postcss`. Each was read rather than counted. The SSRF-in-rewrites advisory requires an
attacker-controlled rewrite destination — this app's `rewrites()` holds only static PostHog
proxies. The custom-server SSRF advisory does not apply on Vercel. The `postcss` advisories are
build-time, over the app's own CSS. The remedy is `next@16`, a breaking major upgrade, which is
squarely the kind of work Node 0 Field Validation Mode freezes. Recommend scheduling it as
deliberate post-pilot maintenance, not as an audit fix.

### ⚪ INFORMATIONAL — already tracked, re-confirmed rather than re-reported

* **D83** (open) — the IntaSend webhook authenticates with a static shared secret echoed in the
  body, with no HMAC over the payload. Confirmed still true. Materially compensated: the handler
  reconciles against a `pending_topups` row written *before* the provider call and refuses on
  merchant mismatch, amount mismatch, or no pending row, and is idempotent on the app-minted
  `api_ref`. Residual risk is that a holder of the shared secret could confirm a genuine pending
  top-up that was never paid. IntaSend is not in the Node 0 pilot path. Stripe, by contrast, does
  full HMAC verification via `constructEvent`.
* **D153** (open) — four demo read predicates are SECURITY DEFINER and `anon`-executable.
  Re-confirmed; unchanged; an existence oracle on unguessable v4 UUIDs.
* **D14 / D18** (open) — demo mode on in production, and the two demo switches can drift apart.
  Re-read live: `demo_mode_enabled = 'true'`. Founder-owned; see §1 condition 2.

### ⚪ INFORMATIONAL — new, but a product ruling rather than a defect (drift **D170**)

A merchant can enroll any shopper as staff knowing only their email address; the shopper's role
flips from `customer` to `merchant_staff` on next sign-in, with `can_verify` defaulting to true,
without being asked. Everything thereby exposed belongs to the merchant who issued the invite, so
this is **not** a cross-tenant breach, and owners, already-linked staff and admins are all immune.
What is absent is the invitee's consent. Recorded for a founder ruling because D154 made email a
linking key and addresses are far easier to guess than phone numbers.

---

## 4. Cross-tenant proof

| Boundary | Prevented? | How it was proven |
|---|---|---|
| Shopper → merchant private data | **Yes** | Ledger/staff/redemption/topup reads all refused; `users` read returned own row only; public views carry no wallet, contact or fee columns |
| Merchant A → Merchant B | **Yes** | All four of B's tables refused to A; A could not insert a staff seat into B; A could not verify against B |
| Staff A → Merchant B | **Yes** | Ledger read, seat insert, self-promotion and `verify_redemption` against B all refused |
| Ordinary user → admin/founder | **Yes** | `activate_merchant`, `reverse_success_fee`, `admin_redemption_detail` refused to shopper, owner **and** staff; role escalation refused by trigger |
| Direct RPC bypass (no UI) | **Yes** | Every probe above called the RPC or table directly under `SET LOCAL ROLE authenticated`; the UI was never in the path |

**One caveat, stated because it is exactly the trap this brief warns about.** Several
cross-tenant blocks currently report `permission denied for table merchants` — they fail for the
*grant* reason (SEC-A), not because the policy filtered. Isolation genuinely holds either way, and
the same probes were re-run with the grant restored to confirm the policies also filter correctly.
But "these tests pass" and "these policies work" are not the same statement here, and SEC-A is
recorded so that distinction is not lost.

Two probes in the first pass failed for the wrong reason and were re-run: `reverse_success_fee`
and `admin_redemption_detail` initially errored inside my own test harness's subquery rather than
inside the function. Re-run with the redemption id resolved up front, both correctly returned
`unauthorized: admin only`.

---

## 5. Money-path proof

**Proven: one verified redemption → exactly one success fee → exactly one ledger effect.**

Single path, on the fresh DB: shopper claims → Staff A verifies → `status=success`,
`fee_status=charged`, `fee=30.00`, balance 1000.00 → 970.00. Assertions after: 1 success
redemption, **1** success-fee ledger row, **1** total ledger row, balance down by exactly KES 30.

**Replay:** the same OTP re-submitted → `redemption_not_found_or_already_used`. No second charge.

**Concurrency:** eight simultaneous `verify_redemption` calls on one OTP, released together by a
shared wall-clock barrier → **1 success, 7 rejected**, **1** ledger row, balance 970.00 → 940.00.
Exactly KES 30 moved. No double-charge.

**Fee integrity:** the amount is never client-supplied. `deduct_success_fee_or_record_arrears`
rejects any amount ≠ `app_config.success_fee_kes`, is EXECUTE-revoked from every customer role,
and reads the fee from the snapshot stamped onto the redemption at claim time by the
`enforce_deal_success_fee` trigger (observed: a deal inserted without a fee came back with 30.00).

**Opening credit is not repeatable**, with two independent backstops: `already_active` on replay,
and — even after forcing the merchant back to `pending`, a tamper no attacker can perform — the
`merchant_transactions_provider_reference_key` UNIQUE constraint aborts the second credit. Final
state after three attempts: balance 300.00, exactly 1 credit row.

**Production reconciliation:** 1 non-demo `success` redemption, 1 fee row for it, 3 fee rows total
against 3 distinct `reference_id`s, 0 fee rows without a reference, 0 reversals. No orphans, no
doubles.

---

## 6. Identity proof

The Clerk ↔ `public.users` mapping is **one-to-one and holds** against the tested relink,
duplicate and escalation paths.

* `current_user_id()` and `current_user_role()` resolve from a `public.users` **column**, keyed on
  `auth.jwt() ->> 'sub'`. Role is therefore not forgeable in a JWT claim — the single most
  important property in the model, and it is correct.
* `users.clerk_user_id` is UNIQUE; a second row cannot claim a live `sub`.
* Identity columns (`phone`, `email`, `clerk_user_id`, `auth_uid`) are frozen against their own
  holder by `prevent_identity_self_change` (D142), so a shopper cannot rewrite their email to
  capture a staff seat. Verified live: even a raw `postgres` session is refused.
* `prevent_self_role_escalation` refuses any role change from a non-service, non-admin caller.
  Tested: `unauthorized: cannot change role`.
* The verified-email relink accepts only a **Clerk-verified** primary address, matches only
  `is_demo = false` rows, and **hard-fails on ambiguity** rather than guessing — which is what
  neutralises the one duplicate-email group on production (SEC-D).
* `users` INSERT is granted to `authenticated` but is unreachable — tested, not assumed: inserting
  a second row for oneself hits `users_pkey`; inserting a row with `role = 'admin'` (whether as an
  existing user or an unknown `sub`) is refused by the RLS check. Self-`DELETE` is scoped to one's
  own row (deleting another user's affects 0 rows) and is blocked by `redemptions_user_id_fkey`
  once the account has any activity — see SEC-E for the one case where it succeeds.

---

## 7. Production / repo reconciliation

| Item | Result |
|---|---|
| Repo migrations | **100** |
| Production `schema_migrations` | **100** |
| Pair-wise agreement | **exact** — md5 of all sorted `version\|name` pairs is `1dea2c83fcb86a47c409fbeecd8176e9` on both sides |
| High-water mark | `20260823130000_merchant_phone_optional_with_verified_email` |
| Fresh DB build | **all 100 migrations applied cleanly**, no failures |
| RLS policies, fresh vs prod | **identical** — 45 = 45, same names, commands and expressions |
| SECURITY DEFINER functions | **identical** — 51 = 51 |
| RPC EXECUTE grants | **identical** — 50 = 50 |
| Table grants, fresh vs prod | **3-row difference** → SEC-B / D169, the only drift found |

Deployment alignment (`main` serving production) was **not** re-verified in this session; it is
outside a database/code audit's reach and remains governed by `prod-branch-guard.yml`.

---

## 8. Tests — what actually ran

| Check | Result |
|---|---|
| `npm run lint` | **pass** (exit 0) |
| `npm run typecheck` | **pass** (exit 0) |
| `npm test` | **pass** — 1061 tests across 125 files |
| `npm run build` | **pass** (exit 0), including the three chained post-build gates (`check:tokens`, `check:canonicals`, `check:forms`) |
| SQL suites (`supabase/tests/*.sql`) | **31 of 31 pass** against the fresh 100-migration chain |
| Skipped / `.only` / `.todo` tests | **none** — the suite has no skips |
| Drift-register schema test | **pass** — 12/12, after the three new rows |

**Ratchet quality — mutation-checked, not assumed.** The D147 guard
(`browse_views_test.sql` Scenarios H/I/J) was tested against the vulnerable schema rather than
trusted: baseline **pass**; re-granting base SELECT on `merchants` → **fail**, with an actionable
message; restoring the full vulnerable state (grant + broad `merchants_customer_read`) → **fail**.
The mutation was confirmed to be real — in that state a shopper read another merchant's
`account_balance = 940.00` and phone off the base table. Restoring the patched state → **pass**
again. This guard genuinely fails against the version it was written for, and it explicitly tests
`authenticated`, not just `anon` — the "green for the wrong reason" defect its own migration
documents.

**Owed / not run.** The `db-tests` CI job could not be run in its native form: this environment's
proxy blocks the container registry, so `supabase start` cannot pull images. The suites were run
instead against a locally built PostgreSQL 16 cluster with a Supabase-equivalent bootstrap (roles,
`auth`/`extensions`/`storage` schemas, and Supabase's default privileges, so the real grant
surface is reproduced). Production is PostgreSQL 17. The migration chain and all 31 suites pass on
16; a PG17-specific difference would not be visible here. `npm run test:e2e` was not run — it
targets a deployed environment and needs storage-state secrets.

---

## 9. Existing gaps, separated by kind

**Security blockers for Merchant 01:** none.

**Security hardening (recorded, not blocking):** D168, D169, D171, SEC-C, SEC-D, D153, D83.

**Field / product defects (not security):** D14 and D18 (demo mode on in production — the pilot
condition), D162 (what3words over quota in production, which blocks self-serve onboarding and is a
genuine field blocker for Merchant 01, though not a security one), D164–D167 from the 2026-08-23
full-role E2E run, D166 (deal wizard completes before the tier limit is enforced).

**Privacy / operational gaps (not vulnerabilities):** D144, D146 (legal/privacy), D145
(ops/continuity), D156 (Clerk deliverability to Microsoft mailboxes), D151 (SMS, deferred).
On PII specifically: the audit found no unnecessary exposure — public views carry no contact
detail, shopper phone numbers are server-masked before reaching the counter UI
(`maskPhone`), and the logging discipline is real (what3words logs status and provider error
code, never the key or the address; identity failures log an error code, never the address).
Data export, deletion and retention processes remain operational gaps owned by D144/D146, not
engineering defects.

**Explicitly out of scope and untouched:** agent-assisted acquisition (D159 must be resolved
first), auth-strategy changes, pricing, UI polish, the `next@16` upgrade.

---

## 10. Files, git, production

* **Branch:** `claude/maanta-security-audit-vnr9i6`
* **Files changed:** `docs/maanta-drift-register.md` (rows D168, D169, D170, D171 appended; `Last
  updated` bumped) and this document.
* **Migrations added:** none.
* **Code changed:** none. No fix was applied, because nothing reached the CRITICAL/HIGH bar the
  brief authorises for immediate repair — and the founder explicitly withheld fix authorisation
  from the PR that publishes this report. D169's fix is owed before the next production migration,
  as its own change.
* **Production mutated: NO.** Every production interaction was a read, or a `BEGIN … ROLLBACK`
  impersonation that committed nothing. No production object was created, altered or dropped; no
  customer or business record was touched. All mutation testing ran against a throwaway local
  database.

---

## 11. The question this audit was asked

> Is MAANTA safe enough for Merchant 01, Staff 01 and Shopper 01 to use it without being able to
> access, alter or financially affect data belonging to someone else?

**Yes.** Tested directly, from each of those three identities and against a second merchant, at
the database and RPC layer rather than through the UI. The isolation holds, the money moves
exactly once, and identity cannot be forged or escalated. The two MEDIUM findings are about
whether the controls would still hold in configurations that do not exist yet — a rebuilt
database, and a future PostgREST read path — not about the pilot in front of us.
