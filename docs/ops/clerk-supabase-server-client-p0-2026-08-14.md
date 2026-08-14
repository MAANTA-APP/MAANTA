# P0 — Clerk server Supabase client construction — 2026-08-14

**Root-cause classification: CONFIRMED**, from production runtime logs rather
than inference.

Every Clerk-authenticated server request that built the anon Supabase client
threw while constructing it. On the claim path that meant an HTTP 500 raised
**before `claim_deal` ran** — so no ticket, no redemption and no merchant fee
were ever created. It was never a claim-specific bug: five routes build that
client, and all five failed the same way in production, including the merchant
till.

## Confirmed production error (redacted)

```
Error: @supabase/supabase-js: Supabase Client is configured with the accessToken
option, accessing supabase.auth.onAuthStateChange is not possible
    at f (/var/task/maanta-app/.next/server/app/api/redemptions/route.js:1:4172)
```

Two occurrences, both HTTP **500**, deployment `dpl_E4nwNxEv2rF1sqb8kRDX3VxJrVCG`
(commit `a26aa5d`, branch `main`), at **03:39:32** and **03:40:10 UTC** on
2026-08-14. No duration was recorded for either — they failed on the throw, not
on a timeout. No secrets, identifiers or location data appear in the log lines.

## The defect

`maanta-app/src/lib/supabase/server.ts` passed **both** `accessToken` and a
cookie adapter to `@supabase/ssr`'s `createServerClient`.

`createServerClient` reconciles a cookie session with SSR, and does so by
subscribing to `supabase.auth.onAuthStateChange` while constructing the client.
`@supabase/supabase-js` refuses *any* access to `supabase.auth` once
`accessToken` is configured — the two are mutually exclusive by design. So the
constructor threw, unconditionally, on every Clerk-authenticated server request.

## Timeline

| When (UTC) | What |
|---|---|
| — | Clerk branch ships with both options combined |
| 2026-08-13 ~18:xx | Shopper completes phone OTP, claim fails: "Network error — please try again." |
| 2026-08-14 02:1x | Read-only investigation traces the claim path; ranks timeout-after-commit first — **wrong**, though it correctly identified the client-side masking defect |
| 2026-08-14 03:33 | PR #202 merged (`a26aa5d`) — honest failure copy, bounded enrichment, timeouts, error mappings |
| 2026-08-14 03:35 | Production `READY` on `a26aa5d` |
| 2026-08-14 03:39–03:40 | Two further claim attempts on a **different** demo deal fail; new copy renders correctly; **My Deals is empty** |
| 2026-08-14 ~04:05 | Runtime logs read: the error above. Timeout-after-commit **rejected**; a Clerk-secret hypothesis raised beforehand also **rejected** |

**What PR #202 contributed.** It did not fix this. It is why this was diagnosed:
the old code reported the 500 as "Network error, try again", which invited
retries against a route that could never succeed. The new copy said the outcome
was unconfirmed and sent the user to My Deals — and its emptiness is what ruled
out a committed claim and killed the leading hypothesis. Its other changes
(bounded enrichment, provider timeouts, `deal_not_active` and session mappings)
remain correct and independently worthwhile.

## Why CI missed it

CI, local development and every test run use the **Supabase** auth strategy —
`DEFAULT_AUTH_STRATEGY` is `supabase`, and Clerk turns on only when
`MAANTA_AUTH_STRATEGY` **and** `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` are both
explicitly `clerk`. That is production and nowhere else.

The Supabase branch was always correct. The broken branch was never executed by
any check. `lint`, `typecheck`, 682 tests and a full production build all passed
over code that could not survive its first real request — and `route.test.ts`
mocks `@/lib/supabase/server` wholesale, so even the claim route's own suite
replaced the factory that was broken.

This is the same shape as **D70**: a strategy-dependent path that only the
production configuration reaches. Different call site — that one was a client
component calling `supabase.auth.getSession()` after hydrating into the wrong
branch — but the same underlying supabase-js guard, and the same reason nothing
caught it.

## Caller inventory

Every importer of `src/lib/supabase/server.ts`:

| Caller | Route / function | Clerk branch reachable | User-impact severity | Uses affected client | Needs regression test |
|---|---|---|---|---|---|
| `src/app/api/redemptions/route.ts` | `POST /api/redemptions` — shopper claim | **Yes** | **Critical** — confirmed 500 in production, no ticket created | Yes | **Yes — added** |
| `src/app/api/redemptions/verify/route.ts` | `POST /api/redemptions/verify` — **merchant till, `verify_redemption`** | **Yes** | **Critical** — the counter money path; the KES 30 fee is debited here | Yes | Yes — see gap below |
| `src/app/api/boosts/route.ts` | `POST /api/boosts` — `purchase_boost`, debits the wallet | **Yes** | High | Yes | Yes — see gap below |
| `src/app/api/boosts/move/route.ts` | `POST /api/boosts/move` — `move_boost` | **Yes** | Medium | Yes | Yes — see gap below |
| `src/app/api/push/subscribe/route.ts` | `POST /api/push/subscribe` | **Yes** | Low — push opt-in only | Yes | Yes — see gap below |
| `src/lib/auth/supabase-session.ts` | `currentSupabaseAuthUserId` / `currentSupabaseAuthEmail` | **No** | n/a | Yes | **No** — called only from `ensureAppUserFromSupabaseAuth`, which runs behind `isSupabaseAuth()`. It calls `supabase.auth.getUser()`, which would throw under Clerk, so the gate is load-bearing and worth keeping in mind |

**The merchant till was broken too.** `verify_redemption` is where the success
fee is charged, so in production a merchant could not verify a code at the
counter. That is at least as serious as the claim failure and was not visible in
the reported incident.

Other client factories, checked and **not** affected:

- `src/lib/supabase/client.ts` (browser) — passes `accessToken` **only**, no
  cookie plumbing. This is the correct shape, and the model the server factory
  now follows.
- `src/lib/supabase/middleware.ts` — cookies only, no `accessToken`, and used
  solely in the Supabase branch of `middleware.ts`.
- `src/lib/supabase/service.ts` — service-role key, no auth options.

**Coverage gap, stated rather than glossed:** the four non-claim routes are
fixed by the same one-line-per-branch change and are covered at the factory
level by `server-client.test.ts`, but none has a route-level test proving it
reaches its RPC under Clerk. The claim route has one because it is the confirmed
incident. Adding the same for `verify` in particular is the obvious follow-up.

## The invariant

**Clerk strategy** — the Clerk JWT is the only auth mechanism:

- build with `@supabase/supabase-js`'s `createClient`, `accessToken` only
- no cookie adapter, no `cookies()` read, nothing that touches `supabase.auth`

**Supabase-auth strategy** — the cookie session is the only auth mechanism:

- build with `@supabase/ssr`'s `createServerClient` and the cookie adapter
- no `accessToken`

Unchanged by this fix: the identity mapping contract
`auth.jwt() ->> 'sub' → users.clerk_user_id`, and all database/RPC
authorization. No migration, RLS, RPC, schema or auth-provider change.

## Tests added

`maanta-app/src/lib/supabase/__tests__/server-client.test.ts` — 11 cases running
**both** branches directly:

- Clerk branch constructs without throwing
- Clerk branch builds via `supabase-js`, never the SSR wrapper
- Clerk branch passes `accessToken` and *only* `accessToken`
- Clerk branch never reads request cookies
- `accessToken()` resolves the Clerk session token
- Supabase branch keeps the SSR wrapper, its cookie adapter and a working
  `getAll`, and passes no `accessToken`
- a stand-in reproducing the supabase-js guard, asserted to still throw if the
  two options are ever recombined — so the Clerk assertions mean something

`maanta-app/src/app/api/redemptions/__tests__/route-client-construction.test.ts`
— 3 cases that deliberately **do not** mock `@/lib/supabase/server`, run the
real factory with the strategy forced to Clerk, and assert the request reaches
`claim_deal`, that PR #202's error mappings still apply, and that duplicate-claim
protection still returns 409.

**Proven to fail before being trusted.** Reinstating the combined options failed
9 of the 14 new cases with the exact production error, including "reaches
claim_deal instead of dying while building the client". Restored, re-run green.

## Verification

| Command | Result |
|---|---|
| `npm run lint` | see PR |
| `npm run typecheck` | see PR |
| `npm test` | see PR |
| `npm run build` | see PR |
| `make db-verify` | not run — no Docker or Supabase CLI in this environment, and no SQL changed. CI's `db-tests` job still runs it |

## Production verification plan

After merge and deploy, in order:

1. Confirm the production deployment is `READY` and its commit matches `main`.
2. Watch runtime logs for `POST /api/redemptions`: the
   `onAuthStateChange` error must be **absent**.
3. Exercise one claim on a **safe, authorized** target — it must not consume a
   merchant-funded deal or create an unintended fee. A claim raises no fee on
   its own (the KES 30 is debited at verification) but it does consume a claim
   slot, so choose deliberately.
4. Confirm the resulting ticket appears in My Deals.
5. Separately confirm the merchant till path (`/api/redemptions/verify`) builds
   its client without error — **without** completing a real redemption, since
   that charges the success fee.

## Remaining risks

- **The four non-claim routes are fixed but unproven in production.** Same
  factory, same fix; no route-level Clerk test yet.
- **No guard prevents a future strategy-dependent path from going untested.**
  This class of defect — correct in the branch CI runs, broken in the branch
  production runs — has now occurred twice (D70 and this). The durable answer is
  running some part of CI under the Clerk strategy, which is larger than a P0
  fix and not attempted here.
- **The Vercel Preview deployment failure is still undiagnosed** and unrelated
  to this. It remains a deferred audit.
- The original shopper's first failed claim (the bangle deal) produced no
  ticket, consistent with this root cause. Nothing was left half-written.

## Drift register

**No row added yet, deliberately.** `drift-register.test.ts` enforces unique and
contiguous D-numbers; `main` ends at **D90** and unmerged PR #200 adds
**D91–D95**, so `D91` would collide and `D96` would leave a hole. This document
is the durable incident record until the next contiguous ID can be allocated
after #200 merges. Two rows will be owed then: this one, and the claim-response
row drafted in `docs/ops/claim-response-reliability-fix-2026-08-14.md`.

## Related

- `docs/ops/claim-response-reliability-fix-2026-08-14.md` — PR #202, the
  reporting fix that made this diagnosable
- `docs/skills/clerk-auth.md` — Clerk + Supabase JWT integration
- `docs/ops/auth-strategies.md` — how the strategy switch works
- Drift **D70** — the browser-side instance of the same supabase-js guard
