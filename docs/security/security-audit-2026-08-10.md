# MAANTA Security Audit — 2026-08-10

Read-only, authorized review of the MAANTA application and its in-repo
deployment configuration, covering the 20 requested controls.

**This document does not claim MAANTA is secure.** It records what was
inspected, what the evidence shows, and what could not be verified from the
repository. Anything that lives in a provider dashboard — Vercel, Supabase,
Clerk, IntaSend, GitHub org settings — is marked *Needs manual verification*
rather than assumed.

---

## Scope and constraints

**In scope:** the repository at `/home/user/MAANTA` at commit `8b7f147` on
branch `claude/maanta-security-audit-z1p64u` — `maanta-app/` (Next.js 14 App
Router), `maanta-app/supabase/migrations/` (87 files), `maanta-app/supabase/tests/`,
CI workflows, and the operating docs under `docs/`.

**Method:** static inspection only — source reading, migration reading,
configuration review, and one registry-backed dependency audit
(`npm audit --package-lock-only`, which reads the committed lockfile and does
not install anything).

**Explicitly not done**, per the audit's own safety rules: no requests against
production, no authentication bypass attempts, no test accounts, no data
access, no bulk or fuzzing traffic, no migrations applied, no destructive
commands. No secret values appear in this document; credentials are identified
by variable name and file path only.

**Two structural limits worth stating up front:**

1. **`node_modules` is not installed in this environment**, so `npm run lint`,
   `npm run typecheck` and `npm test` could not produce meaningful results. They
   were attempted and their real outcomes are recorded under *Tests and commands
   run*. **No check in this report is claimed as green.**
2. **Static review cannot prove a negative about runtime behavior.** "No CORS
   header is set anywhere in the app" is a statement about the source tree; what
   Vercel's edge or Supabase's API gateway adds on top is dashboard-side.

---

## Architecture map

**Frontend / deployment.** Next.js 14.2.35 App Router (`maanta-app/`), React 18,
Tailwind, deployed on Vercel. Route groups are URL-invisible: `(marketing)/*`
(17 `page.tsx` files — six core pages, four legal routes, seven others),
`(shopper)/*`, plus `merchant/*`, `admin/*`, `agent/*`, `founder/*` and the auth
routes. No `vercel.json` exists; all build configuration is in
`maanta-app/next.config.mjs`.

**Backend.** Supabase Postgres, reached two ways: an anon-key client carrying
the caller's own JWT (`maanta-app/src/lib/supabase/server.ts`) for RLS-governed
reads, and a service-role client (`maanta-app/src/lib/supabase/service.ts`,
header comment: *"SERVER ONLY. Bypasses RLS. Never import into a Client
Component."*) for trusted server writes. There are **39 route handlers** under
`maanta-app/src/app/api/`. There are **no Supabase Edge Functions** and **no
Next.js server actions** (`grep -rl "use server" src/` is empty), so route
handlers are the entire server-side write surface.

**Authentication.** `maanta-app/src/middleware.ts` branches on strategy:
`clerkMiddleware()` when both `MAANTA_AUTH_STRATEGY` and
`NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` are explicitly `clerk` (production), else
Supabase SSR session refresh (the code default, and what CI runs). **Both
strategies are passwordless** — Clerk email/phone OTP, or Supabase email OTP.
Identity is resolved server-side by `ensureAppUser()`
(`maanta-app/src/lib/auth.ts`) from the JWT `sub` claim, never from a
client-supplied field.

**Data model.** 25 application tables. The ones holding sensitive data: `users`,
`merchants`, `merchant_staff`, `deals`, `redemptions`, `merchant_transactions`
(the wallet ledger), `agents`, `leads`, `audit_logs`, `fraud_events`,
`guardian_events`, `fee_reversals`, `admin_ops_log`, `app_config`,
`payment_webhook_failures`, `api_rate_limit_buckets`.

**Storage.** One bucket, `deal-images`, deliberately public (CDN-served deal
photos). One upload path: `POST /api/deals`.

**External integrations.** Stripe (card top-ups, sandbox during testing),
IntaSend (M-Pesa STK, prepared but not assumed available), Resend (email),
web-push (VAPID), PostHog (analytics, same-origin proxied), Sentry (errors),
what3words (location validation).

**Money paths.** Three, per `docs/skills/payments-rails.md`: Stripe top-up →
wallet credit; IntaSend M-Pesa top-up → wallet credit; and the internal KES 30
success fee debited inside `verify_redemption`.

**Checks the repo gates on.** CI (`.github/workflows/ci.yml`) blocks on `lint`,
`typecheck`, `test`, `build` and a `db-tests` job that boots an ephemeral
Supabase and runs the 24 SQL suites in `maanta-app/supabase/tests/`.

---

## Executive assessment

The backend authorization model is genuinely strong, and stronger than most
applications at this stage. Every one of the 39 API routes performs a
server-side auth check before touching data; every money-or-trust RPC
independently re-derives the caller's identity from the JWT *inside* the
`SECURITY DEFINER` function rather than trusting the app layer; all 25 tables
have RLS enabled, backed by an event trigger that force-enables RLS on any
future `CREATE TABLE`; and write grants on the core tables are revoked from the
`authenticated` role outright, so a stolen JWT cannot `PATCH` a privileged
column through PostgREST. There is no SQL injection surface of consequence, no
XSS sink anywhere in the tree (`dangerouslySetInnerHTML` appears zero times),
no password to mishandle, and no session token in browser storage. The upload
path validates image magic bytes rather than trusting the client's MIME type,
and excludes SVG at every layer.

The material weakness is on the money-in path. **The IntaSend top-up webhook is
authenticated by a static shared secret echoed in the request body rather than
by a signature over the payload, and it can credit a wallet repeatedly**,
because it passes a null provider reference when the payload carries no invoice
id, and the unique constraint that provides idempotency does not constrain
nulls. Anyone holding that one token can credit any merchant up to KES
1,000,000, repeatedly, with no reconciliation against the top-up that was
actually initiated. It is not anonymously reachable, and the rail is not
confirmed live — which is why it is graded High rather than Critical — but it is
the one place where the otherwise-consistent "the backend is the source of truth
for money" discipline does not hold. The Stripe webhook, sitting right next to
it, does this correctly.

**Update, same session:** the replay half of that finding is now fixed and
guarded by tests — the ledger keys on the app-minted `api_ref`, so a redelivery
can no longer credit twice. The **authentication half is untouched**: a caller
holding the static secret can still forge a credit. The finding therefore stays
High and D83 stays open. SEC-005 is fixed in full. Details in *Fixed in this
session*.

Second is dependency exposure: `next@14.2.35` is a direct, pinned dependency
carrying 21 published advisories, alongside five vulnerable transitive packages.
This needs triage — several advisories are conditional on configurations MAANTA
does not use — but it is the largest single block of known, published, externally
reachable risk in the tree, and there is no Dependabot, Renovate, or CodeQL
workflow to have surfaced it.

The remaining findings are narrower: one PostgREST filter-injection pattern on an
admin-only search, one route leaking a raw Postgres error message to an admin
client, unredacted phone numbers persisted into a webhook failure table, and no
security headers (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`)
configured anywhere. **Of those four, the first three were fixed on 2026-08-10**
(SEC-004, SEC-005, SEC-006); the security headers remain open.

Two findings were recorded in `docs/maanta-drift-register.md` as **D83** and
**D84** before this narrative was written, per the repository's own rule that the
register is the state and the audit document is only a story.

---

## Findings by priority

### SEC-001 — IntaSend top-up webhook: no payload signature, and replayable wallet credit

- **Severity:** High
- **Status:** **Partly fixed 2026-08-10.** Two of three parts are closed and
  **live in production**: the replay half, and the amount-reconciliation half
  (migration applied 2026-08-10 15:45 UTC, evidence under *Production
  deployment*). The **missing-signature half remains open** and is what keeps
  drift **D83** open — a caller holding the static shared secret can still forge
  a webhook, now bounded to an amount some merchant really initiated.
- **Affected surface:** `maanta-app/src/app/api/webhooks/intasend/route.ts`,
  `maanta-app/src/lib/intasend.ts`,
  `maanta-app/supabase/migrations/20260709000151_merchant_transactions_provider_reference_unique.sql`
- **Evidence:** `verifyWebhookChallenge` (`maanta-app/src/lib/intasend.ts:91-94`)
  is a plain equality test: `Boolean(secret) && challenge === secret`, where
  `challenge` is read from the request body
  (`webhooks/intasend/route.ts:22`). There is no HMAC over the payload, no
  timestamp, and no nonce. The credited `amount` is taken from
  `Number(payload.value ?? payload.amount ?? 0)` (`:52`), bounded only by
  `0 < amount <= MAX_TOPUP_AMOUNT` (`:60`, KES 1,000,000) and never reconciled
  against the amount the STK push actually initiated. `providerReference` is set
  to `invoiceId`, which is `null` when the payload carries neither `invoice_id`
  nor `id` (`:53-58`), and is passed straight to the ledger RPC (`:74`). The
  unique constraint that provides idempotency says in its own migration comment
  that *"NULLs stay allowed … and do not collide with each other"*
  (`20260709000151_merchant_transactions_provider_reference_unique.sql:4-5`), so
  `record_merchant_ledger_entry` raises no `unique_violation`, takes no
  rollback branch (`20260709000211_record_merchant_ledger_entry_rpc.sql:75-79`),
  and credits the wallet again on every delivery. The header comment in
  `maanta-app/src/lib/merchant-ledger.ts:40-43` states that a duplicate delivery
  "rolls back cleanly" on that constraint — true for Stripe, which always
  supplies a reference, and untrue for this caller.
- **Risk:** An actor holding `INTASEND_WEBHOOK_SECRET` can credit any merchant's
  prepaid wallet by an arbitrary amount up to KES 1,000,000, and repeat it
  without limit by omitting the invoice id. Wallet balance offsets real KES 30
  success-fee debits, so this is direct financial loss, not just bad data. The
  same null-reference gap also means a legitimately captured webhook that
  happened to carry no invoice id would double-credit on any provider retry.
  Mitigating factors: it requires the secret (a server-only env var, and the
  handler fails closed when it is unset), there is no app-layer rate limit on
  the endpoint, and IntaSend is documented as a prepared-not-assumed rail.
- **Recommendation:** Two changes, independent of each other. First, refuse to
  credit without a non-null provider reference — derive it from the `api_ref`
  the app itself minted at initiation, which already contains a `randomUUID()`
  (`maanta-app/src/app/api/topup/route.ts:48`), so idempotency is guaranteed per
  initiation rather than per provider goodwill; log a webhook failure instead of
  crediting when it is absent. Second, confirm whether IntaSend offers a payload
  HMAC and verify the raw body against it, mirroring the Stripe handler. If the
  provider genuinely offers only a static challenge, treat that as
  authentication-only and reconcile the credited amount against the initiated
  top-up before applying it.
- **Verification:** Add a case to the SQL suites asserting that two ledger
  writes with a null `provider_reference` produce one credit, not two — it
  currently produces two. Then re-read
  `maanta-app/src/app/api/webhooks/intasend/route.ts` to confirm the null branch
  refuses rather than credits. Separately, confirm in the Vercel dashboard
  whether `INTASEND_WEBHOOK_SECRET` is set in production today; unset means no
  exploit *and* no working M-Pesa credit.
- **Owner:** eng, with a founder call on whether the rail ships before a real
  signature exists

### SEC-002 — Direct dependency `next@14.2.35` carries 21 published advisories

- **Severity:** High
- **Status:** **Partly fixed 2026-08-10** — 4 of 6 vulnerable packages resolved
  without a breaking change; `next` and its nested `postcss` remain and need a
  decision (see *Second remediation pass*).
- **Affected surface:** `maanta-app/package.json:23`, `maanta-app/package-lock.json`
- **Evidence:** `npm audit --omit=dev --package-lock-only` (run in this session,
  exit code 1) reports **6 vulnerable packages: 5 high, 1 moderate**. `next` is
  the only *direct* one: `severity=high`, vulnerable range
  `9.3.4-canary.0 - 16.3.0-preview.10`, **21 advisories**, including HTTP request
  smuggling in rewrites, cache poisoning, a CSP-nonce XSS, DoS via the Image
  Optimizer `remotePatterns` config, and an unauthenticated RSC endpoint
  disclosure. The five transitive ones: `postcss@8.5.16` (high, 4 advisories —
  arbitrary `.map` file disclosure, `</style>` XSS in stringify output),
  `nanoid@3.3.15` (high, infinite loop on zero/negative size), `fast-uri@3.1.4`
  (high, host confusion via backslash authority introducer),
  `brace-expansion@5.0.8` (high, DoS — build-time only, under the Sentry bundler
  plugin), `dompurify@3.4.12` (moderate, XSS via detached subtree after
  `IN_PLACE` hook removal).
- **Risk:** Several `next` advisories are directly internet-reachable on a
  production Next.js deployment. This needs triage rather than panic — the Image
  Optimizer advisory is conditional on a `remotePatterns` config MAANTA does not
  have (`next.config.mjs` declares no `images` block at all), while the rewrites
  advisory is more relevant because `next.config.mjs:41-56` does declare
  rewrites for the PostHog proxy. The honest summary is that the count is large,
  the applicability is unassessed, and nothing in CI would have told anyone.
- **Recommendation:** Do not blanket-upgrade. In order: (1) triage the 21 `next`
  advisories against MAANTA's actual configuration and record which apply;
  (2) take the non-breaking `npm audit fix` for `brace-expansion`, `dompurify`,
  `fast-uri` and `nanoid`, which npm reports as available without `--force`;
  (3) plan the `next` upgrade deliberately — npm proposes `next@16.3.0`, two
  majors up, which needs an App Router regression pass and is not a drive-by
  change. Evaluate the newest 14.2.x or 15.x that closes the applicable
  advisories first, since that is a far smaller diff.
- **Verification:** `cd maanta-app && npm audit --omit=dev --package-lock-only`
  — safe, reads the committed lockfile, installs nothing.
- **Owner:** eng

### SEC-003 — `claim_deal` does not enforce phone verification; the API route is the only gate

- **Severity:** Medium
- **Status:** Open (tracked as drift **D84**)
- **Affected surface:** `maanta-app/src/app/api/redemptions/route.ts`,
  `maanta-app/supabase/migrations/20260730180000_restore_claim_deal_pause_gate.sql`
- **Evidence:** The route comment states *"the claim RPC is never reached without
  a phone"* (`redemptions/route.ts:28-31`), and the route does gate correctly —
  `currentUserHasVerifiedPhone()` then a 403 `phone_required`
  (`:32-41`), server-side and Clerk-authoritative. But grepping `phone` across
  the current `claim_deal` definition
  (`20260730180000_restore_claim_deal_pause_gate.sql`) returns **zero hits**. The
  invariant as worded is not enforced where the comment implies. Behind it sits a
  narrower case: under the Supabase auth strategy `phoneOtpEnabled()` is false,
  so `currentUserHasVerifiedPhone()` returns `true` unconditionally
  (`maanta-app/src/lib/auth.ts:38-46`) — deliberate for dev and CI, but it means
  the single gate is also strategy-dependent, and the strategy default is itself
  open drift (**D59**).
- **Risk:** No exploit today: the only shipped caller is the gated route, and
  production runs the Clerk strategy where the check is real. The risk is
  structural and future-facing — any second caller of `claim_deal` (another
  route, a script, a direct PostgREST call with a valid shopper JWT) claims
  without a verified phone. This is the same shape as **D25**, where UI hiding
  stood in for an RPC gate, and the same shape CLAUDE.md names directly: an
  app-layer filter narrows exposure but never replaces the RPC.
- **Recommendation:** Either assert phone verification inside `claim_deal`
  against a verified-phone flag persisted on `public.users` — the defence in
  depth the money-and-trust guardrail asks for — or accept the single gate for
  the 3-person pilot and correct the comment so it states what is actually
  enforced and where. The cheapest honest step is the comment fix; the durable
  one is the RPC check.
- **Verification:** Add a case to
  `maanta-app/supabase/tests/claim_deal_pause_gate_test.sql` asserting a claim by
  a user with no verified phone is rejected by the RPC, then run
  `make db-verify`.
- **Owner:** founder (product call), then eng

### SEC-004 — PostgREST filter injection in admin customer search

- **Severity:** Medium
- **Status:** **Fixed 2026-08-10** — see *Fixed in this session* below.
- **Affected surface:** `maanta-app/src/app/admin/customers/page.tsx:40`
- **Evidence:** `query.or(\`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%\`)`
  — the only place in the codebase where `.or()` receives a raw, unescaped
  filter expression built by string interpolation. PostgREST parses that whole
  string server-side as a structured filter, so a `q` containing `,`, `.`, `(`
  or `)` can break the intended three-clause OR and change which columns and
  operators are evaluated. Every other search in the tree passes the user value
  as a bound argument to `.ilike()` (for example
  `maanta-app/src/app/(shopper)/search/page.tsx:47,62`), which is safe.
- **Risk:** Bounded. `q` comes from `searchParams` on a page gated by
  `requireAdminPage()` (`:29`), and the query runs through the service-role
  client reading only `public.users` columns the page already displays. An admin
  manipulating their own request reaches nothing they cannot already see, and
  there is no cross-tenant path. The real risk is pattern propagation: copied to
  a lower-privilege, RLS-governed surface, this becomes exploitable there.
  Crafted input also throws an ungraceful PostgREST parse error.
- **Recommendation:** Strip or escape `,()` before interpolation, or replace with
  separate `.ilike()` calls, or move to a trigram/full-text search function
  called via `.rpc()` with a bound parameter.
- **Verification:** Re-read the file after the change; confirm no interpolated
  string reaches `.or()`.
- **Owner:** eng

### SEC-005 — Raw Postgres error message returned to the client on merchant approval

- **Severity:** Medium
- **Status:** **Fixed 2026-08-10** — see *Fixed in this session* below.
- **Affected surface:** `maanta-app/src/app/api/admin/merchants/[id]/approve/route.ts:43-49`
- **Evidence:** Returns `{ error: error.message || "Could not approve this shop." }`
  with the raw `activate_merchant` RPC failure and no allowlist mapping. Every
  sibling admin route does the opposite — `admin/plans/[id]/route.ts:59-73`,
  `admin/redemptions/[id]/appeal/route.ts:43-53`,
  `admin/redemptions/[id]/release/route.ts:41-51` and
  `admin/redemptions/[id]/reverse-fee/route.ts:59-95` all match known failure
  substrings to curated messages and fall back to a generic string, keeping the
  detail in `console.error`.
- **Risk:** A raw Postgres exception can carry table, column, constraint,
  trigger, function or RLS policy names into the browser and network tab.
  Exposure is limited to authenticated admins (the route is behind
  `requireAdminApi()` at `:16`), so this is an information-disclosure and
  consistency defect, not a privilege issue.
- **Recommendation:** Adopt the sibling routes' pattern — map known RPC failure
  strings, fall back to the generic message, log the detail server-side only.
- **Verification:** Re-read the catch block; confirm no `error.message` reaches
  the response body.
- **Owner:** eng

### SEC-006 — Unredacted webhook payloads (including phone numbers) persisted to the database

- **Severity:** Medium
- **Status:** **Fixed 2026-08-10** (tracked as drift **D85**, opened and closed
  in the same change) — see *Fixed in this session* below.
- **Affected surface:** `maanta-app/src/lib/merchant-ledger.ts:73-79`,
  `maanta-app/src/app/api/webhooks/intasend/route.ts:24-27,43-47,61-65`
- **Evidence:** `redactWebhookPayload` redacts exactly one field — `challenge` —
  before `logWebhookFailure` inserts the payload into
  `payment_webhook_failures.payload`. All three IntaSend failure branches pass
  the **full raw webhook body**. IntaSend M-Pesa payloads carry `phone_number`
  (the app sends that field on the way out, `maanta-app/src/lib/intasend.ts:59-68`),
  so a shopper's or merchant's number flows through unredacted on any failure.
  Related, console-only: `intasend.ts:72,80` log the raw IntaSend API response
  text on failure, which can echo the submitted phone number.
- **Risk:** Moderate and contained — `payment_webhook_failures` is admin-only at
  the RLS layer, and only the error string, not the payload, reaches Sentry
  (`merchant-ledger.ts:95-99`). But it is unredacted PII stored outside the
  `maskPhone()` discipline the rest of the codebase applies consistently, and
  the function's name implies broader coverage than it delivers.
- **Recommendation:** Extend `redactWebhookPayload` to mask `phone_number`,
  `account` and similar PII keys, or store a fixed allowlist of diagnostic
  fields (event type, `api_ref`, amount, invoice id) instead of the raw body.
- **Verification:** Unit-test `redactWebhookPayload` with a representative
  IntaSend body and assert no raw phone number survives.
- **Owner:** eng

### SEC-007 — No security headers configured (CSP, X-Frame-Options, nosniff, Referrer-Policy)

- **Severity:** Medium
- **Status:** **Fixed 2026-08-10** — headers verified on a live response.
- **Affected surface:** `maanta-app/next.config.mjs`
- **Evidence:** The config defines `redirects()` (`:33-39`) and `rewrites()`
  (`:41-56`) but **no `headers()` export at all**, and no `vercel.json` exists to
  supply headers at the platform layer. A case-insensitive grep for
  `Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`,
  `X-Content-Type-Options` and `Referrer-Policy` across `maanta-app/src` returns
  zero matches.
- **Risk:** No clickjacking defence (a money surface where a merchant verifies a
  6-digit code and a shopper sees what they will pay is exactly what you do not
  want framed), no CSP backstop should an XSS sink ever be introduced, and no
  `nosniff`. Note this is defence in depth: the audit found no XSS sink today.
- **Recommendation:** Add a `headers()` block setting `X-Frame-Options: DENY`
  (or CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, and
  `Referrer-Policy: strict-origin-when-cross-origin`. Introduce CSP in
  report-only mode first — PostHog is same-origin proxied, which makes a strict
  policy realistic here.
- **Verification:** After deploying, `curl -sI https://<host>/` and read the
  response headers. Confirm separately in the Vercel dashboard whether HSTS is
  already enforced at the edge.
- **Owner:** eng / infra

### SEC-008 — Missing rate limits on two authenticated write endpoints

- **Severity:** Low
- **Status:** **Fixed 2026-08-10.**
- **Affected surface:** `maanta-app/src/app/api/push/subscribe/route.ts`,
  `maanta-app/src/app/api/deals/route.ts`
- **Evidence:** Ten endpoints call `checkRateLimit` (claim, redemption
  verify/preflight/reject, both top-up initiations, merchant onboard, contact,
  waitlist, w3w). These two do not. `POST /api/deals` accepts a 5 MB image
  upload per call (`deals/route.ts:14,82-103`); DB triggers cap the number of
  *live* deals, not create attempts or uploads. `POST /api/push/subscribe`
  overwrites `users.push_subscription` unbounded.
- **Risk:** An authenticated active merchant can burn storage and create-attempt
  volume; a signed-in shopper can churn subscription writes. Both require a
  valid session, so this is abuse-resistance rather than an access-control gap.
- **Recommendation:** Add `checkRateLimit` to both, following the existing
  pattern — the limiter is already DB-backed and shared across instances.
- **Verification:** Re-read both routes for the guard; the limiter's own
  behavior is covered by existing tests.
- **Owner:** eng

### SEC-009 — `.gitignore` does not cover a plain `.env` or `.env.production`

- **Severity:** Low
- **Status:** **Fixed 2026-08-10** — verified with `git check-ignore`.
- **Affected surface:** `maanta-app/.gitignore`
- **Evidence:** The file ignores `.env*.local` and `.env.local`. Neither pattern
  matches a plain `.env` or `.env.production`. No such file exists in the working
  tree or anywhere in history — `git log --all --diff-filter=A --name-only` over
  `*.env*`, `*.pem`, `*.key` shows exactly one such file ever added,
  `maanta-app/.env.example`, which contains only empty keys and non-secret
  defaults.
- **Risk:** Latent, not active. A contributor using either common filename gets
  no protection, and one `git add -A` commits live credentials.
- **Recommendation:** Add `.env` and `.env.production`, or `.env*` with an
  explicit `!.env.example` exception.
- **Verification:** `git check-ignore -v maanta-app/.env maanta-app/.env.production`
  — currently exits non-zero for both; after the fix it prints the matching rule.
- **Owner:** eng

### SEC-010 — No Sentry `beforeSend` scrubbing

- **Severity:** Low
- **Status:** **Fixed 2026-08-10.**
- **Affected surface:** `maanta-app/sentry.server.config.ts`,
  `maanta-app/sentry.edge.config.ts`, `maanta-app/src/instrumentation-client.ts`
- **Evidence:** All three call `Sentry.init({ dsn, environment, tracesSampleRate })`
  with no `beforeSend`, no `beforeSendTransaction`, and no explicit
  `sendDefaultPii` (so it stays at the SDK default of `false`).
  `src/instrumentation.ts:12` wires `onRequestError = Sentry.captureRequestError`,
  which auto-captures unhandled route errors with request context.
- **Risk:** Low today — every current `captureException`/`captureMessage` call
  site was checked and passes constructed strings, never a phone or OTP. The
  exposure is future-facing: one `captureException(err)` on a Postgres error
  whose `.details` embeds a phone number would ship it unfiltered.
- **Recommendation:** Add a `beforeSend` in all three configs stripping
  `otpCode`, `otp_code`, `phone`, `phone_number`, `token` and `authorization`
  from `event.request` and `event.extra`.
- **Verification:** Unit-test the `beforeSend` function directly with a
  synthetic event.
- **Owner:** eng

### SEC-011 — PII in server logs

- **Severity:** Low
- **Status:** **Fixed 2026-08-10** — both the waitlist address and the two
  IntaSend response logs.
- **Affected surface:** `maanta-app/src/app/api/waitlist/route.ts:95`,
  `maanta-app/src/lib/intasend.ts:72,80`
- **Evidence:** `console.error("waitlist: confirmation email failed for", result.data.email)`
  logs a submitter's email address in plaintext. The two `intasend.ts` lines log
  the raw provider response, which can echo a submitted phone number.
- **Risk:** Low — email addresses and phone numbers in Vercel server logs,
  subject to log retention and anyone with log-viewer access. No tokens, OTPs or
  authorization headers are logged anywhere (checked).
- **Recommendation:** Log the waitlist row id rather than the address; apply
  `maskPhone()` or truncate before logging provider responses.
- **Verification:** Re-read both call sites.
- **Owner:** eng

### SEC-012 — CI supply-chain hygiene: floating action tags, no permissions block, no automated dependency or code scanning

- **Severity:** Low / Informational
- **Status:** **Fixed 2026-08-10** — permissions block and Dependabot added;
  SHA pinning delegated to Dependabot rather than hand-maintained.
- **Affected surface:** `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`
- **Evidence:** `actions/checkout@v4`, `actions/setup-node@v4` and
  `supabase/setup-cli@v1` are pinned by floating major tag, not commit SHA
  (`ci.yml:17,19`; `e2e.yml:79,83`). `ci.yml` declares **no top-level
  `permissions:` block**, while `prod-branch-guard.yml` and `e2e.yml` both
  correctly declare `contents: read`. No `.github/dependabot.yml`, no
  `renovate.json`, no CodeQL workflow exists.
- **Risk:** A moved or compromised upstream tag executes in CI. An undeclared
  `permissions` block inherits the org default, which may be broader than the
  `contents: read` this job needs. No automated process would have surfaced
  SEC-002.
- **Recommendation:** Add `permissions: contents: read` to `ci.yml`; pin actions
  to SHAs with a version comment; add `.github/dependabot.yml` covering the npm
  and github-actions ecosystems, security updates at minimum. Confirm
  platform-level secret scanning is enabled in repository settings.
- **Verification:** Re-read the workflow files; confirm Dependabot alerts appear
  in the repository's Security tab.
- **Owner:** eng / infra

### SEC-013 — Phone number not format-validated on merchant onboarding

- **Severity:** Low
- **Status:** **Fixed 2026-08-10.**
- **Affected surface:** `maanta-app/src/app/api/merchants/onboard/route.ts:43-48`
- **Evidence:** The route checks only that `phone` is present. `isValidKenyanPhone`
  exists (`maanta-app/src/lib/phone.ts:2`) and *is* used by the top-up route
  (`topup/route.ts:29`), so the codebase is inconsistent with itself.
- **Risk:** A malformed phone persists to the merchant record, which then feeds
  staff phone-linking (`maanta-app/src/lib/merchant.ts:53-68`) and merchant
  notifications. Data quality with a mild trust edge, not an access-control gap.
- **Recommendation:** Call `isValidKenyanPhone` before insert, matching the
  top-up route.
- **Verification:** Re-read the route; add a case to its test file.
- **Owner:** eng

### SEC-014 — Informational observations

Four items worth recording, none of which is a vulnerability:

1. **`GET /api/sentry-example-api`** (`maanta-app/src/app/api/sentry-example-api/route.ts:11-14`)
   is public, unauthenticated, and unconditionally throws. It returns no data
   and changes no state — it is the stock Sentry scaffold route. Worth deleting
   as dead demo scaffolding in the production route tree, not urgent.
2. **The redemption preflight endpoint is a code-validity oracle.**
   `redemptions/preflight/route.ts:39-51` returns `found: true/false` for a
   6-digit code without charging the fee. It shares the 20-per-minute bucket
   with verify and reject, and requires merchant-verifier authorization, so the
   threat model is a compromised staff account inside one shop, not an outside
   attacker. Brute force is infeasible regardless: exhausting 10^6 codes at
   20/min takes ~35 days and every pending code expires long before that.
   Consider per-verifier rather than per-merchant miss telemetry if staff
   compromise becomes a live concern.
3. **`wipe_demo_data` has no explicit `GRANT ... TO service_role`** — it is
   protected by `REVOKE ALL FROM PUBLIC` (`20260729142000_demo_mode_reseed.sql:347`),
   so it is not reachable by `anon` or `authenticated`. An explicit grant would
   make the intent auditable rather than implied.
4. **Any `admin` can grant `cofounder` at the DB layer.** The
   `prevent_self_role_escalation` trigger permits role changes by an existing
   admin; CLAUDE.md documents cofounder assignment as founder-held (Q14), which
   is a process rule, not a database constraint. Zero users hold the role today
   (**D69**, **D74**). Noting the layering, not proposing a change.

---

## Fixed in this session

Eleven of the sixteen findings were remediated after the audit was written, on
the same branch: SEC-004, SEC-005, SEC-006, SEC-007, SEC-008, SEC-009, SEC-010,
SEC-011, SEC-012 and SEC-013 in full, plus the replay half of SEC-001 and the
non-breaking half of SEC-002. All were verified by running the checks — and
where a behavioural claim was testable, by confirming the new test fails against
the old code, not by inspection alone.

**Still open and why:** SEC-001's signature half (needs an answer from IntaSend
about whether a payload HMAC exists), SEC-002's `next` upgrade (breaking, two
majors — your call), SEC-003 (a founder product decision, drift D84), and the
SEC-014 informational items.

### SEC-005 — fixed in full

`maanta-app/src/app/api/admin/merchants/[id]/approve/route.ts` now maps the
three failures `activate_merchant` actually raises — `merchant_not_found` → 404,
`already_active` → 409, `unauthorized` → 403 — and returns one generic sentence
for anything unrecognised, keeping the detail in `console.error`. That last
branch is the one that mattered: it is where an unmapped Postgres exception used
to carry relation, column and constraint names into the response.

The admin client (`merchant-admin-actions.tsx:61`) reads `body.error`
status-agnostically, so the curated copy renders as-is — an admin now sees
"This shop is already approved." instead of a raw database string.

Guard: `maanta-app/src/app/api/admin/merchants/[id]/approve/__tests__/route.test.ts`.
Six cases, including an explicit assertion that a realistic foreign-key
violation message does **not** appear in the response body.

### SEC-001 — replay half fixed, signature half still open

`maanta-app/src/app/api/webhooks/intasend/route.ts` now keys the ledger write on
the app-minted `api_ref` rather than the provider's optional invoice id. That
value is minted once per STK push as `topup:<merchant-uuid>:<uuid>`, is
guaranteed present by the merchant-id regex that already gates the handler, and
is stable across redeliveries — so the reference is always non-null and always
identical for repeat deliveries of one payment.

Worth recording why the obvious form was rejected: keying on
`invoice_id ?? api_ref` would be **worse than either alone**. A first delivery
carrying an invoice id and a retry without one would produce two different keys
for a single payment, and double-credit. The fix ignores the invoice id entirely
for idempotency purposes. Merchant-facing copy was left untouched — the wallet
detail page renders `description`, so nothing there changed.

Guard: `maanta-app/src/app/api/webhooks/intasend/__tests__/route.test.ts`. Eight
cases; the three that pin the fix assert the reference is never null, is stable
across redeliveries, and is unaffected by the presence of an invoice id. All
three fail against the previous code — verified by stashing the fix and
re-running, not assumed.

### SEC-004 — fixed in full

The filter is now built by `ilikeAnyFilter` in the new
`maanta-app/src/lib/postgrest-filter.ts`, which wraps the search term in double
quotes and escapes backslashes before quotes. Inside a quoted PostgREST value
the reserved characters — `,` `.` `(` `)` `:` — are data, so
`q = "x,role.eq.admin"` becomes a search for that literal string instead of a
second OR condition.

**Quoting, not stripping**, deliberately. Stripping the reserved set is the
obvious fix and is wrong here: every email contains a `.`, so stripping would
silently break the email search that is half the point of the box. Quoting
keeps "search for j.doe@example.com" working while neutralising the grammar.
The helper also rejects any column name that is not a plain identifier, so it
cannot itself become the vector it exists to close.

Guard: `maanta-app/src/lib/__tests__/postgrest-filter.test.ts`. Twelve cases,
including the backslash-before-quote ordering trap (escaping quotes first would
let `\"` be un-escaped) and a **source-scan ratchet** that fails if any `.or()`
call anywhere under `src/` interpolates a template literal again. That last one
is the part that matters over time — it is the same lesson as the shared comment
lexer (**D38**): a second private copy of an escaping rule is how the defect
returns. Verified the ratchet fires by reverting the call site and watching it
fail.

### SEC-006 — fixed in full

Redaction moved to `maanta-app/src/lib/redact.ts` and was inverted from a
one-key denylist to an **allowlist**: only named diagnostic fields keep their
value, so a provider adding a field tomorrow cannot start silently persisting
it. Two design choices worth stating:

- **Keys are preserved, values replaced.** Dropping unknown keys entirely would
  hide the shape of an unfamiliar payload from whoever is debugging a failed
  credit, which is the reason `payment_webhook_failures` exists. A reviewer
  still sees which fields arrived, just not their values.
- **Phones are masked, not redacted**, through the same `maskPhone` every
  merchant-facing surface uses — enough to confirm which payment this was,
  without storing the number, and one masking rule in the codebase rather than
  two. A number too short for `maskPhone` to mask safely returns `null`, which
  becomes a full redaction rather than a passthrough.

Recursion covers nested objects and arrays with a depth cap. `redactFreeText`
handles the unparsed-response case in `maanta-app/src/lib/intasend.ts:72`,
documented in the code as a shape heuristic and not a real control — with no
keys to go on, the only signal is a run of 7+ digits.

Scope note found while fixing: `logWebhookFailure` is called from **eleven**
places in the Stripe route, but none passes a `payload` — only `errorMessage`
and `eventType`. The raw-body persistence was IntaSend-only, so the blast radius
was narrower than the finding implied.

Guard: `maanta-app/src/lib/__tests__/redact.test.ts`, 15 cases. Verified the old
behavior by running the previous function against the same payload: it emitted
the raw `+254712345678` and `jane@example.com`.

---

**What SEC-001 still does not fix.** `verifyWebhookChallenge` is still a static shared
secret echoed in the request body, with no signature over the payload. A caller
holding that secret can still mint fresh `api_ref` values and credit arbitrary
amounts up to KES 1,000,000. Replay and accidental double-credit are closed;
**forgery is not**. Amount reconciliation is also still absent, and is a larger
change than it first appears: `maanta-app/src/app/api/topup/route.ts` persists
nothing at initiation, so there is no record of the initiated amount to
reconcile against — it needs a pending-top-up row first. D83 stays open for
both reasons.

## Second remediation pass — 2026-08-10

Seven further findings fixed, plus the non-breaking half of the dependency work.

**SEC-007 — security headers.** A `headers()` block in
`maanta-app/next.config.mjs` now sets `Content-Security-Policy: frame-ancestors 'none'`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy`.
**Verified on a live response**, not by reading the config: built the app, ran
`next start`, and confirmed all five headers on `/` and on `/api/healthz`.

A **full** CSP is deliberately not set. The app loads Clerk, Sentry, Leaflet
tiles and PostHog, and a strict `script-src` shipped blind would break a live
surface in a way nothing in this repo would catch — CI has no browser and the
e2e run is gated on `E2E_BASE_URL`. `frame-ancestors` is the one directive safe
to ship without that testing, because it constrains who may frame the page and
says nothing about what the page may load. HSTS is also deliberately absent:
Vercel sets it at the edge for custom domains, and a second, weaker source of
truth for a header with a long `max-age` is worse than none.

**SEC-008 — rate limits.** `/api/deals` (10 per 5 min per merchant, checked
*before* the body is read so an abusive loop cannot buffer a 5 MB upload per
attempt) and `/api/push/subscribe` (20/hour per user).

**SEC-009 — `.gitignore`.** Now ignores `.env` and `.env.*` with an explicit
`!.env.example` re-admission. Verified with `git check-ignore -v`: `.env`,
`.env.production` and `.env.local` all match a rule; `.env.example` does not.

**SEC-010 — Sentry scrubbing.** `beforeSend` in all three configs, backed by one
shared `maanta-app/src/lib/sentry-scrub.ts` rather than three copies.

Worth recording: the first version tried to blank the fields and send the event
anyway when scrubbing failed. Its own test caught that assigning to a
getter-only property throws *again from inside the catch*, so the "fail safe"
was not safe. The contract is now **discard the event** (`beforeSend` treats a
null return as drop) — losing one error report beats transmitting a payload we
could not inspect.

**SEC-011 — PII in logs.** The waitlist failure logs the segment instead of the
address; the two IntaSend response logs were already covered by the SEC-006
redactors.

**SEC-012 — CI supply chain.** `permissions: contents: read` added to `ci.yml`
(the only workflow missing it), and `.github/dependabot.yml` added for npm
(security updates, weekly) and github-actions (monthly). SHA pinning is
delegated to Dependabot, which rewrites floating tags to digests when it opens a
PR — sustainable, versus hand-maintained digests that go stale.

**SEC-013 — onboarding phone.** Now format-checked with the same
`isValidKenyanPhone` the top-up route already used.

**SEC-002 — partly fixed.** `npm audit fix --omit=dev` resolved
`brace-expansion`, `dompurify`, `fast-uri` and `nanoid`: **6 vulnerabilities
(5 high, 1 moderate) down to 2 high**, `package.json` untouched, lockfile-only.
The remaining two — `next` and its nested `postcss` — both require
`next@16.3.0`, two majors up and breaking. **Not done: that is your call**, and
it needs an App Router regression pass, not a drive-by upgrade.

One process note: `npm audit fix --omit=dev` prunes devDependencies from
`node_modules` as a side effect. A plain `npm ci` restores them and leaves the
fixed lockfile intact — confirmed before running the gate.

## Amount reconciliation — written 2026-08-10, not yet applied

The third of SEC-001's three parts. The webhook took its amount straight from
the payload, bounded only by `MAX_TOPUP_AMOUNT`, and nothing cross-checked it
against the STK push that started the payment — because nothing recorded that
the push had happened. `POST /api/topup` minted an `api_ref`, called the
provider, and persisted nothing.

**What changed.** A new `pending_topups` table
(`maanta-app/supabase/migrations/20260810120000_pending_topups.sql`) holds one
row per initiated push, keyed by the same `api_ref` the webhook already parses
the merchant id out of — so the two records join on exactly the value the
webhook carries, with no second correlation key to drift. The top-up route
writes that row **before** the push (so a fast callback still finds it) and
fails the request if it cannot, because proceeding would create a payment whose
amount can never be verified. The webhook now refuses to credit when there is no
pending row, when the merchant id disagrees with the one embedded in the
reference, or when the amount does not match — each refusal written to
`payment_webhook_failures` with the redacted payload rather than dropped.

**What it does and does not buy.** A caller holding the shared secret can still
forge a webhook, but now only for an amount a real merchant really initiated —
which turns "mint KES 1,000,000 at will" into "replay a specific pending
top-up", and the ledger's `UNIQUE(provider_reference)` already makes that a
no-op. The signature question is untouched and still needs IntaSend's answer.

**Rollout trade, stated because it is a real cost.** A push initiated before
this lands has no pending row, so its callback is refused and logged for manual
settlement. That is deliberate: crediting unknown references instead would leave
the hole permanently open for anyone able to forge one. The window is small
(IntaSend is a prepared-not-assumed rail) and nothing is lost silently.

**Deploy state — APPLIED to production 2026-08-10 15:45 UTC.** See
*Production deployment* below for the full evidence. The paragraphs that follow
describe the pre-deployment verification and are kept as the record of what was
known before the apply.

**`make db-verify` cannot run in this environment, and the reason is a policy
denial, not a missing tool.** A Docker daemon was started successfully and the
Supabase CLI was installed at the exact version CI pins (2.109.1), but
`supabase start` cannot pull its images: the agent proxy returns 403 for all
three registry CDNs — `production.cloudfront.docker.com` (Docker Hub),
`pkg-containers.githubusercontent.com` (GHCR) and `d2glxqk2uabbnd.cloudfront.net`
(ECR Public). `supabase start` also reaches out to the Clerk OIDC endpoint
configured in `supabase/config.toml`, which is denied by the same policy. Per
`/root/.ccr/README.md` these are reported, not circumvented.

**What was verified instead — real SQL execution, in isolation.** A throwaway
PostgreSQL 16.13 cluster was started locally (no Docker), given a minimal
scaffold of the objects this migration references (`anon`/`authenticated`/
`service_role` roles, `public.users`, `public.merchants`, and stubs for
`current_user_id()`/`current_user_role()`), and then:

- `20260810120000_pending_topups.sql` applied cleanly — every statement, no errors.
- `supabase/tests/pending_topups_test.sql` passed all four scenarios (grants,
  RLS enabled, constraints, cascade-on-merchant-delete).
- The test was confirmed non-vacuous: granting `authenticated` INSERT/UPDATE
  made Scenario A fail with its own assertion message.

**The full chain is now verified too — by CI, on PR #187.** The isolated run
above could not cover ordering against the other 87 migrations, RLS behaviour
under real JWT claims (the helper functions were stubbed), or the real
`auth`/`storage` schemas. The `db-tests` job covers all three, and it **passed**
on the first run of PR #187
([job 93487120035](https://github.com/MAANTA-APP/MAANTA/actions/runs/31398446494/job/93487120035)),
with the new suite named explicitly in the log:

```
##[group]supabase/tests/pending_topups_test.sql
  Scenario A passed: pending_topups grants are service_role-only for writes
  Scenario B passed: RLS enabled
  Scenario C passed: pending_topups constraints hold
  Scenario D passed: pending_topups cascades on merchant delete
  ALL pending_topups scenarios passed.
```

So the migration applies in order against the real schema and its guards hold
under the project's normal JWT-claim model. **What remains is the apply itself**
— a human step, per `docs/ops/supabase-migrations.md`. Until then the webhook
still credits unreconciled amounts in production.

The TypeScript side is separately covered by
`maanta-app/src/app/api/webhooks/intasend/__tests__/route.test.ts` — a payload
naming KES 1,000,000 against an initiated 500 credits nothing — but that suite
mocks the database, so it proves the route's logic, not the schema.

---

## Production deployment — 2026-08-10

The `pending_topups` migration is **live**. Recorded here because a merged
migration is not an applied one, and the difference is the whole point of
SEC-001's reconciliation half.

| Field | Value |
|---|---|
| Migration | `maanta-app/supabase/migrations/20260810120000_pending_topups.sql` |
| Applied at | 2026-08-10 **15:45:13 UTC** (from the ledger's minted version) |
| Operator | Claude, via the Supabase MCP, under explicit founder authorization — the same recorded-exception route used for **D25** |
| Project | `axrrslqssmbngbataejg` |
| Code merged at | `d1ae85e` (PR #187) |

**Before-state, verified not assumed.** `to_regclass('public.pending_topups')`
returned NULL, the ledger held **87** rows ending at
`20260807161000_cofounder_read_policies`, and no row carried version
`20260810120000`.

**Read-back after apply** — all five checks, run against production:

| Check | Expected | Actual |
|---|---|---|
| Ledger row `20260810120000` / `pending_topups` | 1 | **1** |
| Ledger total | 88 (matches repo) | **88** |
| `relrowsecurity` on `pending_topups` | true | **true** |
| Policies on the table | 2, both SELECT with predicates | **2** (`pending_topups_admin_read`, `pending_topups_merchant_read`) |
| `has_table_privilege('authenticated', …, 'INSERT')` | false | **false** |

Also confirmed: `authenticated` UPDATE **false**, `anon` SELECT **false**,
`authenticated` SELECT true (RLS-gated, intended), `service_role` INSERT true.

**A D24 recurrence was caught and repaired during the apply.** The MCP's
`apply_migration` takes no version parameter and minted **`20260810154513`**,
diverging from the repo filename's `20260810120000` — the exact mechanism behind
**D24**. That mattered more than last time: this migration is **not** idempotent
(bare `CREATE TABLE` / `CREATE POLICY`), so a later `supabase db push` would have
re-run it and errored, rather than being harmlessly repeated. The ledger row was
repaired to the repo version immediately and re-read.

**That instance is fixed; the underlying gap is not, and D86 stays open.** The
runbook recorded previous repairs as history but carried no instruction to
perform one — so the control was five separate acts of someone happening to
check. **Every MCP apply to date has needed this repair** (`20260730180000`,
`20260730190000`, `20260807160000`, `20260807161000`, `20260810120000` — five
for five). A standing procedure now exists as §7 of
`docs/ops/supabase-migrations.md`, with the preference stated plainly: use
`supabase db push`, which keys on the filename and never mints a version, and
reach for the MCP only when a human-run push is unavailable. D86 closes when the
next apply has actually gone through §7 — an unexercised runbook step is a
claim, not a control.

**Smoke test — passed, self-cleaning, nothing moved.** Run against an explicitly
demo merchant (`c0000000-0000-4000-a000-000000000001`, "Nuur Fashion House",
`is_demo = true`) with a unique labelled reference
(`…:smoketest-d83-20260810T1545Z-a7f3`), as a single atomic block so a failed
assertion would roll the insert back rather than leave residue:

- The webhook's happy-path lookup resolves: `merchant_id`, `amount = 500` and
  `status = 'initiated'` all as inserted.
- The refuse-to-credit predicates hold: an amount of 1,000,000 does not equal the
  initiated 500, and an unknown `api_ref` resolves to no row.
- Cleanup verified: the exact row deleted, `pending_topups` back to **0 rows**,
  no `%smoketest%` residue anywhere in the table.
- **Nothing moved**: demo merchant balance unchanged at **540.00**, zero ledger
  rows created, no IntaSend call, no STK push.

**What this does and does not close.** SEC-001's reconciliation half is now live
and evidenced. **SEC-001 stays open** on the signature half —
`verifyWebhookChallenge` is still a static shared secret with no HMAC over the
payload — and so does **D83**.

---

## Adversarial verification pass — 2026-08-10

The SEC-004 and SEC-006 fixes were put through an independent review whose
reviewers were instructed to **refute** rather than confirm. It was worth doing:
it settled the one question this environment could not answer, and it found four
real defects, two of them introduced by the fixes themselves.

**Settled: the PostgREST quoting is correct.** A reviewer fetched PostgREST
v12.2.3's parser source and traced the actual grammar rather than reasoning by
analogy. `or=` params route to the logic-tree parser, whose values parse with
`pLogicSingleVal`, which tries `pQuotedValue` — so double quotes are accepted
**and stripped**, and its un-escaping (`char '\\' *> anyChar`) is byte-for-byte
what `quoteFilterValue` implements, in the same order. **The admin customer
search does not break.** This closes the verification gap this report previously
flagged as open.

It also sharpened *why* the fix is context-specific: quoting is only meaningful
inside a logic tree or an `in.()` list. Top-level filters (`.eq()`, `.filter()`)
take the rest of the parameter verbatim and never strip quotes — which is why
postgrest-js's own `.ilike()` correctly emits no quotes. The helper is right for
`.or()`; a caller who reused it on `.eq()` would get zero rows and no error.

**Four defects found and fixed:**

1. **`logWebhookFailure` logged the raw params on its own failure branch** —
   four lines below the SEC-006 fix. `redactWebhookPayload` is pure, so
   `params.payload` was still the untouched provider body, and on the
   invalid-challenge branch that body's `challenge` field is the **live
   `INTASEND_WEBHOOK_SECRET`**. Arguably worse than the finding it sat inside.
   Now redacted once and reused for both the row and the log.
2. **The redaction depth cap failed *open*** on the allowlisted branch: at
   exactly `MAX_DEPTH`, a diagnostic key holding an object returned its subtree
   raw. Demonstrated by execution against the compiled module — PII nested under
   `status` at exactly six wrappers came back byte-identical. The sibling
   branches already failed closed; this one did not. Now fails closed, with a
   regression test sweeping wrapper counts 0–9 because the leak existed at
   exactly one depth.
3. **`redactFreeText` did not match the phone formats the app itself sends.**
   `\d{7,}` needs an unbroken run, so `+254 712 345 678` and `0712 345 678`
   passed through untouched — and the top-up route forwarded separators verbatim
   because `isValidKenyanPhone` strips them from a *copy*. Fixed at both ends:
   the number is normalised at the boundary before it leaves the app, and the
   redactor now tolerates separators and redacts emails too.
4. **"One masking rule in the codebase, not two" was false when written** — and
   it had been written into D85's closing note as justification. There were two
   `maskPhone` implementations, and the copy in `maanta-app/src/lib/ui.ts`
   returned the number **completely unmasked** for inputs under 7 characters, on
   admin, agent and merchant surfaces. Consolidated: `lib/ui.ts` is now a
   presentation wrapper over the single masker, differing only in the mask
   character, so no rendered output changed. D85's wording is corrected to say
   the claim was made true rather than checked.

All seven new regression tests were confirmed to fail against the reverted code.

**Two findings were correctly rejected** as false positives, and are recorded
here so they are not re-raised: that quoting might silently break the search
(refuted by the parser trace above), and that `redactWebhookPayload` might throw
(refuted by execution across `{}`, `[]`, nullish, scalars, `__proto__` and
5000-deep chains — no throw, no stack overflow).

---

## Checklist: 20 controls

| # | Control | Status | Severity | Evidence / location | Required action |
|---|---|---|---|---|---|
| 1 | Environment files and repository secrets | Pass (fixed 2026-08-10) | — | Only `maanta-app/.env.example` tracked (placeholders only); no `.env`/`.pem`/`.key` ever added in history; CI uses literal placeholders (`.github/workflows/ci.yml:47-54`). `.gitignore` now ignores every `.env` variant while keeping `.env.example` tracked | SEC-009 closed |
| 2 | API keys exposed to the frontend | Pass | — | 14 `NEXT_PUBLIC_` vars, all designed-public (Supabase anon, Clerk publishable, PostHog, Sentry DSN, VAPID public); 25 server-only vars traced; all 74 importers of `src/lib/supabase/service.ts` verified non-`'use client'`; `productionBrowserSourceMaps` unset | None. Confirm Vercel env scoping manually |
| 3 | Row Level Security | Pass | — | All 25 tables have RLS enabled; event trigger `rls_auto_enable` force-enables on future `CREATE TABLE`; policies bind through `current_user_id()`/`current_user_role()` from the verified JWT; write grants revoked from `authenticated` on core tables (`20260723120000`) | None |
| 4 | Frontend-only authorization | Pass | — | All 39 API routes carry a server-side guard; money/trust RPCs re-check caller identity inside `SECURITY DEFINER` (`claim_deal`, `verify_redemption`, `merchant_verify_authorized`); no server actions exist | None |
| 5 | Rate limiting and abuse controls | Pass (fixed 2026-08-10) | — | DB-backed shared limiter (`src/lib/rate-limit.ts` → `check_rate_limit` RPC), now on 12 endpoints — `/api/deals` and `/api/push/subscribe` added. Webhooks remain unlimited by design (signature/secret-gated, and providers retry) | SEC-008 closed |
| 6 | SQL injection prevention | Pass (fixed 2026-08-10) | — | No raw SQL anywhere; all `.rpc()` calls use bound named params; 3 dynamic-SQL sites in migrations all use `%I` with catalog-sourced identifiers. The one raw `.or()` filter string now builds through `lib/postgrest-filter.ts`, with a source-scan ratchet against recurrence | SEC-004 closed |
| 7 | Input validation | Finding (partly fixed) | Low | Hand-rolled, no schema library. Money paths well-guarded (`isValidTopupAmount` rejects NaN/Infinity/overflow; magic-byte image check; UUID pre-check on onboard). Onboard phone **fixed 2026-08-10**. Webhook amount reconciliation **applied to production 2026-08-10** (`pending_topups`), so a webhook naming an amount the merchant never initiated is now refused. Remaining under this control: nothing — the open SEC-001 work is the signature, not validation | SEC-001 — signature half |
| 8 | User content rendered as HTML | Pass | — | Zero occurrences of `dangerouslySetInnerHTML`, `innerHTML`, `insertAdjacentHTML`, `document.write`, `srcdoc`. Legal markdown uses a hand-written parser emitting React children (`components/marketing/LegalDoc.tsx`). HTML emails escape via `src/lib/escape-html.ts` | None |
| 9 | Password handling | Pass (N/A) | — | Fully passwordless — Clerk OTP or Supabase email OTP. Zero password code in `src/` or migrations; the 9 `password` matches are marketing/legal copy | None |
| 10 | Auth storage and session handling | Pass | — | Cookie-based both strategies (`@supabase/ssr` `getAll`/`setAll`, or Clerk-managed); no token in `localStorage`/`sessionStorage`; both sign-out paths invalidate server-side; open-redirect guard on the auth callback | Confirm cookie flags in prod (manual) |
| 11 | Unprotected admin surfaces | Pass | — | `/admin`, `/agent`, `/founder` all behind async server-component layout guards with `force-dynamic`; all 8 `api/admin/*` routes open with `requireAdminApi()`; middleware matcher excludes only static assets; `healthz` detail gated behind admin | None |
| 12 | CORS configuration | Pass | — | Zero `Access-Control-Allow-*` anywhere; no `OPTIONS` handlers; no `vercel.json`. Framework default = same-origin. A `headers()` block now sets the security headers (SEC-007), still no CORS relaxation | Supabase Storage CORS needs manual check |
| 13 | Email verification and account identity | Pass | — | Both strategies require a completed OTP before a session exists; self-role-escalation blocked by DB trigger with `EXECUTE` revoked from all roles; `admin`/`agent`/`cofounder` have no self-serve grant path | None |
| 14 | Predictable identifiers and IDOR | Pass | — | All IDs are UUIDs; every object-access path scopes to the authenticated actor (`.eq("merchant_id", merchant.id)` etc.); OTP codes bound to `merchant_id` at unique-index and query level, so merchant A cannot verify merchant B's code | None |
| 15 | Sensitive request-body logging | Pass (fixed 2026-08-10) | — | OTPs and tokens never logged; `maskPhone()` applied consistently at merchant-facing surfaces. All three findings closed: webhook payload redaction (allowlist + phone masking, `lib/redact.ts`, incl. the ledger failure-branch log the adversarial pass caught), Sentry `beforeSend` scrubbing in all three configs, and the waitlist address no longer logged | SEC-006, SEC-010, SEC-011 closed |
| 16 | Webhook signature validation | Finding (partly fixed) | **High** | Stripe: correct — `constructEvent` over `request.text()` raw body before parsing, signed timestamp, idempotent ledger. IntaSend: null-reference replay **fixed 2026-08-10**; static shared secret with no payload signature remains | SEC-001 — signature half |
| 17 | Production error handling | Pass (fixed 2026-08-10) | — | All 5 error boundaries show static copy and never render `error.message`; source maps not shipped. The one route returning raw `error.message` now maps known failures and returns a generic message otherwise — all 14 RPC-backed routes are consistent | SEC-005 closed |
| 18 | Dependency and supply-chain hygiene | Finding (partly fixed) | **High** | Was 6 vulnerable packages (5 high, 1 moderate); **now 2** after the non-breaking upgrades — `next@14.2.35` (direct, 21 advisories) and its nested `postcss` both need the breaking `next@16` jump. Lockfile committed, registry-only, no git-URL deps, no app-authored install hooks. Dependabot and a CI `permissions` block added 2026-08-10 | SEC-002 — `next` upgrade |
| 19 | Password strength and account protections | Needs manual verification | — | N/A for passwords (passwordless). Code-side: rate limits on verify/claim/onboard, merchant status gate, core-table write revocation. MFA, lockout, OTP send limits and session lifetime are all provider-dashboard settings, documented nowhere as configured | Verify Clerk + Supabase auth settings |
| 20 | File-upload security | Pass | — | One upload path; magic-byte validation (`src/lib/image-bytes.ts` — JPEG/PNG/WebP only, SVG excluded at both app and bucket layer); 5 MB cap in app and bucket; server-generated path `{merchant.id}/{randomUUID()}.{sniffed ext}`; bound to `requireMerchant("can_deals")` | Supabase Storage CORS/policies need manual check |

---

## Positive controls observed

These are worth naming because they are the reason most of this audit came back
clean, and because they are the patterns that should survive future changes.

1. **Identity is always server-derived.** `ensureAppUser()` resolves the user
   from the JWT `sub` claim. No route trusts a client-supplied `role`,
   `user_id`, or `merchant_id` for an authorization decision.
2. **Money and trust RPCs re-check the caller themselves.** `claim_deal` rejects
   a mismatched `p_user_id`; `verify_redemption` requires
   `merchant_verify_authorized`; `record_merchant_ledger_entry` raises unless
   `auth.role() = 'service_role'`. The app-layer guard is not the only gate.
3. **RLS cannot be silently forgotten.** The `rls_auto_enable` event trigger
   force-enables RLS on any new table in `public` and warns rather than failing
   silently.
4. **Table grants back up the policies.** `20260723120000_revoke_authenticated_writes_core_tables.sql`
   revokes INSERT/UPDATE/DELETE on `merchants`, `deals` and `redemptions` from
   `authenticated`, so a stolen JWT cannot write through PostgREST regardless of
   policy wording.
5. **The Stripe webhook is a correct reference implementation** — raw body via
   `request.text()` before parsing, HMAC with signed timestamp, idempotent
   crediting. SEC-001's fix already exists in the codebase, one directory over.
6. **The ledger RPC closed a real race.** Idempotency is a UNIQUE constraint
   inside the same transaction as the balance update, replacing a
   read-then-insert TOCTOU — with the null caveat in SEC-001.
7. **Uploads sniff bytes, not MIME.** `detectImageType` reads magic bytes and
   returns null for anything that is not JPEG, PNG or WebP; the stored extension
   derives from the sniffed type, never the client filename. SVG is excluded at
   both the app and bucket layer, closing the stored-XSS-via-image-bucket vector
   that this feature shape usually misses.
8. **Rate limiting is DB-backed, not in-memory** — shared across serverless
   instances and surviving cold starts, and the JS wrapper fails closed.
9. **Self-role-escalation is blocked in the database**, and the trigger
   function's own `EXECUTE` is revoked from every role including `service_role`,
   so it is trigger-only.
10. **The team's own hardening loop is visible in the migration history** —
    several migrations exist specifically because Supabase's `get_advisors`
    linter flagged a function as anon-reachable, and say so in their comments.
11. **24 SQL assertion suites run in CI** against an ephemeral database,
    including direct RLS-bypass attempts.
12. **No third-party scripts in the browser.** No `<script src>`, no `next/script`,
    no CDN URL; PostHog is same-origin proxied through `next.config.mjs`
    rewrites, which also makes a strict CSP realistic (SEC-007).

---

## Tests and commands run

Every command below was run in this session. Results are reported as they
actually happened, including the ones that could not produce a useful signal.

| Command | Exit | Result |
|---|---|---|
| `git status`, `git log --oneline -3` | 0 | Clean tree at `8b7f147` on `claude/maanta-security-audit-z1p64u` |
| `git ls-files \| grep -E '(^\|/)\.env\|\.env\.\|\.pem$\|\.key$'` | 0 | One match: `maanta-app/.env.example` (placeholders only) |
| `git log --all --diff-filter=A --name-only -- '*.env*' '*.pem' '*.key'` | 0 | One commit ever added such a file — `.env.example` itself. No secret file was ever added and later removed |
| `git log --all -S` probes for `sk_live_`, `whsec_`, `BEGIN PRIVATE KEY` | 0 | No commits matched the two literal PEM-header probes; the others matched only unrelated documentation prose |
| Tree-wide greps for `service_role`, `sk_live`/`sk_test`, `whsec_`, `PRIVATE_KEY`, JWT-shaped strings | 0 | Every hit is a variable name, prose, or an explicit CI/test placeholder. **No live secret found** |
| `npm audit --omit=dev --package-lock-only` | 1 | **6 vulnerabilities: 5 high, 1 moderate.** `next@14.2.35` (direct, 21 advisories), `postcss@8.5.16` (4), `nanoid@3.3.15` (2), `fast-uri@3.1.4`, `brace-expansion@5.0.8`, `dompurify@3.4.12`. Reads the committed lockfile; installs nothing |
| `npm run lint` (audit pass) | 127 | **Did not run** — `sh: 1: next: not found`. `node_modules` was not installed during the audit itself |
| `npm run typecheck` (audit pass) | 2 | **No useful signal** — 5,032 errors, all `Cannot find module` / `Cannot find name 'process'`, i.e. missing `node_modules`, not type errors in app code |
| `npm test` (audit pass) | 127 | **Did not run** — `sh: 1: vitest: not found` |
| `make db-verify` | not run | Requires a local Supabase stack, unavailable here. No SQL was changed by the fixes, so the `db-tests` job is unaffected |
| Drift-register schema validation (local script replicating `drift-register.test.ts`) | 0 | 84 rows parse, 8 cells each, D1–D84 contiguous, no duplicate IDs, all statuses/categories/dates valid, every path cited by D83/D84 resolves, `Last updated` stamp not older than the newest row |

### After the SEC-001 and SEC-005 fixes

`npm ci` was run to remediate the two findings (it reads the committed lockfile
and left `package.json` and `package-lock.json` unmodified — confirmed with
`git status`). The full gate then ran and **passed**:

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | `✔ No ESLint warnings or errors` |
| `npm run typecheck` | 0 | Clean |
| `npm test` | 0 | **624 tests in 81 files passed** — 597 before the fixes, plus 27 new — including `drift-register.test.ts`, which validates the D83/D84/D85 rows |
| `npm run build` | 0 | Compiled, and all three post-build gates clean: `check-tokens` (47 rendered files, 390 chunks), `check-canonicals` (16 marketing routes), `check-server-forms` |
| Regression check: stash the SEC-001/SEC-005 fixes, re-run their tests | 1 | **6 of 14 failed**, confirming they fail against the old code rather than passing vacuously. Restored and re-verified |
| Regression check: revert the SEC-004 call site, re-run its tests | 1 | The source-scan ratchet fired on the reverted `.or()` template literal. Restored and re-verified |
| Regression check: run the previous `redactWebhookPayload` against the test payload | — | Emitted `+254712345678` and `jane@example.com` verbatim — the leak the SEC-006 tests now forbid |
| Adversarial verification pass (5 refute lenses + adjudication) | — | Confirmed the PostgREST quoting against the real parser source; found 4 real defects, all fixed; rejected 2 false positives. See *Adversarial verification pass* |
| Regression check: revert all 4 verification-pass fixes, re-run their tests | 1 | **7 of 7 new tests failed**, then passed again once restored |
| `npm test` after the verification-pass fixes | 0 | **641 tests in 83 files passed** |

### After the second remediation pass

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | `✔ No ESLint warnings or errors` |
| `npm run typecheck` | 0 | Clean (two real type errors found and fixed on the way: the Sentry generic could not index arbitrary keys, and `ErrorEvent` has no index signature) |
| `npm test` | 0 | **633 tests in 82 files passed** |
| `npm run build` | 0 | Compiled; all three post-build gates clean |
| `next start` + `curl -sI` on `/` and `/api/healthz` | 0 | All five security headers present on both — SEC-007 verified against a served response, not the config |
| `git check-ignore -v` on `.env`, `.env.production`, `.env.local`, `.env.example` | — | First three ignored, `.env.example` not — SEC-009 verified |
| `npm audit --omit=dev --package-lock-only` | 1 | **2 high** remaining, down from 6 (5 high, 1 moderate) |

**The audit pass itself could not run lint, typecheck or test** — that is
recorded above and stands. Those results are from the remediation pass, after
dependencies were installed. `make db-verify` still has not run; no SQL was
changed, so nothing in the `db-tests` job is affected by these fixes.

---

## Remediation plan

> **Status as of 2026-08-10:** everything in *Fix immediately* and *Fix before
> wider pilot* is done except the two items that need a decision rather than a
> diff — SEC-001's signature half and SEC-002's `next` upgrade. The manual
> dashboard checks are all still outstanding.

### Fix immediately

1. ~~**SEC-001 — IntaSend webhook.** Refuse to credit on a null provider
   reference, and derive the reference from the app-minted `api_ref`.~~
   **Done 2026-08-10.** The ledger now keys on `api_ref`; replay and accidental
   double-credit are closed and guarded by tests.
2. **SEC-002 — dependency triage.** Take the four non-breaking `npm audit fix`
   upgrades, and triage the 21 `next` advisories against MAANTA's actual
   configuration so the real exposure is known rather than counted.

### Fix before wider pilot or public launch

3. **SEC-001 (second half)** — confirm whether IntaSend offers a payload HMAC
   and verify against it; otherwise reconcile the credited amount against the
   initiated top-up. Do not open the M-Pesa rail to real money until one of
   these is true.
4. **SEC-002 (second half)** — plan the `next` upgrade with an App Router
   regression pass.
5. **SEC-003** — rule on whether `claim_deal` asserts phone verification itself;
   at minimum correct the comment so it stops asserting an invariant that does
   not exist.
6. ~~**SEC-004 and SEC-006** — the filter-injection pattern and the webhook
   payload redaction.~~ **Done 2026-08-10**, along with **SEC-005**. All three
   are guarded by tests; SEC-004 additionally by a source-scan ratchet.
7. ~~**SEC-007** — security headers, CSP in report-only mode first.~~
   **Done 2026-08-10** — `frame-ancestors` and the rest shipped and verified on a
   live response; a full CSP still wants a report-only rollout.
8. ~~**SEC-008 through SEC-013** — rate limits, `.gitignore`, Sentry scrubbing,
   log PII, CI permissions and action pinning, Dependabot, onboarding phone
   validation.~~ **All done 2026-08-10.**

### Verify manually in provider dashboards

These cannot be settled from the repository. None is known to be wrong; all are
unverified.

- **Vercel:** environment-variable scoping and which are marked sensitive;
  whether HSTS is enforced at the edge; whether preview deployments are
  protected; server log retention and access.
- **Supabase:** Storage and API CORS configuration; auth settings (email OTP
  send limits, CAPTCHA, JWT expiry, refresh-token rotation); whether
  `INTASEND_WEBHOOK_SECRET` and the other server-only vars are actually set.
- **Clerk:** MFA availability and whether it is required for admin, founder and
  cofounder accounts; session lifetime and idle timeout; lockout and throttling
  on repeated OTP sends; session revocation.
- **GitHub:** whether platform secret scanning and push protection are enabled;
  the org default `GITHUB_TOKEN` permission scope that `ci.yml` inherits.
- **IntaSend:** whether the provider offers a payload signature at all — this
  determines which half of SEC-001's fix is achievable.

**Note on privileged roles.** Every role in MAANTA authenticates through the
same OTP flow. There is no step-up authentication or MFA requirement in code for
`/admin` or `/founder` beyond the role check itself. If MFA for privileged
accounts is wanted, it has to be a Clerk-side per-role requirement — the
application cannot enforce it as written.

---

## Manual verification required

Restated as a checklist, because these are the items most likely to be assumed
rather than checked:

- [ ] Vercel environment variables — scoping, sensitivity flags, preview exposure
- [ ] Vercel edge headers — is HSTS already set, before adding it in `next.config.mjs`?
- [ ] Supabase Storage CORS and bucket policy state on the live project
- [ ] Supabase Auth settings — OTP rate limits, CAPTCHA, JWT/refresh expiry
- [ ] Supabase SSR cookie flags as actually served (`Secure`, `SameSite`, `HttpOnly`)
- [ ] Clerk — MFA for privileged roles, lockout, session lifetime
- [x] ~~Apply `20260810120000_pending_topups.sql`~~ — **done 2026-08-10 15:45
      UTC**, founder-authorized, evidence under *Production deployment*.
- [ ] IntaSend — does a payload signature scheme exist?
- [ ] Is `INTASEND_WEBHOOK_SECRET` set in production? (Unset means SEC-001 is not
      currently exploitable — and that M-Pesa credits do not work.)
- [ ] GitHub — secret scanning, push protection, default token scope
- [ ] `/how-it-works` 308 measurement (open drift **D39**, unrelated to security
      but still unmeasured)

---

## Out-of-scope items

- **Production runtime testing.** No request was sent to production. Every
  behavioral claim here is derived from source, and a deployed artifact can
  differ from `main` — this repository has had that exact problem twice
  (**D37**, **D53**), which is why the deployment-alignment warning in CLAUDE.md
  exists.
- **The live database.** No connection was made. Migrations are treated as
  authoritative for DB behavior per the repository's own source-of-truth rule,
  but the migration ledger was last reconciled 2026-08-08 and, as CLAUDE.md
  says, ledger alignment is a thing to re-check rather than a settled state.
- **Penetration testing, exploitation, and load testing.** Explicitly excluded
  by the audit's safety rules. SEC-001 in particular was confirmed by reading
  the code path end to end — the handler, the RPC and the constraint — not by
  sending a webhook.
- **Legal and compliance review** (GDPR, Kenya's Data Protection Act, PCI
  scope). The legal content under `maanta-app/src/content/legal/` is DRAFT and
  not lawyer-reviewed, which is a known state, not a finding of this audit.
- **Third-party provider security posture.** Clerk, Supabase, Stripe, IntaSend,
  Resend, Sentry and PostHog are trusted as vendors here.
- **The `maanta-app/legal/` and `docs/legal/` older draft sets**, and the design
  artifacts under `maanta-app/design/`.

---

## Assumptions and blind spots

Stated plainly, because an audit that hides its limits is worth less than one
that names them.

1. **Static analysis only.** Nothing here was proven by execution. Three of the
   four repo check commands could not run.
2. **Server-to-client prop drilling was not exhaustively traced.** Privileged
   env vars were confirmed absent from `'use client'` files by direct read, but
   a server component passing a secret *as a prop* into a client component would
   serialize it into the RSC payload without any `process.env` reference in the
   client file. No evidence of this was found; it was not exhaustively searched.
3. **Migrations are assumed to reflect the live database.** Verified only as of
   the 2026-08-08 reconciliation recorded in CLAUDE.md, not re-verified here.
4. **The `next` advisory count is not an applicability count.** 21 advisories
   match the installed version range; how many are reachable in MAANTA's
   configuration was not determined, and determining it is remediation step one.
5. **IntaSend's actual webhook contract is unknown.** SEC-001 describes what the
   *code* does. Whether IntaSend offers something better is a provider question.
6. **Rate limits were read, not measured.** The limiter is DB-backed and
   correct by inspection; its behavior under real concurrency was not tested.
7. **No historical secret scan beyond bounded probes.** A handful of targeted
   `git log -S` probes ran, not a full-history scanner such as gitleaks or
   trufflehog across all 87+ commits. Running one is cheap and worth doing.
8. **Client-side bundles were not inspected as built artifacts** — there is no
   `.next/` build in this environment, so the "no privileged key reaches the
   browser" conclusion rests on source-level tracing. This is the same
   source-versus-built-output gap that produced **D41**, where a form present in
   JSX was absent from server HTML; the repository's own lesson is that source
   scanning and built-output scanning are different checks.
9. **Demo mode is on and the data is seed/rehearsal.** Findings are about code
   paths, not about live user data, of which there is essentially none yet.
   That materially lowers today's real-world impact of every finding here — and
   changes the moment the pilot puts real money through it.
