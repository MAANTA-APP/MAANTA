# Claim Failure Investigation — 2026-08-14

Read-only diagnosis. No production state was read, written or changed; no claim
was attempted. Traced against `main` @ `7b2b097`.

**Headline:** the message the user saw is not a diagnosis, it is a fallback that
fires for a category of failure — and the category it fires for is *not* what it
says. "Network error — please try again." cannot be produced by any handled
backend rejection. It is reachable only when `fetch` itself rejects, **or when
the response body is not valid JSON**, because `await res.json()` runs inside the
`try` block *before* the `!res.ok` branch. So every non-JSON HTTP error — a
platform 500, a 504 timeout, an empty body — arrives at the user as a network
error.

That narrows the real candidates sharply, and it means the most useful next
action is not a retry but a single check: **does a ticket for that deal exist in
My Deals?** If it does, the claim succeeded and only the response was lost.

## User-observed behavior

- Signed in on `maanta.app` and completed phone OTP with a Norwegian number.
  OTP was delivered and accepted.
- Viewing a demo deal — "Gold-plated bangle set", Pearl Beauty, BBS Mall — with
  the demo-mode banner visible.
- Pressed the final claim confirmation.
- UI showed: `Network error — please try again.`

Not established: HTTP status, response body, whether a redemption row was
created, whether location permission was granted.

## Scope and safety constraints

Source, migrations and tests only. Nothing was changed: no production data,
demo-mode configuration, claims, redemption records, merchant data, user
accounts, RLS, RPCs, migrations or provider settings. No additional claim was
attempted and no live or demo offer was consumed. No phone number, OTP, user id,
JWT, auth header or key appears in this document.

## Claim-path trace

| Step | Where |
|---|---|
| 1. `Claim deal` → confirm sheet → `confirmClaim()` | `maanta-app/src/app/(shopper)/deals/[id]/claim-flow.tsx:48` |
| 2. Best-effort geolocation, 6 s timeout, never blocks | same, `getPosition()` at `:37` |
| 3. `POST /api/redemptions` with `{dealId, lat, lng}` | same, `:60` |
| 4. `ensureAppUser()` → 401 JSON if unauthenticated | `maanta-app/src/app/api/redemptions/route.ts:20` |
| 5. `currentUserHasVerifiedPhone()` → 403 JSON `phone_required` | same, `:32`; helper `maanta-app/src/lib/auth.ts:38` |
| 6. `checkRateLimit()` → 429 JSON | same, `:48`; `maanta-app/src/lib/rate-limit.ts` |
| 7. `supabase.rpc("claim_deal", …).single()` — anon client carrying the Clerk JWT | same, `:66`; client `maanta-app/src/lib/supabase/server.ts` |
| 8. RPC enforcement and OTP insert | `maanta-app/supabase/migrations/20260730180000_restore_claim_deal_pause_gate.sql` |
| 9. Error mapping → JSON with status | route `:81`–`:116` |
| 10. **Post-claim, after the row is committed:** what3words lookup → `guardian_check` → `redemptions` UPDATE | route `:118`–`:148` |
| 11. `deals` SELECT for node, PostHog capture | route `:150`–`:166` |
| 12. `200 {redemptionId, expiresAt}` → `router.push('/tickets/…')` | route `:168`; client `:83` |

Identity: the RPC resolves the caller with `public.current_user_id()`, which
matches `auth.jwt() ->> 'sub'` against `users.clerk_user_id`
(`20260720140000_clerk_third_party_auth.sql`). Execute is granted to
`authenticated` and `service_role`; **`anon` is explicitly revoked**.

## Demo-mode claim semantics

**Demo deals are claimable by design.** Confirmed:

- `claim_deal` contains no `is_demo` condition — grep of the migration returns
  nothing. It gates on `is_active`, `is_paused`, `expires_at`, merchant
  `status`/`is_visible`/`is_shadow_banned`, `max_claims`, and an existing pending
  claim. Demo rows are ordinary rows.
- Demo mode governs **disclosure and discovery**, not claimability:
  `maanta-app/src/lib/data.ts` filters `.eq("is_demo", false)` unless a caller
  opts in, and `DemoModeBanner` renders the disclosure. The switch is the
  database row `app_config.demo_mode_enabled`.

So "it is a demo deal" is **not** in itself an explanation. A demo deal can still
fail on any ordinary gate — `is_active` false, paused, expired, fully claimed —
but each of those returns a specific JSON message, none of which is what the user
saw.

## Error mapping analysis

Client, `claim-flow.tsx:59`–`:88`:

```ts
try {
  const res = await fetch("/api/redemptions", { … });
  const body = await res.json();          // ← runs before the !res.ok branch
  if (!res.ok) { … setError(body.error ?? "Could not claim this deal."); return; }
  …
} catch {
  setError("Network error — please try again.");   // ← error never inspected
}
```

Two defects, and the second is the one that produced this report:

1. The `catch` does not distinguish a transport failure from a body-parse
   failure. Every exception becomes "Network error".
2. `res.json()` is evaluated **before** `res.ok` is checked, so a non-JSON error
   response never reaches the error-message branch at all.

**Backend failures that are correctly reported** (JSON, never "Network error"):

| Backend condition | Status | Message shown |
|---|---|---|
| `phone_required` | 403 | routed to `/verify-phone`, no error text |
| `deal_paused` | 409 | "This deal is paused — no new claims right now." |
| `deal_not_found`, `merchant_not_available` | 404 | "This deal is no longer available." |
| `deal_expired` | 410 | "This deal has expired." |
| `deal_claim_limit_reached` | 410 | "This deal is fully claimed." |
| `active_claim_already_exists` | 409 | "You already have an active claim on this deal." |
| `unauthorized` | 403 | "Not authorized." |
| rate limit | 429 | "Too many claim attempts…" |
| unmapped RPC error | 500 | "Could not start redemption. Please try again." |

**Backend errors that exist but are unmapped**, collapsing into the generic 500
message above — visible to the user as "Could not start redemption", not as
"Network error", but still uninformative:

- **`deal_not_active`** — raised by the RPC, absent from the route's mapping.
  A real gap: an inactive deal reports as an unspecified server error.
- `otp_generation_failed` — five OTP collisions.
- `permission denied for function claim_deal` — what an **anon** request gets,
  i.e. what a missing or unaccepted Clerk token produces. The string contains no
  mapped substring, so an auth-transport failure is reported as a server fault.
- Postgres type errors, e.g. a non-UUID `dealId`.

**What can actually produce "Network error":** only `fetch` rejecting, or a
response body that is not JSON. Nothing else in the codebase reaches that line.

## Confirmed findings

| Layer | Expected behavior | Observed/confirmed behavior | Failure possibility | Evidence |
|---|---|---|---|---|
| Claim button → handler | Confirm sheet, then POST | As expected | — | `claim-flow.tsx:48`–`:68` |
| Geolocation | Best-effort, never blocks | As expected; resolves `null` on denial/timeout | Norwegian coords are valid, so `gps` is non-null and step 10 **runs** | `claim-flow.tsx:37`–`:46`; route `:119` |
| Client error handling | Show the backend's reason | Any exception → "Network error"; `res.json()` precedes `res.ok` | **Confirmed defect** — masks every non-JSON HTTP error | `claim-flow.tsx:69`–`:88` |
| API auth gate | 401 JSON | Returns JSON | Cannot produce the observed message | route `:20`–`:23` |
| Phone gate | 403 JSON `phone_required` → redirect | Returns JSON | Would redirect to `/verify-phone`, not error | route `:32`–`:41` |
| Rate limit | 429 JSON | Returns JSON | Cannot produce the observed message | route `:48`–`:58` |
| `claim_deal` RPC | Typed exceptions | All mapped paths return JSON | Cannot produce the observed message | route `:81`–`:116`; migration `20260730180000` |
| Demo deals | Claimable | No `is_demo` check in the RPC | Not a cause in itself | migration `20260730180000` |
| RPC grants | `authenticated` + `service_role`; `anon` revoked | As stated | Missing Clerk token → `permission denied` → generic 500 JSON | migration `20260730180000` tail |
| **Post-claim block** | Enrich the row after the claim commits | **Uncapped external fetch to api.what3words.com — no `AbortSignal`, no timeout** | **Function timeout → 504 HTML → "Network error", with the claim already committed** | `src/lib/what3words.ts:50`, `:161`; route `:118`–`:148` |
| Route runtime config | — | **No `maxDuration` / `runtime` export** on this route, unlike `/api/me`, `/api/profile`, `/api/healthz` | Runs on the default function duration | route file; `grep maxDuration src/app/api` |
| Unhandled throw sites | — | `createServiceClient()` throws on missing env; Clerk `currentUser()` and `auth().getToken()` are network calls | Throw → non-JSON 500 → "Network error" | `src/lib/supabase/service.ts:18`–`:19`; `src/lib/auth.ts:42`; `src/lib/supabase/server.ts` |

## Likely causes

Ranked. All three are consistent with the screenshot; none can be separated
without one piece of evidence named in the next section.

**1. Function timeout after the claim already committed — moderate-to-high.**
The post-claim block performs an external HTTP call to `api.what3words.com` with
**no timeout**, then `guardian_check`, a `redemptions` UPDATE, a `deals` SELECT
and an analytics capture — all after the redemption row is written and before the
response is sent. If the third party is slow or unreachable from the function's
region, the platform kills the invocation and returns a non-JSON 504, which the
client renders as "Network error". **The claim would exist.** This block runs
only when GPS is present, which matches a user who allowed location.

**2. Unhandled exception in the route — moderate.** Any throw before the JSON
response yields a non-JSON 500 with the same client symptom. Candidate sites:
`createServiceClient()` (throws outright on a missing `NEXT_PUBLIC_SUPABASE_URL`
or `SUPABASE_SERVICE_ROLE_KEY`, and is reached twice — via `ensureAppUser` and
via `checkRateLimit`), Clerk's `currentUser()` inside the phone gate, and
`auth().getToken()` inside `createClient()`. The Clerk calls are outbound network
requests and can fail transiently — including moments after a phone verification.

**3. Genuine transport failure — moderate.** A mobile network drop across the
geolocation wait plus the request would reject `fetch` honestly. Cannot be ruled
out from a screenshot, and is the one case where the message is accurate.

**Ruled out as the direct cause** (each returns JSON with its own message):
phone gate, rate limit, paused / expired / fully-claimed / not-found deal,
duplicate active claim, `unauthorized`, and the deal being a demo deal.

## Evidence still required

Not available in this session — production log access is out of scope here.

1. **Vercel runtime logs**, function `/api/redemptions`, method POST, for the
   window of the attempt (±10 minutes). Wanted: HTTP status, duration, and
   whether the invocation was killed on timeout. A `console.error` line reading
   `claim_deal RPC failed:` would instead point at cause 2 with a mapped-miss.
2. **Browser DevTools → Network**, the `/api/redemptions` entry: status code,
   response `content-type`, and the first bytes of the body. HTML or an empty
   body confirms the masking path; a rejected request with no response confirms
   cause 3.
3. **Whether a redemption exists** for that deal and user. The cheapest check,
   and the one that splits cause 1 from causes 2 and 3: open **My Deals /
   Tickets** in the app. A ticket present ⇒ the claim committed and only the
   response was lost.
4. Whether **location permission was granted** at the prompt. Granted ⇒ the
   uncapped post-claim block executed.
5. Whether `W3W_API_KEY` is set in the production environment, and whether
   `api.what3words.com` is reachable from the function region. A missing key
   returns `null` fast and harmlessly; a *present* key pointing at a slow or
   blocked endpoint is the dangerous case.

## Recommended minimal remediation

Proposals only — **nothing here has been implemented.** Ordered by value.

1. **Stop the client mislabelling failures.** Read the body defensively and
   branch on `res.ok` first:
   `const body = await res.json().catch(() => null);` then use
   `body?.error ?? \`Something went wrong (HTTP \${res.status}).\`` for a non-OK
   response, and reserve the network wording for a rejected `fetch`. Small,
   testable, and it makes every future report of this class self-diagnosing.
2. **Bound the external call.** Give the what3words fetch an
   `AbortSignal.timeout(…)`. A third party must never be able to consume a whole
   function invocation.
3. **Take the fraud pass off the response path**, or at minimum respond before
   enriching. A committed claim should never be invisible to the shopper because
   an enrichment step was slow. This is the change that removes the failure mode
   rather than relabelling it.
4. **Map `deal_not_active`** in the route, alongside the other typed exceptions.
5. Consider mapping `permission denied for function claim_deal` to an auth
   message, so a token failure stops presenting as a server fault.

Items 1, 4 and 5 are copy and control flow. Items 2 and 3 change request timing
and deserve their own review.

## Test plan

Repository-side, no production effect:

- Unit-test the client handler against three responses — valid JSON error,
  non-JSON body with a non-OK status, and a rejected `fetch` — asserting three
  distinct messages. The existing suite has no coverage of the `catch` branch.
- Extend `src/app/api/redemptions/__tests__/route.test.ts`, which today covers
  the phone gate and `deal_paused`, with `deal_not_active` and a
  permission-denied RPC error.

Production-side, requires approval and is **not** performed here:

- One controlled retry **with location permission denied**. If the claim then
  succeeds, the fault is isolated to the GPS-only post-claim block — cause 1.
  This consumes a claim on a demo deal, so it needs an explicit decision first.
- Reading the Vercel log window in §Evidence, which changes nothing.

## Production actions not performed

No claim, redemption, verification, top-up or purchase. No production database
read or write. No change to demo mode, `app_config`, RLS, RPCs, migrations,
environment variables, deployment or third-party provider settings. No retry of
the failing action. No drift row added or closed. No personal data of any kind
was accessed or is reproduced here.
