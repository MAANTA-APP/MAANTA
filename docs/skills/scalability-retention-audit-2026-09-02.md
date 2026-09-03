# Scalability and retention audit — measured against the repo (2026-09-02)

**Status:** CURRENT · **Owner:** eng · **Class:** INTERNAL
**Mode:** Node 0 Field Validation. Reviewer session — nothing here is authorised
to build.
**Method:** every finding below was read out of `maanta-app/` and cites a
`path:line` or a migration. Where a claim needs a measurement this session could
not take, it says so instead of asserting.

---

## 0. The finding that outranks the brief

The audit brief asks about behaviour at high concurrent load. MAANTA has **zero
genuine merchants and zero genuine external redemptions**. Almost every classic
scale intervention — pooling, Redis, read replicas, edge caching — is premature
by one to two orders of magnitude, and building them now spends the only scarce
resource the company has.

Two findings are exceptions, because they are **wrong at N = 1**, not at N =
10,000. Both bite the first real shopper at BBS Mall:

1. **The service worker cannot serve anything offline.** `public/sw.js` is 38
   lines: a `push` handler and a `notificationclick` handler. There is **no
   `fetch` handler, no precache, no runtime cache, no offline fallback**.
   Meanwhile `/my-deals` — the screen holding the 6-digit code — is
   `force-dynamic` (`(shopper)/my-deals/page.tsx:31`), as is `/deals/[id]`. So
   **displaying a claimed code requires a live network round trip**, inside a
   concrete-and-steel mall, on congested wifi, at the counter, with a queue
   behind. If the network drops at that moment the shopper has no code and the
   product's entire promise fails at its only moment of truth.
2. **Shoppers are asked for push permission that nothing will ever use.** The
   feed shows a sheet reading *"Don't miss flash deals — Turn on notifications
   for new deals near you"* (`(shopper)/feed/notification-opt-in.tsx:65-69`),
   and it does subscribe (`pushManager.subscribe`). But the **only** push sender
   is `notifyMerchant` (`src/lib/notify-merchant.ts`), whose five call sites are
   all Stripe and IntaSend payment webhooks going to **merchants**. No code path
   sends a shopper a push, ever. Browser push permission is close to one-shot —
   a denial is sticky and expensive to recover — so this spends the grant before
   there is any payload, on the exact cohort Node 0 is measuring.

Recorded as **D235** and **D234**. **D234 was fixed on 2026-09-03.** **D235's
implementation shipped the same day and the row is still open** — the worker is
proven, the real page is not; see the addenda at the end. Everything below
section 2 is genuine but sequenced behind field evidence.

---

## 1. Scalability matrix

| Layer | Finding | Evidence | Severity now / at 10k |
|---|---|---|---|
| Client | Service worker has no `fetch` handler; no offline shell, no cached ticket | `public/sw.js` (38 lines) | **High now** / High |
| Client | Polling, not Realtime: counter queue 8s, QR membership 15s, shopper clock 30s | `lib/queue.ts:19`, `qr/[token]/qr-check-in.tsx:41`, `lib/use-shopper-clock.tsx:26` | Low now / **Medium** (Vercel invocations, not DB) |
| Edge | 71 routes are `force-dynamic`; marketing is prerendered (119 static pages at build) | `grep -rl force-dynamic src/app` | Low / Medium |
| API | Feed reads are cached correctly: `unstable_cache` 30s per node, demo-mode in the cache key, tag-invalidated, with a signed bypass cookie for polling reads | `lib/data.ts:483-513` | **Sound — do not change** |
| DB | 99 policy clauses call `current_user_role()` **unwrapped**; the function is `STABLE SECURITY DEFINER` doing a `users` lookup | 51 policies across `supabase/migrations/` | Low / **High — measure first** |
| DB | PostgREST's implicit 1000-row cap silently truncates client-side aggregation. Already caused one under-count | `lib/data.ts:520-526` comment | Low / **High** |
| DB | Indexing is unusually good for this stage: 63 indexes, including the composites the hot paths need | `idx_deals_node_active(node, is_active, expires_at)`, `idx_redemptions_deal`, `idx_redemptions_merchant_status` | **Sound** |
| Infra | Service client is a per-isolate singleton | `lib/supabase/service.ts:7-27` | **Sound** |

### Two corrections to the brief's own assumptions

**Connection pooling is not the lever here.** The brief asks for a
PgBouncer/Supavisor recommendation. This app never opens a Postgres connection:
it speaks PostgREST over HTTPS through `@supabase/supabase-js`, and PostgREST
owns the pool. The singleton in `service.ts` reuses one HTTP client per warm
isolate. Supavisor becomes relevant only if a worker, a cron job, or an
analytics process ever connects with a `postgres://` URL — none exists today.
Adding a pooler now would be configuration with no traffic behind it.

**RLS is not on the shopper hot path at all.** `getLiveDeals` runs through
`createServiceClient()`, which bypasses RLS, and **D147** revoked
`anon`/`authenticated` SELECT on `merchants` and `deals` outright. So the feed —
the highest-frequency read in the product — never evaluates a policy. RLS cost
lands on the tables an authenticated client still reads directly (`redemptions`,
`merchant_favourites`, `merchant_staff`, `users`). That materially narrows the
RLS question, and it is why the item below is "measure", not "fix".

---

## 2. Database and RLS playbook

### 2.1 The one RLS change worth making, after measuring it

`current_user_role()` is:

```sql
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT role FROM public.users WHERE auth_uid = auth.uid() LIMIT 1; $$;
```

It appears in **99 policy clauses**, always bare — never as
`(select public.current_user_role())`. Postgres may or may not hoist a `STABLE`
SQL function out of an RLS predicate into a one-shot InitPlan; when it does not,
the function runs **per row scanned**, and each run is an index probe on
`users.auth_uid`. The documented Supabase remedy is to wrap the call in a
scalar subquery, which forces the InitPlan.

**Do not apply this blind.** The honest next step is a measurement this session
could not take:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.redemptions WHERE user_id = '<a real user>';
-- Read `Filter` / `Rows Removed by Filter` and the loop count on the
-- users lookup. If the function shows once, nothing needs changing.
```

If it re-evaluates, the change is mechanical and behaviour-preserving:
`USING (public.current_user_role() = 'admin')` becomes
`USING ((select public.current_user_role()) = 'admin')`. It is one migration,
touching predicates only, and every existing policy test should pass unchanged —
which is exactly what makes it safe, and also why it must be justified by a plan
rather than by reputation.

Second, cheaper measurement worth running at the same time: `pg_stat_statements`
ordered by `total_exec_time`, which will name the real hot statements rather
than the ones an audit guesses at.

### 2.2 The 1000-row trap is a class, not an incident

`lib/data.ts` already carries the scar:

> "SQL GROUP BY via RPC — never pull raw redemption rows (PostgREST silently
> caps at 1000 rows, which under-counts verified badges and feed ranking)."

That fix was applied to `verified_counts_by_merchant`. The **pattern** —
`select()` a set of rows and aggregate in TypeScript — still exists elsewhere,
including the merchant deals page grouping redemptions by `deal_id`
(`merchant/(app)/deals/page.tsx`) and the notifications inbox
(`(shopper)/notifications/page.tsx`). At Node 0 volumes both are correct. Each
becomes a silent under-count somewhere past 1000 rows, and the failure is
invisible: no error, just a number that is quietly too low.

**Rule to adopt:** any count that a user or a merchant will act on is computed by
SQL aggregation in an RPC, never by counting a PostgREST result array. When
**D231** builds the deal-level aggregation, it must be an RPC for this reason,
not only for the RLS reason.

### 2.3 Indexing — leave it alone

63 indexes, and the composites match the real access patterns:
`idx_deals_node_active(node, is_active, expires_at)` covers the three-bucket feed
query; `idx_redemptions_merchant_status` covers the merchant dashboard;
partial `WHERE is_demo` indexes keep the demo rows cheap to segregate. The gap
worth adding is the one **D231** needs: an index supporting aggregation by
`deal_id` filtered to successful redemptions. Nothing else in this audit
justifies a new index.

### 2.4 Caching

The feed's caching is the strongest piece of infrastructure in the app and
should be treated as a pattern to copy, not revisit: 30-second
`unstable_cache` per node, **demo mode resolved outside the cached function so
it forms part of the key** rather than being baked into a stale entry, tag-based
invalidation, and a short-lived server-issued cookie that lets a polling refresh
bypass the cache while ordinary navigation still hits it.

Redis / Vercel KV is not warranted. The 30s window already collapses N concurrent
feed loads per node into one database read; adding a second cache tier would add
a coherence problem without removing a measured cost.

---

## 3. Retention roadmap

### What exists

| Mechanic | State |
|---|---|
| Browse without sign-in | **Live** — `/feed` is public; login is required only to claim. This is the right gate placement and the strongest TTV asset the product has |
| Favourites | **Live** — shops tab under My deals (ruled 2026-08-09, D79) |
| Notifications inbox | **Live**, but derived: it queries `redemptions`, `merchant_favourites` and `deals` at render (`(shopper)/notifications/page.tsx`). It is a computed view, not a delivery channel |
| Shopper push | **Subscribed, never sent** — see D234 |
| MAANTA Points / Fast Visit | **Built, flag OFF**, blocked by D233 (no staff exclusion, no issuance cap) |
| Deal categories | **Live** since 2026-08-18, but no live deal carries one (D122) |
| Server analytics | 11 events (`lib/analytics.ts`) — claim, view, publish, onboard, top-up, arrival, queue join, reward |

### The loop, stated honestly

MAANTA's trigger is **physical**: a shopper is already in or near the mall. That
is unusual and it is a strength — the product does not have to manufacture a
reason to open the app, it has to be present when a reason already exists. The
Hook model maps cleanly:

- **Trigger** — proximity plus a favourited shop posting a deal. *Not built:*
  the notification is D232 and cannot be sent at all until D234 is fixed.
- **Action** — claim. **Live, and fast.** No sign-in to browse is the single
  best retention decision already made.
- **Variable reward** — Fast Visit points. **Built, dark, blocked.**
- **Investment** — favourites, and the verified-redemption history that makes the
  next feed better. **Partly live.**

Three of four links exist. The chain is broken at the trigger, and the reward is
switched off. That is the accurate retention picture, and it is why "add streaks
and a personalised dashboard" would be the wrong next move: the loop does not
need more mechanics, it needs its two broken links repaired — and neither repair
is authorised until field evidence justifies it.

### Quick wins — low effort, high impact

1. **Stop asking for push permission until something sends push** (D234). One
   conditional. It protects a one-shot grant that is currently being spent for
   nothing.
2. **Cache the claimed-code screen offline** (D235). A `fetch` handler with a
   stale-while-revalidate shell and the current ticket cached in IndexedDB. The
   code, merchant name, YOU PAY and expiry are all already-persisted facts — the
   screen does not need the network to be *correct*, only to be *fresh*. This is
   the highest-value engineering item in this document.
3. **Instrument the funnel** (D230). Claim → arrival → verification exists in the
   database but is not a queryable funnel in PostHog. Without it, retention
   questions get answered by opinion.

### Strategic initiatives — sequence, do not parallelise

4. **D231** deal-level verified counts, as an RPC (see 2.2).
5. **D232** favourite-merchant notification → merchant storefront. Depends on 1.
6. **D233** Fast Visit exclusion and issuance cap, then enable the flag. This is
   the variable-reward link, and it must not be switched on before the exclusion
   exists.
7. **Offline claim queue** — only if field evidence shows counter connectivity
   failing. A claim needs the server (it decrements a cap and mints an OTP), so
   this is genuinely hard and must not be attempted on speculation.

---

## 4. KPIs

### System

| Metric | Where from | Threshold to care |
|---|---|---|
| p95 server response, `/feed` and `/my-deals` | Vercel analytics | > 1.5s on 3G-class connections |
| Feed cache hit ratio | Ratio of `getLiveDealsUncached` calls to feed renders | < 90% means the 30s window is not collapsing load |
| Slowest statements | `pg_stat_statements` by `total_exec_time` | Any statement whose share grows with table size |
| RLS re-evaluation | `EXPLAIN (ANALYZE)` loop counts on policy predicates | Function evaluated per row → apply 2.1 |
| Rows returned at exactly 1000 | Any PostgREST array read | Ever — it means truncation |
| Vercel function invocations | Vercel dashboard | Poll-driven growth outpacing user growth |

### Retention — with a Node 0 warning

Standard D1/D7/D30, DAU/MAU and churn are the right long-run metrics and are
**uninterpretable today**. Cohort one is recruited by construction, so no
retention number from it is evidence of demand — that is the founder's own
written negative in `docs/ops/node0-evidence-protocol-2026-08-24.md`. Publishing
a D7 figure from a pushed cohort would be the retention equivalent of counting
the internal E2E redemption as market evidence (**D174**).

What is worth counting now, per the evidence protocol:

| Metric | Why |
|---|---|
| Claim → verified redemption rate | The tripwire. Under roughly 1 in 3 stops the ladder for a diagnosis |
| Time from claim to verification | Whether the deal was useful *in the moment* |
| Rejected / expired code rate | Expiry, eligibility, connectivity or staff training |
| Merchant repeat-deal rate | The only unprompted merchant signal that matters |
| Unprompted claims | The pull question, and it must come from the day sheet's prompted/organic column, not from a database count |

Every one of those must be counted by **joining through the parent** —
`redemptions → merchants → deals`, all three `NOT is_demo` — because
`redemptions.is_demo` is never set by `claim_deal` and is not a discriminator
(**D188**).

---

## 5. What this session changed

Nothing in `maanta-app/`. This document, drift rows **D234** and **D235**, and a
documentation-register entry. The two quick wins above are the only items that
would be worth putting to the founder for authorisation before field validation
completes; the rest is sequenced behind it deliberately.


---

## 6. Addendum — D234 fixed (2026-09-03)

The push prompt is now gated on `SHOPPER_PUSH_SENDER_EXISTS`
(`src/lib/shopper-push.ts`), which is `false` because nothing outside
`notify-merchant.ts` sends a push. The gate is checked on **both** the effect
and the render in `notification-opt-in.tsx`: the render guard alone would leave
the effect scheduling a sheet that never paints, the effect guard alone would
let a later edit open it, and neither can sit above the hooks.

**The subscribe machinery is kept, not deleted.** `/api/push/subscribe` writes
`users.push_subscription`, which `notify-merchant` already reads — so the D232
sender inherits working plumbing rather than rebuilding it. Only the *asking* is
held.

The guard (`src/lib/__tests__/shopper-push-gate.test.ts`) asserts a
**relationship rather than a value**, which is what stops it from decaying into
a comment. The flag may be `true` only when some module outside `lib/webpush.ts`
and `lib/notify-merchant.ts` calls `sendPushNotification` — and it *must* be
`true` once one does. It therefore fails in four directions: flipping the flag
early, shipping a sender without flipping it, removing either gate, and
requesting permission from any other surface. It also fails if the subscribe
path is deleted rather than gated. Each failure mode was verified by inducing
it.

Quick win 1 of section 3 is done. **Quick win 2 (D235, the offline code screen)
is now the highest-value engineering item in this document**, and remains
unauthorised.

---

## 7. Addendum — D235 implementation shipped; the row is NOT closed (2026-09-03)

The claimed-code screen now works without a network.

### What the worker does

| Request | Strategy | Why |
|---|---|---|
| `/my-deals` navigation | Network first, cache fallback, then `/offline` | Fresh whenever it can be; present when it cannot. Cache-first would show a stale ticket to a shopper who *has* signal — worse than before |
| `/_next/static/*` | Cache first | Hashed and immutable. The biggest latency win on mall wifi |
| Any other navigation | Network, then `/offline` | A cached feed would advertise deals that may be gone — the promise D92 removed from the offline banner |
| `/api/*`, any non-GET, cross-origin | Not intercepted | A stale wallet balance or queue position is worse than an error, and no claim or redemption may ever be intercepted |

### The prerequisite nobody had noticed

The worker was registered in exactly two places: `/download`'s install panel — a
marketing route most shoppers never open — and the push opt-in sheet, which
**D234 had just gated off the day before**. So in the common case a shopper had
no service worker at all, and any cache strategy would have been dead code.
`ServiceWorkerRegistrar` now registers it on the shopper shell. Fixing D234
first made this visible; it would otherwise have shipped as an offline feature
that silently never armed.

### Honesty and privacy

`TicketOfflineNotice` marks the screen as a saved copy when offline, because a
cached page passing as a live one is its own defect. Two things already stop a
stale ticket being dangerous: the row derives its state from a live clock
(D213), so an expired ticket reads EXPIRED even from cache, and staff
verification is authoritative, so a stale code is refused rather than honoured.

The `states.tsx` docblock asserted "MAANTA has **no offline capability**". That
was true until this change and is now false, so it was rewritten — a docblock
contradicting the worker is how the next author reintroduces the gap believing
it is still true. Everything the old wording forbade is still forbidden: deals
are not saved, and claiming and redeeming still cannot happen offline.

The cached document holds someone's codes, and **Cache Storage is scoped to the
origin, not the signed-in user**. Sign-out therefore purges it, in **both** auth
branches — purging in only one would make the protection depend on which auth
mode happens to be running. The page and the worker agree on the
`maanta-pages-` *prefix* rather than an exact name, so the worker can bump its
cache version without orphaning the purge.

### How far the verification actually goes

Two suites, 21 tests. `offline-code-screen.test.ts` asserts the strategy is
written; `service-worker-behaviour.test.ts` **executes** `sw.js` in a fake
worker global with a fake Cache Storage and a switchable network, and proves the
cached code page is served with the network down, that the live page still wins
when it is up, that nothing under `/api/` is intercepted, and that sign-out's
purge really empties the cache. Three regressions were induced to confirm the
guards bite: caching the feed, dropping the `/api/` passthrough, and removing
the cache fallback.

**Browser proof added the same day.** `e2e-sw/service-worker-offline.spec.ts`
runs the shipped `public/sw.js` in real Chromium — real worker lifecycle, real
navigation, real Cache Storage, real offline condition — against a
credential-free static harness. Five tests, all passing, and each confirmed to
bite by inducing the regression it guards. It is a separate config from the
golden path (which self-skips without a deployed app), so it never skips and
cannot be mistaken for golden-path coverage. See
`docs/ops/e2e-golden-path.md`.

### The row is open, and the closing condition is fixed

**D235 was closed on 2026-09-03 and reopened the same day.** Closing it on the
worker suites was the wrong call, and the founder rejected it. The condition,
as set:

> Against a real deployed Next.js build, an authenticated shopper session and a
> genuine established claim, `/my-deals` must render enough persisted ticket
> information after connectivity loss to allow the shopper to present the
> six-digit code at the counter.

Nothing short of that closes it. Two risks make the distinction real rather than
procedural, and neither is visible to a harness that never authenticates:

1. **Hydration.** The cached document is a Next.js SSR payload. If anything the
   ticket row needs is filled in by a client fetch rather than carried in the
   HTML, the offline reload renders an empty row while every existing suite
   stays green.
2. **The redirect.** `/my-deals` redirects to `/login?next=/my-deals` when
   `getAppUser()` returns null. If a redirect response is ever what lands in the
   cache, the shopper reloads at the till into a login page instead of their
   code — worse than having no cache at all.

`e2e/offline-ticket.spec.ts` is written and committed. It self-skips without
`E2E_BASE_URL` and `E2E_SHOPPER_STORAGE`, and — deliberately — **fails rather
than skips** if the credentials are present but the account holds no active
claim, because a silent pass on an empty account is the one way this proof could
be faked.

Until it runs green, the three claims named by the **D235 claim discipline**
(`src/lib/__tests__/d235-claim-discipline.test.ts`, the sole verbatim home for
those strings) may not appear in any document or surface. The ban reads the
register, so it lifts by itself when the row is genuinely closed; and closing
the row requires its evidence to name the spec and the authenticated session,
so a one-word status flip fails.

The correct claim today: **the worker is browser-proven; the page is not.**

**Known limit, by design:** only navigation requests are served from cache. An
in-app tab switch while already offline can still fail; a reload recovers it.
Caching RSC payloads by URL would risk serving one that does not match the
running build.

Both quick wins from section 3 are now done. The remaining items — D229, D230,
D231, D232, D233 — stay sequenced behind field validation.
