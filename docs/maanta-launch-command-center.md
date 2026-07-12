# MAANTA launch command center

Last updated: 2026-07-12. Running log of launch-readiness security/ops fixes as
they land. Behavior-changing decisions also go to `maanta-decisions-log.md`;
launch-gate flow status lives in `maanta-launch-readiness-tracker.md`. This doc
is the at-a-glance "what shipped, is it verified" board.

Status legend: ✅ done · 🟡 needs verification · 🔴 blocker · ⬜ not started

## Security & data-access hardening

| Item | Status | Notes |
|---|---|---|
| RLS & storage hardening | ✅ | **Applied to live 2026-07-12.** Added admin-only `FOR ALL` RLS policies to `organizations` and `payment_webhook_failures` (RLS explicitly enabled on the latter), and dropped the over-broad `deal_images_public_read` listing policy on the `deal-images` bucket while keeping the scoped merchant-own-folder upload/delete policies. Migration `20260712120000_rls_policies_and_storage_hardening` is in live history (project `vcrfqsevompqjazbwzyh`, eu-west-1). Security advisor: the two `rls_enabled_no_policy` findings and the `public_bucket_allows_listing` WARN are **cleared**. CI gate green (lint, typecheck, 17/17 tests, build). **Safe because** every write to these three surfaces already goes through the service role, which bypasses RLS, and public deal-image URLs are served without the listing policy — so shopper feed, merchant uploads, and webhook logging are unaffected. |

## Known advisor items still open (later pass)

Out of scope for the 2026-07-12 fix; do **not** change the GraphQL/RPC model
piecemeal — scope these deliberately:

| Advisor lint | Scope | Status | Notes |
|---|---|---|---|
| `pg_graphql_anon_table_exposed` (0026) | Most `public` tables | ⬜ not started | `anon` has `SELECT` grant, so tables are discoverable in the GraphQL schema. RLS still blocks row access; this is schema-discoverability, not a data leak. Fix = revoke `SELECT` from `anon` on tables that shouldn't be pre-sign-in discoverable — verify PostgREST access paths first. |
| `pg_graphql_authenticated_table_exposed` (0027) | Most `public` tables | ⬜ not started | Same as above for the `authenticated` role. |
| `authenticated_security_definer_function_executable` (0029) | Core RPCs (`claim_deal`, `verify_redemption`, `onboard_merchant`, `purchase_boost`, …) | ⬜ not started | These RPCs are self-authorizing and intended to be callable by signed-in users; review each before revoking `EXECUTE` or switching to `SECURITY INVOKER`. |
| `auth_leaked_password_protection` | Auth config | ⬜ not started | Dashboard toggle — enable HaveIBeenPwned check in Supabase Auth settings. |
