# Scaling, cost and security audit — 2026-08-01

Session type: **Reviewer**. Scope: what MAANTA looks like at many nodes and many
merchants — API/compute cost, cost pass-through, maintenance load — plus a
security pass over the codebase (injection, secrets, authz, money path).

Drift found is recorded first, as rows **D56–D64** in
`docs/maanta-drift-register.md`. This document is the reasoning; the register is
the state. Close items by D-number, not by re-describing them here.

Related, and deliberately not duplicated:

| Doc | Covers |
|---|---|
| `docs/system-design-pre10k.md` | Pre-10k architecture baseline |
| `docs/maanta-staged-readiness-now-launch-10k-100k.md` | What must be true at each stage, testing-first |
| `docs/ops/tech-stack-deep-dive-2026-07.md` | Keep-vs-change decisions to ~100k |
| `docs/skills/money-trust-engineering-guardrails.md` | Checklist for money/price/role diffs |

## 0. Method, and what was actually verified

Everything below was read in this repo at commit `225db23` on branch
`claude/scaling-costs-security-audit-vfcp97`. Where a claim is measured rather
than reasoned, it says so.

Baseline established before any analysis: `npm run typecheck` clean,
`npm test` **525 passed / 69 files**. No code was changed in this session.

Two findings were proven by execution rather than by reading:

- **The `.or()` injection (D57)** — reproduced by building the exact query with
  the repo's own `@supabase/supabase-js` and printing the emitted URL. The
  hostile input lands as an extra top-level disjunct. The same run confirmed
  `.ilike()` is **not** injectable, which is why `/search` is safe and
  `/admin/customers` is not.
- **Secret hygiene** — the full git history was scanned for live credential
  shapes (`sk_live`, `whsec_`, `eyJhbGciOiJIUzI1NiIs`, `re_`, `ISSecretKey_`,
  `AIza`). Every hit is a placeholder, a test fixture or documentation. No
  secret has ever been committed. `.env.example` carries names and comments
  only.

### What is genuinely strong

Worth stating plainly, because the findings below are easier to act on when the
baseline is understood as good:

- **The money path is enforced in Postgres, not in the app.** `claim_deal` and
  `verify_redemption` are `SECURITY DEFINER` with `search_path` pinned, `REVOKE
  ALL … FROM PUBLIC, anon`, and a caller-identity check that refuses a
  `p_user_id` that is not the authenticated caller.
- **Ledger idempotency is a real database constraint**, not a read-then-write
  check. `record_merchant_ledger_entry` does the uniqueness check, the balance
  update and the insert in one transaction. The comment in
  `src/lib/merchant-ledger.ts` records that the previous version had both a
  TOCTOU race and a lost-update race — this is a fix that was reasoned about.
- **The Stripe refund/dispute handlers guard against double-debiting** in both
  directions (refund-after-hold, hold-after-refund), keyed off the payment
  intent rather than the charge or dispute id.
- **Write grants are revoked on the money tables** for `authenticated`, so a
  stolen merchant JWT cannot `PATCH` `account_balance` or set a redemption to
  `success` through PostgREST. 37 RLS policies across 24 tables.
- **Every privileged page carries its own guard.** All pages under `admin/`,
  `agent/` and `founder/` were enumerated and each calls a guard; merchant app
  pages are covered by `merchant/(app)/layout.tsx`. Nothing is protected by
  middleware alone — see §5.2 for why that is worth keeping an eye on anyway.
- **`app_config` is the single source for the fee**, and `check-tokens`,
  `check-canonicals`, `check-server-forms` and the copy guards make several
  classes of drift fail the build rather than ship.

The security posture here is well above what a pre-launch pilot usually carries.
The findings below are concentrated in three places: the **read** path, where
`service_role` is used far more widely than the code claims; the **IntaSend**
rail, which is not live yet; and **response hardening**, which was never done.

---

## 1. The short answer

**API cost is not your problem, and it is not close.** Measured against the
frozen KES 30 success fee, marginal infrastructure cost per verified redemption
is roughly **KES 0.15 — about 0.5% of the fee** (working in §4.1). You would
have to be wrong by two orders of magnitude before compute threatened the unit
economics. There is no LLM or AI inference anywhere in this stack, which is the
usual reason "API costs" become existential; MAANTA's external calls are auth,
analytics, error reporting, FX and payments, and all of them are cheap per
transaction.

**Three things do scale badly, and none of them is compute:**

1. **Per-MAU auth pricing.** Clerk bills per retained user; MAANTA earns per
   *redemption*. Those diverge as soon as browsing outgrows claiming. It is
   currently well-aligned — see §4.2, and the reason is a good architectural
   accident you should protect.
2. **Adding a mall is a code change.** `NODES` is a hardcoded TypeScript array
   and the join key is the mall's display name (**D60**). This is the single
   most expensive thing to fix late and the cheapest to fix now.
3. **Merchant approval is a human in a loop**, one per merchant. At 600
   merchants that is the binding constraint on growth, not any API (§5.1).

**You cannot pass costs to consumers**, and the reason is structural rather
than a pricing decision — §4.5.

---

## 2. What breaks as nodes and vendors multiply

Ordered by when it bites, not by severity.

### 2.1 Nodes are code, and the key is a display label (D60)

`src/lib/nodes.ts` is a hardcoded `as const` array of five malls, holding each
one's label, coordinates, what3words address and a `live` flag. Opening a mall
is a PR and a redeploy.

The sharper problem is the join key. `NODES[].id` is the string `"BBS Mall"`,
and `deals.node` / `merchants.node` are **free-text columns holding that same
display string**. There is no `nodes` table and no foreign key. So:

- Renaming a mall for display silently orphans every deal, merchant and cached
  entry keyed on the old label. Nothing in the schema catches it.
- Node-scoped caching (`unstable_cache` keyed `["live-deals", node, mode]`),
  the node cookie, and every node-scoped report all key on the same string.
- Per-node reporting cannot be joined to anything the nodes table would carry —
  operator contact, revenue share, launch date, contract terms — because there
  is nowhere to put it.

`docs/system-design-pre10k.md` currently lists this under mitigations as "`node`
column on deals/merchants **ready**". The column exists; "ready" overstates it,
which is why this is a register row and not just a recommendation.

**Do this before the second mall goes live.** At one node it is a contained
migration over a known row set. At ten it is a data-repair project with live
money attached, and the mall names will by then be printed on signage.

### 2.2 Read scaling is fine; the shape of it is the risk

Hot reads are already thought through. `getLiveDeals` runs three bucket queries
(so a flood of standard deals cannot starve the flash and boosted rails), wraps
them in a 30-second `unstable_cache` keyed per node **and** per demo-mode, and
resolves the demo flag outside the cache boundary so a toggle is not baked in
for 30 seconds. `getVerifiedCounts` uses a GROUP BY RPC specifically to avoid
PostgREST's silent 1000-row cap.

That is the right design and it extends to many nodes without change, because
the cache key already includes the node.

Two things do not extend:

- **59 of 82 pages are `force-dynamic`.** Every app page view is a server
  render and a function invocation, with no CDN caching. That is correct for
  authenticated money surfaces and wasteful for the shopper discovery surfaces,
  which is where volume actually grows. This is the main lever on the cost curve
  in §4.3 — not because it is expensive today, but because it is the line that
  scales with *browsing* rather than with revenue.
- **Uncached per-request config reads.** `isDemoModeEnabled()` is one indexed
  single-row read per request, deliberately uncached — and the docblock's
  reasoning for that is sound (a cached value could keep serving synthetic data
  after demo mode is switched off). Worth revisiting **only once demo mode is
  off for good**, at which point the read is pure overhead on every request.
  `getSuccessFee()` and `getBoostFee()` have no such constraint and are read
  uncached on every merchant page render.

### 2.3 Queries that silently truncate as data grows (D61)

`admin/deals/page.tsx` selects `fraud_events` with no `limit()` and no ordering.
PostgREST caps that at 1000 rows and says nothing, so past 1000 unresolved fraud
events the flagged-merchant list becomes an arbitrary subset — rendered with no
indication that it is incomplete, and the rows that go missing are exactly the
ones nobody is reviewing.

This repo already knows the trap: `getVerifiedCounts` carries a comment about
this exact cap and uses an RPC to avoid it. The reasoning simply was not applied
here. Unresolved fraud events accumulate platform-wide, not per node, so this
arrives sooner than the node count suggests.

The `merchant/(app)/layout.tsx` shell has a milder version — it selects every
deal row a merchant has ever created (`expires_at, is_active`, no limit) on
**every merchant page render**, to compute banner state.

**General rule worth writing down once:** an unbounded PostgREST select is a
silent-correctness bug on any table that grows. Bound it or aggregate it in SQL.

### 2.4 Rate limiting is a database write

`checkRateLimit` is a `SECURITY DEFINER` RPC doing `SELECT … FOR UPDATE` then an
upsert against `api_rate_limit_buckets`. Correct, and it serialises on the bucket
row.

Two consequences at volume. The OTP bucket is keyed `otp-check:${merchant.id}`,
shared across all of a shop's staff — so at a busy counter with several devices,
20 attempts/minute is a shared ceiling and one careless staff member can lock out
the till. And every rate-limited request costs a round trip and a row lock before
any real work happens. Neither matters at Node 0. Both are worth revisiting when
a single merchant runs multiple tills, which is a Node 1 problem, not a Node 10
one.

---

## 3. Security findings

Severity is stated as exploitability **today**, with the trajectory noted where
it changes.

### 3.1 `service_role` is the default read path, and the code says otherwise — D56, Medium

`src/lib/supabase/service.ts` states in its header: *"Use only for privileged
ops: redemption verification, IntaSend webhook, web-push dispatch, trial
management. **RLS is the real backstop everywhere else.**"*

It is imported by **72 non-test modules** — every shopper page, every admin page,
the agent surfaces, the merchant layout, and `ensureAppUser` itself, so the
identity lookup that decides who you are already runs with RLS bypassed. The
`20260723120000` migration concedes the same thing in its own comment ("the app
currently reads via service_role") while the module docblock still names RLS as
the backstop.

**This is not a live vulnerability.** Every privileged page and route was checked
and all of them carry a guard; merchant-scoped API routes correctly filter by
`merchant_id`. The 37 RLS policies are real and correct — they are simply not in
the request path for reads.

What it changes is the **failure mode**. With RLS in the path, a forgotten
`.eq()` yields an empty result. With `service_role`, it yields the whole table.
And because a new page is written by copying a neighbouring one, every new
surface inherits an RLS-bypassing client by default. That is a bad default to
carry into a phase where the number of surfaces and the number of contributors
both go up.

The revoke migration deliberately preserved `GRANT SELECT` to `authenticated`
"so RLS-governed PostgREST reads remain possible" — the door was left open on
purpose. Moving shopper reads through it is much cheaper now than at 20 nodes.

### 3.2 PostgREST filter injection in admin customer search — D57, Medium

`src/app/admin/customers/page.tsx:41`:

```ts
if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
```

`.or()` takes the PostgREST filter **DSL**, not a bound value. A comma in `q`
terminates the intended predicate and begins a new one. Reproduced with the
repo's own client — input `x%,role.eq.admin,full_name.ilike.%y` emits:

```
or=(full_name.ilike.%x%,role.eq.admin,full_name.ilike.%y%,email.ilike.…)
```

An attacker-chosen disjunct now sits at the top level of a query that runs with
`service_role` against `public.users` — every account's name, email and phone.

The same test run confirmed the neighbouring `.ilike()` calls are **safe**:
supabase-js binds those as values and percent-encodes the comma to `%2C`. So
`/search`, `/admin/merchants` and `/admin/billing` are not affected. `.or()` is
the only injectable construction in the codebase.

Impact today is bounded — the page is admin-gated and an admin can already read
that table. But it is a `GET`, so a crafted `/admin/customers?q=…` link is enough
to run it as the founder, and it is one copy-paste from a shopper-facing search
that sits one directory over. **Fix the construction, not just this call site**,
and guard against interpolated template literals reaching `.or()`.

### 3.3 IntaSend top-up credit is forgeable with a single secret — D58, High (rail not yet live)

`verifyWebhookChallenge` is the whole of the authentication:

```ts
return Boolean(secret) && challenge === secret;
```

A plaintext bearer token in the request body, compared non-constant-time, with
**no signature over the payload**. The route then trusts that body for both the
amount and the beneficiary — it parses the merchant UUID out of the
attacker-supplied `api_ref` and the amount out of `payload.value`, and credits
real spendable balance up to `MAX_TOPUP_AMOUNT`, which is **KES 1,000,000
(≈ $7,750) per request**. Nothing is read back from IntaSend to confirm the
invoice exists, settled, or was for that sum.

So a leaked `INTASEND_WEBHOOK_SECRET` is not one fraudulent transaction — it is
unlimited wallet balance for any merchant, and therefore unlimited free success
fees. The contrast is in the same directory: the Stripe route verifies an HMAC
over the raw body, so a leaked Stripe secret still cannot forge an amount.

The shared-secret challenge is **IntaSend's own protocol** and is not a MAANTA
mistake. Treating it as sufficient authorisation for a balance change is the gap.

**The fix is not to invent a signature IntaSend does not send** — it is to make
the webhook a *notification* rather than an *instruction*. On receipt, re-fetch
the invoice from the IntaSend API by `invoice_id` and credit only what that
response reports as settled, for the merchant its own `api_ref` names. That
reduces a leaked secret to a nuisance.

M-Pesa is not live (tracker E6), so this is entirely fixable before it can ever
be exploited. It should block that gate.

### 3.4 Redemption codes come from a non-cryptographic PRNG — D64, Low

`claim_deal` generates the code with
`LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0')`. `RANDOM()` is PostgreSQL's
per-backend PRNG — seeded per session, reproducible stream, not a CSPRNG. This is
the token that authorises a KES 30 debit at a counter, so it is the one value in
the schema that should come from a cryptographic source. `FLOOR(RANDOM() * 10^6)`
also carries a small modulo skew.

Containment is good, which is why this is Low and not Medium:
`uq_redemptions_pending_otp_per_merchant` scopes uniqueness to pending codes per
merchant, the insert retries five times on collision, and OTP rate limiting caps
a merchant at 20 attempts/minute against a 10^6 space — brute force is not
practical. This is a weak primitive under solid containment.

`pgcrypto` is already available; switch to `gen_random_bytes` in whichever
migration next touches `claim_deal`, and assert the source in the SQL suite so it
cannot regress.

### 3.5 No response security headers at all — D62, Medium

`next.config.mjs` declares `redirects()` and `rewrites()` and no `headers()`.
Nothing else sets them. So MAANTA ships no CSP, no HSTS, no `X-Frame-Options` /
`frame-ancestors`, no `nosniff`, no `Referrer-Policy`, no `Permissions-Policy`.
Neither Next.js nor Vercel adds these by default — the absence is the shipped
state, not a platform default someone is relying on.

The frame protection is the one that bites first and it is specific:
`/merchant/redeem` is a money surface operated on a phone at a counter, and with
no `frame-ancestors` it can be iframed by any origin. `Referrer-Policy` matters
for a second, already-demonstrated reason — the onboarding code comments record
that a phone number in a URL leaked through `Referer`, fixed by moving the value
rather than by constraining the header, so the same class of leak remains open
from any other route.

Four of the six are safe to set today with no per-page work:
`frame-ancestors 'none'`, `nosniff`, `strict-origin-when-cross-origin`, HSTS.
CSP needs care — Clerk, Sentry, PostHog and the Leaflet tile host are all
third-party origins — so start report-only, read the reports, then enforce.

### 3.6 Dependency advisories — Medium, and it is a real maintenance decision

`npm audit` reports 11 vulnerabilities (1 critical, 7 high). Split by what
actually ships:

- **Production**: `next@14.2.35` carries 7 high advisories — SSRF via rewrites,
  cache poisoning of RSC responses, cache confusion on requests with bodies,
  unauthenticated disclosure of internal Server Function endpoints, and an image
  optimisation DoS, plus a transitive `postcss`. The remediation npm offers is
  `next@16.2.12`, a **two-major-version bump**.
- **Dev only**: the critical is `vitest@<=3.2.5` with `vite`/`esbuild`; these are
  not in the production runtime.

Several of the Next advisories describe conditions this app does not meet — there
is no Pages-Router i18n, no custom server. The cache-poisoning and Server
Function disclosure ones are not so easily dismissed for an App Router app on
Vercel. **Do not run `npm audit fix --force`** — treat the Next 14→16 upgrade as
its own planned change with the full CI gate behind it, and do it before the
contributor count grows, not after.

### 3.7 Checked and clean

Stated so the next audit does not re-derive them:

- **SQL injection: none.** No dynamic SQL is built from user input anywhere in
  the 83 migrations. The single `EXECUTE format(...)` uses `%I` on a
  catalog-derived constraint name. All app queries go through PostgREST bound
  filters or RPC parameters — the sole exception is the `.or()` string in §3.2.
- **Secrets: clean**, in the working tree and across the full git history (§0).
- **XSS sinks: none.** No `dangerouslySetInnerHTML`, `eval`, `new Function` or
  `innerHTML` in application code.
- **Rate-limit key spoofing: not applicable on Vercel.** `/api/contact` and
  `/api/waitlist` key on the first `x-forwarded-for` entry, which is
  client-controllable on most hosts. Vercel overwrites the header and does not
  forward external values, so it holds here — but it holds because of the
  *platform*, not because of the application. Worth a comment at the call site,
  and worth re-checking if hosting ever changes. Note the opposite risk is the
  live one in Kenya: carrier-grade NAT means many real users share an IP, so an
  IP-keyed limit over-blocks before it under-blocks.
- **`/api/healthz` is well designed** — public liveness, public readiness
  booleans, and env/DB detail correctly gated behind `requireAdminApi`. Booleans
  only; no secret values.
- **OTP handling elsewhere is sound** — codes are validated `/^\d{6}$/` before
  use, redemption lookups are scoped by `merchant_id`, and the preflight oracle
  shares the verify rate-limit bucket rather than having its own.

---

## 4. What it actually costs

Vendor prices below were checked on 2026-08-01 and are the published list rates;
re-verify before budgeting, since all of these change.

### 4.1 Marginal cost per verified redemption

Anchor: **KES 30 ≈ $0.2326** at the ~129 KES/USD the repo's own FX fallback
carries.

A redemption's full request shape across both sides — conservatively ~12 app page
views (shopper feed, browse, deal detail, ticket, my-deals; merchant keypad,
preflight, verify, wallet) and ~5 API calls:

| Component | Volume | Rate | Cost |
|---|---|---|---|
| Vercel function invocations | ~17 | $0.60 / M | $0.00001 |
| Vercel edge requests | ~300 | $2.00 / M | $0.00060 |
| Vercel data transfer | ~3 MB | $0.15 / GB | $0.00045 |
| Supabase egress | ~0.5 MB | $0.09 / GB | $0.00005 |
| PostHog / Sentry events | a handful | mostly free tier | ~$0.00000 |
| **Total** | | | **≈ $0.0011** |

**≈ KES 0.15 per redemption, against a KES 30 fee — about 0.5%.**

Supabase compute is deliberately absent from that table: it is a flat monthly
add-on, not a per-query charge, so it belongs in the fixed floor below rather
than in marginal cost.

### 4.2 The line that scales with users rather than revenue

Clerk is $25/month with 10,000 users included and **$0.02 per user** beyond.
Clerk meters *retained* users — someone only counts if they return at least 24
hours after signing up — which is a narrower unit than most MAU pricing.

This is the one place where a cost curve and MAANTA's revenue curve can diverge,
because MAANTA earns per **redemption** and Clerk charges per **user**. A shopper
who browses all month and never claims earns nothing and could cost $0.02.

**Except that they do not, and this is worth protecting.** Verified: the shopper
layout carries no auth guard, `/feed` handles a null user, and sign-in is only
forced at claim (`/api/redemptions` requires `ensureAppUser`). **Anonymous
browsing works.** So Clerk's billable population is approximately *people who
claim*, which correlates with revenue rather than with traffic.

That alignment is load-bearing and is currently a property of how the pages
happen to be written, not something any test asserts. **Putting an auth wall in
front of discovery would change MAANTA's cost structure, not just its UX** —
that is the sentence to remember before anyone proposes "sign in to browse".

### 4.3 Fixed floor by stage

| | Node 0 pilot | 1 mall live | 10 malls | 100k users |
|---|---|---|---|---|
| Vercel | $0–20 | $20 | ~$140 | ~$600 |
| Supabase | $0–25 | $25 + $15 compute | $25 + $60 compute | $25 + $210 compute |
| Clerk | $0 | $0 (under 10k) | $25–225 | ~$1,825 |
| PostHog | $0 | $0 | ~$50 | ~$300 |
| Sentry | $0 | $26 | $26 | ~$80 |
| Resend | $0 | $20 | $20 | ~$50 |
| **Monthly** | **$0–45** | **~$105** | **~$550** | **~$3,100** |

Against revenue, using 600 merchants at 25 verified redemptions/month for the
10-mall column: 15,000 redemptions × KES 30 = **KES 450,000 ≈ $3,490/month**.
Infrastructure is **~15% of revenue** — healthy, and dominated by fixed
subscriptions rather than by anything per-transaction.

At the 100k-user column the shape inverts: **Clerk alone becomes ~59% of the
bill** and the single largest line item. That is the point at which the
`MAANTA_AUTH_STRATEGY=supabase` path — which **already exists, is documented in
`docs/ops/auth-strategies.md`, and is covered by tests** — stops being a
rehearsal convenience and becomes a pricing hedge, since Supabase includes 100k
MAU on Pro. It was built for a different reason and it happens to be the exit
from the steepest cost curve in the stack. Keep it working.

### 4.4 Two endpoints that turn anonymous traffic into billed events

Small in money terms, listed because they are unauthenticated and uncapped:

- **The webhook failure paths (D59).** Both payment webhooks call
  `logWebhookFailure` on branches that run *before* the caller is
  authenticated — missing signature, bad challenge. Each call writes a Postgres
  row **and** emits a billable Sentry event. Both endpoints are necessarily
  public and neither is rate-limited, while every other write endpoint in the app
  goes through `checkRateLimit` first. `payment_webhook_failures` also has no
  retention policy, unlike `demo_wipe_audit`, which got one. The intent — never
  let a missed webhook leave a balance silently wrong — is right and worth
  keeping; the defect is that the *never-authenticated* branch is the one that
  writes.
- **`/api/sentry-example-api` (D63).** An unauthenticated `GET` whose entire
  body is `throw`. With a DSN set, every request mints a billable Sentry event.
  It is the stock wizard scaffold and is deliberately kept — the readiness doc
  names hitting it as the way to prove the DSN is wired — so gate it behind the
  admin guard rather than deleting the capability, and update that doc in the
  same change.

The reason these matter is not the money. `logWebhookFailure` reports **every
payment webhook failure** into the same Sentry project, so synthetic noise
dilutes the one alert channel the money path depends on.

### 4.5 Passing cost on — the honest answer

The question assumed a lever that does not exist, and the reason is structural
rather than a pricing decision:

1. **There is no billing relationship with the shopper.** Verified in
   `src/lib/pricing.ts`: YOU PAY is the cash amount handed to the *merchant* at
   the counter. MAANTA never charges a shopper anything, and no shopper payment
   instrument is stored. There is no rail to pass a cost down. Building one
   means taking shopper-side money, which is a different regulated product in
   Kenya, not a pricing change.
2. **The only party you bill is the merchant**, and that fee is a **frozen
   business rule** — KES 30, explicitly *not* under review. Changing it needs a
   `docs/maanta-decisions-log.md` entry. Only the KES 3,500 Elite subscription
   is under review, in Feb 2027.
3. **So the available levers are the Elite price, the boost fee (KES 500/24h,
   Elite-only), and platform-side cost control.** Not a consumer surcharge.

On *"if compute is throttled"* — reframe it. Compute is not the binding
constraint at 0.5% of revenue; you would need to be 200× off before it mattered.
What actually throttles is the **Supabase compute tier**, which is a step
function you buy up ($10 → $15 → $60 → $110…), and Vercel function concurrency,
which is a dial. Both are money problems with known prices, not walls. The real
constraints on growth are in §5.

---

## 5. Maintenance as vendor count grows

### 5.1 The actual bottleneck is human, not technical

Merchant activation runs through `POST /api/admin/merchants/[id]/approve`, gated
by `requireAdminApi`. Every merchant needs an admin to approve them, and the same
route grants the Elite trial against a capped first-100 offer. Add on-ground
agent lead capture, dispute handling and fee reversals — all admin-gated,
all audit-logged — and at 600 merchants **the approval queue is the growth
constraint**, well before any API is.

That is a staffing and tooling question, and it is the one worth planning for.
The `NODE_TEAM` model already in `src/lib/marketing/facts.ts` — one node manager
and up to four agents per node — is the right frame; the software question is
what admin work can be made self-serve or agent-delegable rather than
founder-serialised.

### 5.2 Route protection is a convention, not a mechanism

`middleware.ts` runs `clerkMiddleware()` with **no route protection** — it
populates `auth()` and nothing more. Every route is public unless its own page or
handler guards it.

Every current page does. That was enumerated, not assumed, and it is a real
credit to how this has been maintained.

But it is upheld by discipline, and discipline scales worse than mechanisms do.
A new admin page that forgets `requireAdminPage()` is public and nothing fails.
Combined with §3.1 — where that page would also get an RLS-bypassing client by
default — the two compound into the highest-probability future breach in this
codebase. Neither is a bug today; both are bad defaults.

The cheap fix is a test that walks `src/app/{admin,agent,founder}/**/page.tsx`
and asserts each calls a guard, in the style `marketing-a11y.test.ts` already
uses after **D52** replaced its hand-maintained list with a directory walk. That
row's lesson applies exactly: a list only checks what someone remembered to add.

### 5.3 Surface area and the test estate

83 migrations, 82 pages, 39 API routes, 69 test files / 525 tests, five CI gates
(`lint`, `typecheck`, `test`, `build`, `db-tests`), and a build that additionally
runs three output gates.

The gap is what it has been: **no browser e2e in CI.** `e2e.yml` self-skips
without a dedicated non-prod environment, so the full claim → verify path is
proven by SQL suites and route unit tests but never end-to-end against a real
browser and a real Clerk session. `docs/maanta-staged-readiness-now-launch-10k-100k.md`
§1.1 row E is honest about this and calls a two-phone manual smoke the substitute.
That substitute does not scale past a handful of nodes.

### 5.4 Deployment provenance

Worth carrying forward rather than re-learning: production diverged from `main`
**twice on 2026-08-01** (**D37**, then **D53** by a manual dashboard promote of an
open PR branch). Both are closed, and the current deployment is verified as
serving `main`. As more people can deploy, this recurs. When auditing it, compare
**trees, not commit SHAs** — a squash merge mints a new SHA, so an ancestry check
against a promoted branch commit fails forever even when the content is identical.

---

## 6. What to do, in order

Sequenced by cost-of-delay, not by severity.

| # | Action | Why now | Row |
|---|---|---|---|
| 1 | Verify the IntaSend invoice out of band before crediting a wallet | M-Pesa is not live yet, so this is free to fix and unfixable-cheaply later | D58 |
| 2 | Promote nodes to a table with a surrogate key; migrate `deals.node` / `merchants.node` to an FK | Contained at one node, a data-repair project at ten, and mall names will be on signage | D60 |
| 3 | Fix the `.or()` construction and guard the pattern | Small, self-contained, and one copy-paste from a shopper surface | D57 |
| 4 | Add the `headers()` block — frame-ancestors, nosniff, referrer, HSTS now; CSP report-only | Four are zero-risk today; CSP gets harder with every third-party origin added | D62 |
| 5 | Rate-limit the pre-auth webhook branches; add retention on `payment_webhook_failures`; gate the Sentry example route | Protects the alert channel the money path relies on | D59, D63 |
| 6 | Add the directory-walking route-guard test | Converts a convention into a mechanism before contributor count grows | §5.2 |
| 7 | Bound the `fraud_events` select and audit for other unbounded selects | Silent wrongness, and it arrives platform-wide rather than per node | D61 |
| 8 | Decide the `service_role` posture and write down whichever answer wins | Cheap now, structural later; blocks nothing but shapes everything after it | D56 |
| 9 | Plan the Next 14 → 16 upgrade as its own change | 7 high advisories; do it before the contributor count grows, never via `--force` | §3.6 |
| 10 | Swap `RANDOM()` for `gen_random_bytes` next time a migration touches `claim_deal` | Low risk today under good containment; free to fix opportunistically | D64 |

Two things **not** on this list, deliberately:

- **Do not optimise API cost.** At 0.5% of the fee it is not worth an engineering
  hour. Revisit only if the force-dynamic page count and shopper traffic both
  grow by an order of magnitude.
- **Do not put an auth wall in front of discovery.** Anonymous browsing is what
  keeps the per-user cost curve aligned with the per-redemption revenue curve
  (§4.2). It is a cost-structure decision wearing a UX costume.

---

## 7. Open decisions for a human

1. **`service_role` posture (D56)** — correct the docblock, or move shopper
   reads onto the RLS-governed client. Founder/eng call. Everything else in this
   document is a fix; this one is a direction.
2. **Node table timing (D60)** — before mall #2, or accept a harder migration
   later. This is a scheduling decision with a sharply rising price.
3. **Next.js major upgrade (§3.6)** — when, and who owns the regression pass.
4. **Whether anonymous browsing is a stated product invariant** (§4.2) or an
   accident that is currently working. If the former, it should be written into
   the frozen rules and guarded, because its cost consequence is invisible from
   the code.

No code was changed in this session. Findings are recorded as **D56–D64**; close
them by D-number.
