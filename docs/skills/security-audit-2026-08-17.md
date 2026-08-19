# Security audit — 2026-08-17

**Mode:** Reviewer. **Scope:** the whole `maanta-app` attack surface — auth and
role guards, API route handlers, DB grants, RLS policies, the money RPCs, both
payment webhooks, and secret handling. **Target:** the repo at
`7fba31e`, read against **live production** `axrrslqssmbngbataejg`.

Findings are recorded in `docs/maanta-drift-register.md` as **D123**.

> **Row numbers changed on merge.** This audit opened its findings as D115–D119
> while its branch sat unmerged. `main` had meanwhile issued those same numbers
> to unrelated rows (a Clerk reverification fix and the deal-category work), and
> the register is append-only, so the branch renumbered on the way in:
> **D115→D123, D116→D124, D117→D125, D118→D126, D119→D127.** Anything quoting the
> old numbers from before 2026-08-19 means the security rows; the register is the
> authority. This file
is the narrative; the register is the state. Read the register first.

The reusable prompt that drives an audit like this one — adversarial mindset,
non-destructive proof, repo reporting discipline — is in
`docs/maanta-claude-operating-system.md` → **Prompt pack → Security-audit prompt
(Reviewer, adversarial)**.

---

## Headline

**Round 1: one critical, exploitable finding (D123).** A second pass the same day
(see *Round 2* below) added **D124** — an authenticated privilege escalation to
merchant staff via a self-written phone — and **D125** (least-privilege on demo
RPCs). Three fixes written, all verified non-destructively, none applied.

`public.merchants_public_browse` is a writable back door into `public.merchants`
for **any signed-in user**. It defeats the write lockdown that
`20260723120000_revoke_authenticated_writes_core_tables.sql` established and
that `revoke_authenticated_writes_core_tables_test.sql` asserts — because both
the migration and the test name the **table**, and the exposure is on the
**view**.

The fix is written and verified but **deliberately not applied**: it needs a
human (`docs/ops/supabase-migrations.md`).

- Migration: `maanta-app/supabase/migrations/20260817120000_revoke_authenticated_writes_browse_views.sql`
- Guards: `maanta-app/supabase/tests/browse_views_test.sql` Scenarios E, F, G

---

## The finding, and why three correct changes produced it

No single migration is wrong. The hole is the intersection of three.

1. **`20260723120000`** revoked `INSERT/UPDATE/DELETE` on `merchants`, `deals`
   and `redemptions` from `authenticated`. Necessary: Supabase's default
   privileges grant `ALL` on everything in `public` to `anon`/`authenticated`,
   and the RLS policies on those tables are unrestricted `FOR ALL` with no
   column-level `WITH CHECK`.

2. **`20260723130000`**, one day later, set `security_invoker = false` on the two
   browse views. Also necessary, and its docblock reasons it out correctly: anon
   had just lost SELECT on the base tables, so an *invoker* view could not serve
   the pre-sign-in browse surface at all.

3. **Nothing ever revoked writes on the views.** They kept the default grant.

That is only a vulnerability if the view is auto-updatable, and
`merchants_public_browse` is:

| Property | Value on production | Why it matters |
|---|---|---|
| `information_schema.views.is_updatable` | `YES` | One table, no join, plain column refs → PostgreSQL auto-updates it |
| every column `is_updatable` | `YES` | All 14 projected columns are writable |
| `reloptions` | `security_invoker=false` | Underlying write runs as the view **owner** |
| view owner | `postgres`, `rolbypassrls = true` | **RLS on `merchants` is not applied at all** |
| `authenticated` grants | `INSERT, UPDATE, DELETE, SELECT` | The default grant, never revoked |

### Proof (nothing was executed or written)

Planned under `SET LOCAL ROLE authenticated`, inside a rolled-back transaction:

```
EXPLAIN UPDATE public.merchants_public_browse
   SET tier = 'elite', is_featured = true
 WHERE node = 'BBS Mall';

Update on merchants  (cost=0.14..47.62 rows=0 width=0)
  ->  Index Scan using idx_merchants_node on merchants  (rows=40)
        Index Cond: (node = 'BBS Mall'::text)
        Filter: (is_visible AND (NOT is_shadow_banned) AND (status = 'active') AND ...)
```

It rewrites to `Update on merchants` over ~40 live rows, and the only `Filter`
is the view's own `WHERE` — **no RLS qual**. The negative control, the identical
statement against the base table as the same role, fails as designed:

```
ERROR: 42501: permission denied for table merchants
```

### What it gets an attacker

The caller needs **no merchant account** — any shopper session plus the
publishable anon key. Reachable columns are the view's own list:

- `tier` → free **Elite** (KES 3,500/month, 2 live deals, boost eligibility)
- `status`, `is_visible` → hide or suspend **any other live merchant at the node**
- `is_featured` → self-granted curated placement
- `trust_metric` → a fraud-review input
- `what3words_address`, `floor`, `unit_number` → **redirect shoppers to the wrong
  physical shop**, which is a counter-level trust failure, not a cosmetic one

The view's `WHERE` limits which rows are *reachable* (active, visible,
non-shadow-banned) but not which of them a reachable statement may *touch*. So
it is competitor sabotage as much as self-promotion. It does **not** reach
`account_balance` — that column is not projected, so the wallet was never
directly writable, and no path here mints money.

### Scope of the fix

The migration revokes writes on **all four** `public` views, not just the
exploitable one. `deals_public_browse` is inert today only because it joins
`merchants` (so it is not auto-updatable), and `admin_fee_reversal_log` only
because it is `security_invoker = true`. Both are inert *by accident of current
shape* — and shape is exactly what changed silently here:
`merchants_public_browse` was recreated by `20260726120000` (lat/lng) and
`20260729141000` (demo isolation), neither of which had any reason to think
about grants.

Nothing in `src/`, `scripts/` or the `Makefile` writes through a view, so the
revoke costs nothing.

**Scenario G is the durable part.** It fails on *any* view in `public` that
grants a write to `anon`/`authenticated`. Asserting the grant is right because
the grant is always load-bearing, whereas auto-updatability and
`security_invoker` are properties nobody checks when editing a view. Dry-run
against production, G correctly names all 12 offending grants today.

### Verification actually performed

`make db-verify` could not run — the Supabase CLI is absent in this container
(`docker: yes`, `psql: yes`, `supabase: NO`). Instead the migration was
rehearsed against production inside `BEGIN … ROLLBACK`:

- Scenario G's query goes clean
- `anon` still reads 211 merchant rows through the view
- the tier-escalation `UPDATE` raises `insufficient_privilege`
- **post-rollback re-count confirms production still carries all 12 grants** —
  nothing was applied

So: the fix is verified to work, and is **not deployed**. The SQL tests
themselves have not been executed by a runner; they need `make db-verify` or the
CI `db-tests` job.

---

## Other findings

### 2. Redemption OTPs use a non-cryptographic PRNG — low today, latent → FIXED 2026-08-18

> **Fixed 2026-08-18** by `20260818120000_claim_deal_csprng_otp.sql` (applied to
> production, founder-authorized MCP apply; ledger recorded, 93/93). `claim_deal`
> now mints the code from pgcrypto's CSPRNG via the one-line change below —
> surgical `CREATE OR REPLACE`, body byte-identical to the pause-gate version
> otherwise. Verified live by read-back: the body uses `gen_random_bytes` and no
> `floor(random(...))`, the `deal_paused` gate and caller-authz check are intact,
> and anon still cannot execute it. Guard: `maanta-app/supabase/tests/claim_deal_otp_csprng_test.sql`
> (source ratchet — must use `gen_random_bytes`, must not use `floor(random` —
> plus an end-to-end claim asserting a well-formed 6-digit code). The original
> finding is preserved below for the record.

`claim_deal` mints the 6-digit code with
`LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0')`
(`20260730180000_restore_claim_deal_pause_gate.sql:136`). PostgreSQL's `random()`
is a per-backend PRNG and is documented as not cryptographically secure; an
observer of enough outputs from one backend can recover its state.

**Why it is not urgent:** the code is worthless without the authorization to
*use* it. `verify_redemption` self-authorizes — read back from production, it
requires `merchant_verify_authorized(p_merchant_id, caller)` or `admin` or
`service_role` — so a predicted code only helps someone who can already verify
for that specific merchant, and verifying costs them the KES 30 fee. The
realistic harm is a merchant burning their own shoppers' tickets, which
`/api/redemptions/preflight` already permits by brute force at 20/min.

**Why it should still be fixed:** the entropy is not what is protecting this —
an authorization control is. If the verify path ever widens (a shopper-presented
QR, a self-serve or kiosk verify, a partner integration), entropy becomes
load-bearing overnight and this becomes a real hole with no code change to blame.
The fix is one line, in the same `LOOP` that already retries on collision:

```sql
v_otp := LPAD((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::TEXT, 6, '0');
```

Executed on production 2026-08-17 as a bare `SELECT` (no DDL): it returns a
well-formed 6-digit code, and `bit(32)::bigint` zero-extends, so the value is
always in `0 … 4294967295` and the modulo can never go negative. The residual
modulo bias is ~2 parts in 10,000 across the code space — irrelevant next to
replacing a recoverable PRNG.

Not written into this change: it edits `claim_deal`, the single most
consequential RPC in the product, and it belongs in its own reviewable diff with
`golden_path_test.sql` and `claim_deal_pause_gate_test.sql` run against it.
**Not recorded as drift** — no doc, comment or frozen rule claims the code is
unpredictable, so there is no claim-vs-reality gap, only a recommendation.

### 3. `verifyWebhookChallenge` compares the shared secret with `===`

`maanta-app/src/lib/intasend.ts:105-108`. Not constant-time, so it leaks timing.
In practice this is close to unexploitable over the network for a string
comparison, and it is subsumed by **D83**, which already records the real
problem: the IntaSend webhook is authenticated by a static secret echoed in the
body, with no HMAC over the payload. Fold the constant-time comparison into
whatever closes D83; it is not worth its own diff. Worth noting the D83 blast
radius is now much smaller than when it was opened — the `pending_topups`
reconciliation in `/api/topup` and the webhook means a forged callback can no
longer name an arbitrary amount.

---

## What was checked and found sound

Recorded so the next audit does not redo it.

| Area | Verdict |
|---|---|
| **Route-handler authz** | Consistent and correct. Every `/api/*` handler that touches data goes through `requireMerchant` / `requireAdminApi` / `requireFounderApi` / `requireActiveAgentApi` / `ensureAppUser` before any work |
| **IDOR on `[id]` routes** | Every one re-scopes by owner in the same query — `.eq("id", params.id).eq("merchant_id", merchant.id)`. Checked deals, staff, archive, wallet detail, shopper tickets. No unscoped lookups found |
| **Console page guards** | All 18 `/admin` pages, all `/founder` pages, and `/agent` (layout + per-page predicates) gate correctly. The two `/agent` pages that do not import `requireAgentPage` gate inline on `canViewAgentConsole` / `canWriteAgentLeads`, which is the narrower and correct check |
| **`verify_redemption`** | Self-authorizing in the DB, not just at the route. Read back from production |
| **`claim_deal`** | Self-authorizing (`v_caller_id IS DISTINCT FROM p_user_id` → `unauthorized`), pause gate live, row-locked |
| **Stripe webhook** | Signature verified via `constructEvent` before any handler runs; handlers idempotent on `provider_reference`; failures logged and retried |
| **IntaSend webhook** | Amount and merchant reconciled against `pending_topups`, fails closed on lookup error, idempotent on app-minted `api_ref`. Sender authentication remains **D83** |
| **Money-path grants** | `record_merchant_ledger_entry`, `check_rate_limit`, `admin_appeal_hard_block` are `service_role` only. `deduct_success_fee_or_record_arrears`, `purchase_boost`, `move_boost`, `verify_redemption`, `claim_deal` are reachable by `authenticated` but each self-authorizes |
| **Role escalation** | `prevent_self_role_escalation` trigger blocks `users.role` changes for anyone but `admin`/`service_role`; `EXECUTE` revoked from every role (trigger-only) |
| **RLS coverage** | All 26 `public` tables have RLS enabled. Only `api_rate_limit_buckets` has zero policies, which is correct — it is `service_role`-only and deny-by-default is the intent |
| **Write grants on tables** | Verified against production: `authenticated` holds no `INSERT/UPDATE/DELETE` on `merchants`, `deals`, `redemptions`, `merchant_transactions`, `pending_topups`, `agents`, `leads`, `agent_tasks`, `admin_ops_log` |
| **PostgREST filter injection** | `src/lib/postgrest-filter.ts` quotes rather than strips, asserts column identifiers, and is ratcheted by a test that fails on any raw `.or()` interpolation in `src/` |
| **XSS** | One `dangerouslySetInnerHTML`, in `JsonLd.tsx`, over `JSON.stringify(data)` with every `<` replaced by its JSON unicode escape — the correct way to emit a JSON-LD `<script>` body, since it makes `</script>` unrepresentable in the output |
| **Open redirect** | `verify-phone` is the only `?next=` consumer and rejects `//`, `\` and non-`/` values. `/login` ignores `next` entirely and routes through `/app-bootstrap` |
| **Secrets** | None committed. Only `.env.example` is tracked; every match for a key prefix is a comment, a test fixture, or a doc |
| **Rate limiting** | Present on OTP check, claim, both top-up rails, onboarding, waitlist, w3w, deal creation, push subscribe. `check_rate_limit` fails **closed** on error |
| **Health endpoint** | Env-presence and DB probe are admin-gated and boolean-only; the public branch exposes no secrets |

---

## What this audit did not cover

- **Clerk tenant configuration** — session lifetime, MFA, allowed origins, the
  production instance's own settings. Out of repo.
- **Vercel project settings** — env scoping, deployment protection, and the
  branch-promote control that **D53**/**D56**/**D71** keep re-opening.
- **Dependency CVEs.** `npm audit` was not run.
- **The SQL tests were not executed.** They need `make db-verify` or CI.
- **Storage bucket policies** (`deal_images_*`) were read but not exercised.

---

---

## Round 2 (same day) — RLS, SECURITY DEFINER, staff-linking, storage

A second pass, driven by the Prompt-pack security prompt, went behavioural on the
surfaces the first pass only inventoried: every write-capable RLS policy, every
SECURITY DEFINER function's self-authorization, the storage policies, and the
staff-linking path. Two new findings, both fixed-not-applied, both with guards.

### D124 — identity self-write → merchant_staff-seat hijack (the real one)

`users_own_row` is `FOR ALL USING (id = current_user_id())` with **no WITH
CHECK**, and `authenticated` holds the default UPDATE grant on `users`. Only
`role` was trigger-protected. So a signed-in shopper can PATCH their own
`phone`, `clerk_user_id` or `auth_uid` through PostgREST.

`phone` is the dangerous one. `getMerchantContext`
(`src/lib/merchant.ts:53-70`) links a user into a **pre-invited** `merchant_staff`
seat when `users.phone` matches a `merchant_staff.phone` whose `user_id` is still
NULL, and promotes them to `merchant_staff` with that seat's permissions. Chain:

1. Attacker signs up as an ordinary shopper.
2. `PATCH /rest/v1/users?id=eq.<self>` with `{"phone":"<a shop's pre-invited staff phone>"}` — allowed by RLS + the UPDATE grant, and the phone is free of `users_phone_key` until the real staff member first signs in.
3. Next merchant request → linked as staff → `can_verify` (charge the merchant KES 30 per verified redemption) and `can_purchase` (spend the merchant's wallet on boosts), at a shop they have no relationship with.

Proven read-only on production under `SET LOCAL ROLE authenticated`: own-phone
UPDATE = 1 row; cross-user UPDATE = 0 (RLS); direct `role` change still raises.
The direct-write of `merchant_staff` is **not** the vector — `staff_owner_manage`'s
WITH CHECK confines inserts to merchants the caller owns. The phone column is the
gap.

**Fix** `20260817130000` — a BEFORE UPDATE trigger mirroring
`prevent_self_role_escalation`, freezing `phone`/`clerk_user_id`/`auth_uid`
against non-service_role, non-admin callers. Column-scoped, so `push_subscription`
(the only column the authenticated client self-writes) and every service-role
write survive — verified by reading all 20 `users` writers in `src/`. Guard:
`users_identity_immutable_test.sql` (identity frozen · hijack blocked end-to-end ·
service_role/admin unaffected).

### D125 — demo-mutation RPCs are internet-callable

`wipe_demo_data`, `reseed_demo_flash_deals`, `refresh_demo_seed_deals` were never
`REVOKE`d from `PUBLIC`, so anon/authenticated inherit execute — the D123
default-grant class, on functions. Bounded today: `wipe_demo_data(TRUE)` refuses
while demo mode is ON, and reseed/refresh self-gate to demo mode and cap to an
`app_config` ceiling. But a destructive op shouldn't be safe only because of a
mode flag — at the demo-off launch cutover, an anonymous `wipe_demo_data(TRUE)`
becomes a live DELETE of every `is_demo` row. **Fix** `20260817140000` revokes to
service_role + postgres (cron + Makefile keep working). Guard:
`demo_mutation_rpc_grants_test.sql`.

### Round-2 checked and sound

| Area | Verdict |
|---|---|
| **SECURITY DEFINER self-auth** | Swept all 39. `reverse_success_fee`, `activate_merchant`, `admin_redemption_detail`, `admin_*` — all executable by `authenticated` but each self-gates to `admin`/service_role internally. No broken-access-control RPC. `onboard_merchant` self-serve requires `caller = p_user_id` and takes no tier/status/balance param, so no self-provisioning of Elite or opening credit |
| **search_path** | Every SECURITY DEFINER function pins `search_path = public, pg_temp` (or `pg_catalog`). No search_path-injection surface |
| **Write-capable RLS** | `fee_reversals`, `guardian_events`, `notifications`, `merchant_favourites`, `merchant_staff`, `app_config`, `boost_flags`, `tier_flags`, `organizations`, `pending_topups` — all either admin-only, owner-scoped, or SELECT-only with correct WITH-CHECK defaults. `notifications` insert is admin-only; a merchant cannot forge a `pending_topup` (no write grant) to trick the webhook |
| **Storage** | `deal-images` is intentionally public-read; INSERT/DELETE are folder-scoped to the caller's own merchant id via `storage.foldername(name)[1]`. A merchant cannot write into another's folder. No UPDATE policy (deny) |
| **`app_config`** | Admin-only for ALL (WITH CHECK defaults to the admin USING) — a merchant cannot flip `demo_mode_enabled` or rewrite `success_fee_kes` |
| **`api_rate_limit_buckets`** | RLS on, zero policies = deny-all for anon/authenticated; only `check_rate_limit` (service_role) touches it. Correct |

---

## Status — applied 2026-08-17 / 2026-08-18

The three security migrations were applied to production (`axrrslqssmbngbataejg`)
via founder-authorized MCP apply, in order `20260817120000` → `130000` → `140000`,
each `execute_sql` DDL followed by a filename-versioned ledger row. **D123, D124,
D125 closed** on read-back; the D107 ledger straggler (`20260816020000`) was
recorded in the same pass and **D107 closed** too. The OTP-entropy hardening
(`20260818120000_claim_deal_csprng_otp.sql`, *Other findings §2*) was applied and
verified 2026-08-18. The repo migration files and `schema_migrations` now
reconcile at **93/93**. Verification captured on each row.

## Still for the founder — in order

1. **Run `make db-verify`** (or let the CI `db-tests` job run) so every new SQL
   Scenario is executed by a runner, not just proven by production read-back —
   there is no Supabase CLI in the audit container, so the suites themselves have
   not been run here. New suites this audit: `browse_views_test.sql` (E/F/G),
   `users_identity_immutable_test.sql`, `demo_mutation_rpc_grants_test.sql`,
   `claim_deal_otp_csprng_test.sql`.
2. **Staff-by-phone verified-phone gap — FIXED 2026-08-18 (D126).** D124's
   trigger closed the write primitive, but its own header assumed `users.phone`
   was a Clerk-verified number and provisioning never enforced that — it wrote
   `primaryPhoneNumber` unconditionally. `ensureAppUserFromClerk` now persists the
   phone only when Clerk has verified it (`verifiedPrimaryPhone`, guarded by
   `verified-phone.test.ts`), so `users.phone` is verified-or-null by construction.
   Follow-on (D127, fixed 2026-08-18): staff invites matched a raw owner-typed
   phone against the E.164 Clerk number, so a non-canonical spelling silently
   failed to link. `normalizeStaffPhone` now canonicalises to E.164 server-side and
   rejects junk with a 400 (`phone-validation.test.ts`). Fails safe as before; now
   it also links reliably.
3. **The three `security_definer_view` advisor ERRORs are expected**, not
   regressions: `merchants_public_browse` / `deals_public_browse` /
   `demo_data_census` run `security_invoker = false` by design (it is what lets
   anon browse without base-table grants). D123 revoked their writes rather than
   changing the flag, so the advisor persists intentionally.
