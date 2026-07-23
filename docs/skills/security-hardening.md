# Skill — Security hardening (2026-07-20)

Post-review fixes for findings from the merged-PR security audit (PRs #15–#26).

## What changed

### Database (`20260720120000_security_hardening.sql`)

| Issue | Fix |
|---|---|
| Merchant `node` spoofing for Node 0 opening credit | `merchants_node_immutable` trigger — only admin/service_role may change `node` |
| Opening-credit cap race | `pg_advisory_xact_lock(hashtext('node0_opening_credit'))` around cap check + credit |
| NULL cap ⇒ unlimited credits | `COALESCE(v_credit_cap, 100)`; credit only when `v_credit_cap > 0` |
| Re-activation retro-credit | Credit only when prior `status = 'pending'` (first activation) |
| Anon column leak on `merchants` / `deals` | `merchants_public_browse` + `deals_public_browse` views; anon `SELECT` revoked on base tables |
| `amount_kes` non-atomic snapshot | `you_pay_kes()` + `claim_deal` writes `amount_kes` in same INSERT |
| Staff cannot verify | `merchant_verify_authorized()` used by `verify_redemption` + fee debit RPC |
| OTP brute-force | `api_rate_limit_buckets` + `check_rate_limit()` (service_role only) |
| Reject griefing unaudited | `code_rejected` fraud event type + reject route audit insert |
| Silent RLS-enable failures | `rls_auto_enable()` logs `RAISE WARNING` with error text |

### Database follow-up (`20260720123000_lock_down_check_rate_limit_execute.sql`)

| Issue | Fix |
|---|---|
| `check_rate_limit` still callable by `authenticated` | Supabase default privileges auto-grant `EXECUTE` on new public functions to `anon`/`authenticated`/`service_role`. `20260720120000` revoked only from `PUBLIC` + `anon`, so the `authenticated` grant survived — a signed-in browser client could tamper with the rate-limit table via `/rest/v1/rpc/check_rate_limit`. Follow-up migration adds `REVOKE ALL ... FROM authenticated`. Found during remote parity validation (see below). |

### Database follow-up (`20260722180000_lock_down_internal_money_rpcs.sql`)

| Issue | Fix |
|---|---|
| `deduct_success_fee_or_record_arrears` callable by `authenticated` | Revoke EXECUTE from `authenticated`; staff could debit KES 30/call without a redemption |
| `increment_deal_claims` callable by merchant owner | Revoke EXECUTE from `authenticated`; owner could inflate `claims_count` with no audit trail |

### Application (2026-07-22 re-audit fixes)

| Issue | Fix |
|---|---|
| Rate-limit fail-open on RPC error | `checkRateLimit` returns `false` when the RPC fails |
| No limits on claim / topup / onboard | Rate limits on `/api/redemptions`, `/api/topup`, `/api/topup/stripe`, `/api/merchants/onboard` |
| Preflight higher limit than verify | Shared `otp-check:{merchantId}` bucket (20/min) for preflight, verify, reject |
| Repost drops YOU PAY fields | `deals/repost` restores `price_kes`, `compare_at_kes`, `charges` from snapshot |
| Staff `can_topup` 404 | Topup routes use `requireMerchant("can_topup")` |
| M-Pesa phone spam | `isValidKenyanPhone()` before STK push |
| W3W unverified without API key | Fail closed outside `NODE_ENV=development` |
| IntaSend webhook amount / challenge leak | Reject non-positive/out-of-range amounts; redact `challenge` in failure logs |
| Suspended merchants editing deals | `requireMerchant` blocks `suspended` / `rejected` / `churned` |
| Deal image MIME spoofing | Magic-byte detection in `image-bytes.ts` before storage upload |
| Push subscription row bloat | `parsePushSubscription()` caps payload at 8KB with URL/key bounds |
| Lead capture TOCTOU race | `capture_lead` RPC with per-shop advisory lock (`20260722190000`) |

### Database follow-up (`20260723120000_revoke_authenticated_writes_core_tables.sql`)

| Issue | Fix |
|---|---|
| C-1: merchant PATCH tier/balance/status via PostgREST | Revoke `INSERT`/`UPDATE`/`DELETE` on `merchants` from `authenticated` |
| C-2: merchant PATCH redemption `status=success` (fee bypass) | Revoke writes on `redemptions` from `authenticated` |
| C-3: merchant PATCH deal boost/claims/caps | Revoke writes on `deals` from `authenticated` |

`SELECT` stays on `authenticated` (RLS still governs rows). All legitimate
mutations go through `service_role` API routes or SECURITY DEFINER RPCs
(`claim_deal`, `verify_redemption`, `onboard_merchant`, boost RPCs).

## Ops checklist — migrations to apply (2026-07-23)

Apply to `vcrfqsevompqjazbwzyh` before deploy (if not already applied):

1. `20260722180000_lock_down_internal_money_rpcs.sql`
2. `20260722190000_capture_lead_atomic.sql`
3. `20260722200000_fix_capture_lead_column_ambiguity.sql`
4. `20260723120000_revoke_authenticated_writes_core_tables.sql` — C-1/C-2/C-3

## PR #48 pre-merge checklist (2026-07-22)

Migrations to apply to `vcrfqsevompqjazbwzyh` before deploy:

1. `20260722180000_lock_down_internal_money_rpcs.sql`
2. `20260722190000_capture_lead_atomic.sql`
3. `20260722200000_fix_capture_lead_column_ambiguity.sql` (if `20260722190000` was already applied without the alias fix)

SQL suites to run after apply (CI runs all `supabase/tests/*.sql` automatically):

- `security_hardening_test.sql` — scenarios A–H
- `capture_lead_test.sql` — scenarios A–C
- `revoke_authenticated_writes_core_tables_test.sql` — scenarios A–E (C-1/C-2/C-3)

- `src/lib/otp.ts` — `isValidOtpCode()` (`^\d{6}$`)
- `src/lib/geo.ts` — `parseGpsCoords()` (finite lat/lng bounds)
- `src/lib/rate-limit.ts` — wraps `check_rate_limit` RPC
- `src/lib/pricing.ts` — charge count/percent/fixed/label caps
- `/api/redemptions/*` — rate limits, OTP validation, staff verify via `requireMerchant`, no `otpCode` in claim response, expired preflight returns `found: false`

## Ops notes

- `check_rate_limit` is **service_role only** — never expose to browser clients.
- Anon PostgREST clients must query `merchants_public_browse` / `deals_public_browse`, not base tables.
- Opening credit still requires `merchants.node` to match `app_config.node0_launch_node` at activation; node is now immutable post-onboarding.

## Pre-merge validation (2026-07-20)

**CI `db-tests` (commit `36d4193`, run [29735434819](https://github.com/MAANTA-APP/MAANTA/actions/runs/29735434819)):** `supabase start` applied the full migration chain (including `20260720120000_security_hardening.sql`), then all three SQL suites passed:

| File | Result |
|---|---|
| `supabase/tests/node0_opening_credit_test.sql` | A–D passed |
| `supabase/tests/security_hardening_test.sql` | A–F passed (node lock, `you_pay_kes`, `claim_deal` snapshot, staff verify, rate limit, anon grants) |
| `supabase/tests/success_fee_reference_link_test.sql` | A–B passed |

**Test fixes on branch:** `security_hardening_test.sql` was corrected to use the canonical YOU PAY charge set (572 KES) and to seed merchants with positive `account_balance` so the zero-balance gate does not block deal creation in scenario C.

## Remote (prod) parity validation (2026-07-20)

Done as a pre-merge parity check for PR #27 against the **live** database (this
repo has **no** separate staging project — `vcrfqsevompqjazbwzyh` is the only
Supabase project in the org).

- **Project ref:** `vcrfqsevompqjazbwzyh` (eu-west-1, Postgres 17).
- **Apply method:** No Supabase CLI / DB credentials are available in the
  automation environment, so `supabase db push` was not possible. Applied via
  the **Supabase MCP `apply_migration`** (writes directly to the project and
  records migration history). The MCP stamps its own apply-time version, so the
  recorded `version` was reconciled to match the repo filename exactly
  (`20260720120000`, and the follow-up `20260720123000`).
- **Pre-apply remote state:** migration history ended at `20260720014135`
  (no drift); `node0_opening_credit` ledger count = 0 (cap 100, window open,
  node `BBS Mall`) so the node0 scenarios can pass on prod; 3 merchants /
  3 deals / 4 redemptions / 5 users of real data, untouched by the run.

**SQL regression suites — all pass against the migrated remote DB** (each file
run end-to-end; any failed `ASSERT` aborts the run, matching `ON_ERROR_STOP=1`):

| File | Result |
|---|---|
| `supabase/tests/node0_opening_credit_test.sql` | A–D passed |
| `supabase/tests/security_hardening_test.sql` | A–G passed (node lock, `you_pay_kes`, `claim_deal` snapshot, staff verify, rate limit, anon grants, **check_rate_limit service_role-only**) |
| `supabase/tests/success_fee_reference_link_test.sql` | A–B passed |

Post-run verification confirmed **zero residue** (no `__test%` merchants, no
`test-rate-%` buckets), `app_config` restored (`cap=100`,
`window=2026-12-15`), and all real-data counts identical to the pre-run
snapshot.

### Drift observed (remote vs CI) and resolution

1. **`check_rate_limit` executable by `authenticated` (real gap, fixed).**
   `get_advisors` (security) against the remote flagged lint 0029 for
   `check_rate_limit`. Direct `has_function_privilege` checks confirmed
   `authenticated` could `EXECUTE` it, contradicting the "service_role only"
   intent. Root cause: Supabase default privileges grant `EXECUTE` on new
   public functions to `authenticated`, and `20260720120000` revoked only from
   `PUBLIC`/`anon`. **CI did not catch this** — a fresh `supabase start` has the
   same default privileges, and scenario E only asserted the function *works*
   under `service_role`, never the negative. Resolved with follow-up migration
   `20260720123000_lock_down_check_rate_limit_execute.sql` (revoke from
   `authenticated`) plus new **scenario G** asserting anon/authenticated cannot
   execute it and `service_role` can. Re-verified on remote: `anon=false,
   authenticated=false, service_role=true`.
2. **MCP version stamping (metadata only).** `apply_migration` records its own
   apply-time version rather than the repo filename version. Reconciled both
   recorded versions to the canonical filenames so a later `supabase db push`
   from a machine with CLI access sees them as already applied (idempotent).

Everything else the advisor reports (broad `pg_graphql_*` table exposure to
`authenticated`, other pre-existing SECURITY DEFINER RPCs, leaked-password
protection) is pre-existing project posture, not introduced by this migration.
The two new browse views (`merchants_public_browse`, `deals_public_browse`)
being anon-visible is **intentional** — that is their purpose. `api_rate_limit_buckets`
having RLS enabled with no policy is also intentional (service_role-only; deny-all
to everyone else).
