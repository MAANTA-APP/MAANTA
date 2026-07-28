# Auth and Identity

**Status:** Canonical · **Last verified:** 2026-07-28  
**Repo:** `docs/ops/auth-strategies.md`, `docs/skills/clerk-auth.md`, `docs/skills/supabase-prod-email-auth.md`, `docs/skills/prod-auth-deals-recovery.md`

## Purpose

State the **actual** auth model: dual strategy, role model, claim phone gate, and what must be configured in dashboards (not only in code).

## Current reality

| Phase | `MAANTA_AUTH_STRATEGY` + `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` | Sign-in | Phone OTP |
|---|---|---|---|
| Dev / staging / rehearsal | `supabase` | Email OTP via Supabase Auth | Disabled (no Clerk SMS cost); claim phone gate relaxed |
| Production launch target | `clerk` | Clerk email + phone | Enabled; claim requires verified phone (`/verify-phone`) |

Flip by env + redeploy. Implementation: `src/lib/auth/strategy.ts`.

**Roles** live in `public.users.role` (not Clerk metadata): `customer`, `merchant_admin` / `merchant_staff`, `agent`, `admin`. New users provision as `customer` via `ensureAppUser` (and Supabase trigger path when using Supabase Auth).

**Post-auth routing:** `/app-bootstrap` is strategy-aware (Clerk session vs Supabase session) and role-routes into feed/merchant/admin/agent.

## What is working

- Dual-strategy code paths on `main`.
- Clerk third-party JWT integration pattern (Clerk `sub` → `users.clerk_user_id`; helpers `current_user_id` / `current_user_role`).
- Supabase email OTP production fixes (2026-07-28): clearer errors, callback cookie on redirect, token_hash support, bootstrap without ClerkProvider.
- Prefer **6-digit OTP typed in the same browser** over magic-link PKCE on mobile mail clients.

## What is not yet ready / manual

- Dashboard config is **manual**:
  - Supabase Site URL + redirect allow list for `www.maanta.app` / `maanta.app` callbacks.
  - Email templates with `{{ .Token }}` and preferably token_hash link to `/auth/callback?...&next=/app-bootstrap`.
  - Clerk: production keys, custom domain (`clerk.maanta.app`), phone SMS for Kenya, Supabase third-party provider wiring for launch strategy.
- Validating Clerk SMS deliverability/cost for Kenya (open follow-up historically).
- Backfill linking legacy `auth_uid` users to `clerk_user_id` where needed.

## Production verification checks

1. Confirm both strategy env vars on Vercel Production (must agree).
2. `GET /api/healthz` (and admin probe variants) for Supabase reachability.
3. Sign-in → `/app-bootstrap` → expected home.
4. If Clerk: email-only user hits claim → redirected to `/verify-phone`.
5. Watch `[maanta-auth]` logs: `send` | `verify_otp` | `callback_parse` | `session_exchange` | `bootstrap`.

## Risks

- Notion pages still saying “auth is Clerk only” while rehearsal/prod may be on `supabase`.
- Mismatched publishable/secret Clerk keys → handshake failure.
- Apex vs www cookie confusion if `NEXT_PUBLIC_APP_URL` wrong.

## Dependencies

- Vercel env, Clerk dashboard, Supabase Auth settings, Resend/SMTP for deliverability.
- Launch Readiness E10/E2.

## Next actions

1. Record the **currently deployed** strategy on this page’s “Last verified” line after every auth change.
2. Update Node 0 Rehearsal Checklist so it matches the strategy in use (do not force Clerk steps during supabase rehearsal).
3. Before open launch: switch to `clerk`, enable phone SMS, smoke claim gate.

## Related pages

- Product Flows
- Launch Readiness
- Observability and Production Verification
- README — Developer Onboarding
- Frozen Scope & Rules (identity helpers / no role self-escalation)
