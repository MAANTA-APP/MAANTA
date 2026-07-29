# Backend production setup status — 2026-07-28

**Audience:** founder + ops.  
**Production Supabase project-ref:** `axrrslqssmbngbataejg`  
**Live app:** `https://www.maanta.app` (Vercel project `maanta-nuia`)  
**Do not use:** `vcrfqsevompqjazbwzyh` (abandoned)

This report records what was verified and applied on 2026-07-28 against live
production. Secret **values are never listed** — names only.

---

## 1. Prod migrations

| Item | Status |
|---|---|
| Source of truth | `maanta-app/supabase/migrations/` (67 files) |
| Apply path | `docs/ops/supabase-migrations.md` → `supabase db push` / `make db-prod-fixup` |
| Local vs remote | **Aligned** — 67/67 versions match |
| Dry-run | `supabase db push --db-url … --dry-run` → **Remote database is up to date** |
| Pending migrations applied this session | **None** (already current) |
| Hardening set (#48–#61) | Present (`20260722180000` … `20260723140000`) |
| `merchants.lat` / `lng` | Present (`20260726120000`) |
| `users.preferred_language` | Present (`20260726180000`) |
| Core-table authenticated writes | Revoked (INSERT/UPDATE/DELETE = false) |
| Money RPC `deduct_success_fee_or_record_arrears` | service_role only (anon/auth = false) |
| Redundant financial guard trigger | Absent (expected after `20260724120000`) |

### Connectivity note (agents / CI)

Direct host `db.axrrslqssmbngbataejg.supabase.co` resolves **IPv6-only**.
Environments without IPv6 must use the **session pooler**:

`postgresql://postgres.axrrslqssmbngbataejg:***@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`

`make db-prod-fixup` / `prod-schema-seed-fixup.sh` still expect a Postgres URI;
prefer the pooler URI when direct DB DNS has no A record.

### Risk / rollback

- `db push` is forward-only; no auto-rollback. Nothing was pushed this session.
- Schema is aligned with `main` as of commit that ships this report.

---

## 2. Env key audit

Code scan: `maanta-app/src/**` + Sentry configs + `.env.example`.  
Live login HTML shows Clerk (`pk_live_…`, `clerk.maanta.app`) — production is
running the **Clerk** auth path (default when strategy vars unset).

Vercel dashboard env **values cannot be read** from this agent (no env-list MCP).
Presence below is **required checklist for the founder**, cross-checked against
code + `envPresence()` in `src/lib/health.ts`.

### required-now (Production — launch / rehearsal baseline)

| Variable | Kind | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_*` (browser + server) | Must be `https://axrrslqssmbngbataejg.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_*` | Anon/publishable key for that project |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only | SSR browse, RPCs, admin paths |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `NEXT_PUBLIC_*` | Login UI (Production instance) |
| `CLERK_SECRET_KEY` | server-only | Session verification (must match publishable) |
| `NEXT_PUBLIC_APP_URL` | `NEXT_PUBLIC_*` | Must be `https://www.maanta.app` (Stripe/redirects fail-closed without it in prod) |
| `MAANTA_AUTH_STRATEGY` | server-only | Set explicitly to `clerk` for launch (do not leave ambiguous) |
| `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` | `NEXT_PUBLIC_*` | Must match server strategy |

`NEXT_PUBLIC_*` changes require a **redeploy** (baked into the client bundle).

### required-soon (before open shopper launch / paid flows)

| Variable | Kind | Why |
|---|---|---|
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | server-only | Card top-up |
| `STRIPE_ENV` | server-only | Must be `live` only with live keys |
| `INTASEND_API_KEY` / `INTASEND_SECRET` / `INTASEND_WEBHOOK_SECRET` | server-only | M-Pesa STK (blocked until IntaSend access) |
| `INTASEND_ENV` | server-only | `live` only with live keys |
| `W3W_API_KEY` | server-only | Prod what3words validate fails closed without it |
| `RESEND_API_KEY` / `RESEND_AUDIENCE_ID` / `RESEND_FROM_EMAIL` | server-only | Waitlist emails |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | mixed | Error monitoring (docs say wired 2026-07-27 — re-verify) |
| `POSTHOG_PROJECT_KEY` / `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` / `POSTHOG_HOST` | mixed | Analytics |

### optional / feature-gated

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_VAPID_*` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push opt-in |
| `NEXT_PUBLIC_LAUNCH_AUTH_MODE` | Defaults to `email_and_phone` |
| `NEXT_PUBLIC_CLERK_SIGN_*` | Defaults already match app routes |
| `SENTRY_AUTH_TOKEN` | Build-time source maps only |
| `RESEND_BASE_URL` | Local mock override |

### unused-or-unclear / stale

| Variable | Verdict |
|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Unused** in app code (Checkout is server-initiated) |
| `TWILIO_*` | **Legacy** — phone OTP is Clerk; commented in `.env.example` |
| `E2E_*` | Playwright only — not Production |
| `DATABASE_URL` | Ops/CLI secret for migrations/seed — **not** a Vercel Next.js runtime var |

### Preview vs Development

| Env | Minimum |
|---|---|
| **Production** | required-now table above |
| **Preview** | Same Supabase + Clerk as prod *or* dedicated staging; never mix live money keys |
| **Development** | `.env.local` from `.env.example`; `MAANTA_AUTH_STRATEGY=supabase` OK for email-OTP rehearsal without Clerk SMS |

### manual-founder-action (env)

1. Open Vercel → `maanta-nuia` → Settings → Environment Variables → **Production**.
2. Paste/check every name in **required-now** (see founder checklist).
3. Confirm `NEXT_PUBLIC_SUPABASE_URL` contains `axrrslqssmbngbataejg`.
4. Set both auth strategy vars to `clerk` (or both to `supabase` only if intentionally rehearsing email OTP on prod).
5. Redeploy Production after any `NEXT_PUBLIC_*` change.
6. As admin, hit `/api/healthz?detail=1&probe=1` and confirm env presence booleans.

---

## 3. Prod seed

| Seed | Intended for prod rehearsal? | Status 2026-07-28 |
|---|---|---|
| `node0_100_deals_seed.sql` | **Yes** — Discover/Browse BBS density | **Applied / refreshed** — 60 merchants, **100 live** deals (15 flash / 20 boosted / 65 standard). Was fully expired before refresh. |
| `nairobi_nodes_150_merchants.sql` | **Yes** — 3-node rehearsal | **Applied** — 150 merchants, **186 live** deals across BBS / CBD Galleria / Westlands Hub |
| `test_accounts_maanta_2026_07.sql` | **Yes** — @maanta.app personas | **Applied** (Clerk-safe). Seed hardened to skip duplicate emails / auth users. |
| `node0_rehearsal_seed.sql` | Legacy Gmail personas | Present historically; **not re-applied** this session |
| `node0_ops_personas_seed.sql` | Legacy ops add-on | **Not applied** (superseded by @maanta.app accounts for new rehearsal) |

### Persona outcomes

| Email | Role after seed | Notes |
|---|---|---|
| `admin@maanta.app` | `admin` | Two existing Clerk rows both promoted — **dedupe manually** |
| `founder@maanta.app` | `admin` | Seed UUID + Supabase Auth user (email OTP path) |
| `agent@maanta.app` | `agent` | Wired to agent profile |
| `merchant.a.owner@maanta.app` | `merchant_admin` | Eastleigh Spices (Demo A), BBS elite |
| `merchant.b.owner@maanta.app` | `merchant_admin` | Juniper Spa (Demo B), CBD |
| Shopper / staff emails | as documented | Pending OTP `881122` for everyday shopper on Merchant A flash |

### Intentionally not applied

- Full wipe / delete of legacy `aragagency+*` rehearsal rows (coexist; safe).
- Demo destructive resets.
- SQL regression suites against prod (mutating; human low-traffic window only).

### Minimum data for rehearsal?

**Yes for browse/feed/map** at BBS + multi-node switcher.  
**Partial for role login:** Clerk Production needs each persona signed in once (or `clerk_user_id` linked). Live auth is Clerk; Supabase email OTP personas need `MAANTA_AUTH_STRATEGY=supabase` if using those auth.users rows.

---

## 4. Exact next actions

1. Founder: complete Vercel env checklist (`docs/ops/founder-backend-prod-checklist-2026-07.md`).
2. Founder: dedupe duplicate `admin@maanta.app` Clerk users (keep one; set role `admin`).
3. Founder: smoke `https://www.maanta.app/feed` + `/browse` at BBS Mall; switch to CBD / Westlands.
4. Optional: promote a real Clerk user to founder/admin if not using seed emails.
5. Do **not** set `STRIPE_ENV=live` / `INTASEND_ENV=live` until money rails are intentionally go-live.

---

## 5. Outdated checklist corrections

| Old guidance | Correction |
|---|---|
| “Apply prod migrations minimum set” as if still pending | Schema **already current** on `axrrslqssmbngbataejg` as of 2026-07-28; verify with `migration list` / dry-run before pushing |
| `make db-prod-fixup` as the only path | Still valid one-shot (migrations + 100-deal seed); this session used pooler URI + targeted seeds because migrations were already applied and Nairobi/test accounts were also needed |
| Node 0 rehearsal checklist implying only 3 deals | Prefer 100-deal + Nairobi 150 for Discover density; legacy 3-deal seed remains optional |
| Test accounts seed assuming empty emails | Seed now Clerk-safe (skip existing email / auth.users; promote roles under service_role claim) |
