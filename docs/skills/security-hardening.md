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

### Application

- `src/lib/otp.ts` — `isValidOtpCode()` (`^\d{6}$`)
- `src/lib/geo.ts` — `parseGpsCoords()` (finite lat/lng bounds)
- `src/lib/rate-limit.ts` — wraps `check_rate_limit` RPC
- `src/lib/pricing.ts` — charge count/percent/fixed/label caps
- `/api/redemptions/*` — rate limits, OTP validation, staff verify via `requireMerchant`, no `otpCode` in claim response, expired preflight returns `found: false`

## Ops notes

- `check_rate_limit` is **service_role only** — never expose to browser clients.
- Anon PostgREST clients must query `merchants_public_browse` / `deals_public_browse`, not base tables.
- Opening credit still requires `merchants.node` to match `app_config.node0_launch_node` at activation; node is now immutable post-onboarding.
