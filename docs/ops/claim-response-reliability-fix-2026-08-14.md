# Claim Response Reliability Fix — 2026-08-14

P0. Fixes the confirmed response-path defects found in
`docs/ops/claim-failure-investigation-2026-08-14.md`. No production state was
touched, no claim was retried, and the root cause is **not** treated as proven.

**What changed, in one line:** a committed claim can no longer be reported to
the shopper as a failure, and when the outcome genuinely is unknown the app says
so and sends them to look at their tickets instead of inviting a retry.

## Incident summary

A user completed phone OTP with a Norwegian number, pressed **Claim deal** on a
demo deal (Gold-plated bangle set, Pearl Beauty, BBS Mall) and saw
`Network error — please try again.`

The investigation established that this message is unreachable from any handled
backend rejection. It fires only when `fetch` rejects **or** when the response
body is not JSON — and the client parsed the body inside the same `try`, before
checking `res.ok`, so every platform 500 and every function timeout landed there
too. The claim may well have committed first.

The harm is not the wording. It is that "network error, try again" is an
instruction, and following it on a claim that already succeeded is how a shopper
ends up confused about which ticket is real.

## Confirmed defects fixed

Each was verifiable from source, independent of what the production logs will
eventually say.

1. **The client threw on non-JSON responses and mislabelled the result.**
   `await res.json()` ran before `res.ok` and inside the `fetch` try, and the
   `catch` never inspected what it caught.
   → `maanta-app/src/lib/claim-response.ts` parses defensively, branches on
   `res.ok`, and names the three outcomes. Transport failure is now separate
   from a server failure.

2. **A committed claim could be lost to a slow third party.** The post-claim
   block called what3words with no timeout, then made three further round trips,
   all before the response was written.
   → The block now runs under a hard deadline
   (`POST_CLAIM_ENRICHMENT_DEADLINE_MS`, 1200 ms) and every failure inside is
   swallowed. The response goes out regardless.

3. **The what3words call was unbounded.** `await fetch(url)` with no signal.
   → `AbortSignal.timeout()` on every call: 5000 ms default for interactive
   validation, **1500 ms on the claim path**, where the lookup is enrichment
   behind a ticket the shopper is waiting for.

4. **`deal_not_active` was unmapped.** Raised by `claim_deal`, matched by no
   branch, so an inactive deal read as an unexplained server error.
   → 410, "This deal isn't running right now."

5. **A missing or rejected session read as a server fault.** Postgres returns
   `permission denied for function claim_deal` when the request arrives as
   `anon`; that string matched nothing.
   → 401 with `code: "sign_in_required"`, and the client routes to login and
   back to the deal. The database's wording — which names a function and a role
   — never reaches the client.

## Hypotheses not yet proven

The fixes above are correct on their own terms. **The root cause of the reported
incident is still open**, and nothing here should be read as closing it:

- **Function timeout after a committed claim** (leading). Consistent with every
  observation, and the fix removes the mechanism — but "we removed a plausible
  cause" is not "we observed the cause".
- **Unhandled throw before the JSON response** — `createServiceClient()` throws
  outright on missing env and is reached twice; Clerk's `currentUser()` and
  `getToken()` are outbound calls. Still possible, and the new client copy would
  now report it honestly rather than as a network fault.
- **A genuine transport failure** — the one case where the old message was
  accurate.

Only the Vercel log line for that invocation can separate these. Until then the
investigation finding stays open.

## Response-path boundary, before and after

**Before** — everything between the commit and the response could fail the
response:

```
claim_deal RPC commits ──► w3w (unbounded) ──► guardian_check ──► UPDATE
                       ──► deals SELECT ──► analytics ──► 200 JSON
```

**After** — the boundary is explicit and the enrichment sits behind a deadline:

```
claim_deal RPC commits ──► ┌ bounded 1200 ms, all errors swallowed ┐ ──► 200 JSON
                           │ w3w (≤1500 ms) → guardian_check       │
                           │ → UPDATE → deals SELECT → analytics   │
                           └───────────────────────────────────────┘
```

**Why bounded rather than fire-and-forget.** This runs on Node serverless, where
work not awaited before the response is frozen with the invocation and usually
never completes. Returning first and finishing later would therefore stop
setting `review_required` — a fraud control, not decoration — silently and most
of the time. A strictly bounded wait keeps the control working in the ordinary
case (a healthy lookup is well under the deadline) while making the pathological
case impossible.

**Operational trade-off, stated plainly:** if the deadline is hit, the shopper
gets their ticket and that redemption carries no `distance_from_shop`, no
`fraud_flags` and `review_required` unset. That is *identical* to the
pre-existing behavior whenever the provider failed — those errors were already
caught and swallowed here. What changed is that a slow provider now degrades the
same way a broken one always did, instead of taking the response with it. The
abandonment is logged (`post-claim enrichment abandoned at deadline`).

**The durable fix is not this.** Enrichment belongs off the request entirely.
Next 14.2's `unstable_after` is the repo-native candidate but is gated behind an
experimental flag, and switching that on for the money path inside a P0 is the
wrong trade. Revisit when it is stable or deliberately enabled.

## Enrichment timeout behavior

| Condition | Result |
|---|---|
| Provider healthy | Distance and flags written as before; no change |
| Provider slow, under 1500 ms | As before |
| Provider exceeds 1500 ms | Lookup aborts, distance `null`, `guardian_check` still runs with a null distance |
| Provider unreachable / malformed / key missing | `null`, logged by reason code only |
| Whole block exceeds 1200 ms | Abandoned, logged; response still 200 with the ticket |

Nothing in a log line carries an API key, a provider response body, the shopper's
coordinates or the shop's address — only a reason code.

## User-facing behavior after the fix

| Situation | Before | After |
|---|---|---|
| Deal paused / expired / fully claimed / not found | Specific message | Unchanged |
| Duplicate claim | "You already have an active claim on this deal." | Unchanged |
| Phone not verified | Routed to `/verify-phone` | Unchanged |
| Deal inactive | "Could not start redemption. Please try again." | "This deal isn't running right now." |
| Session expired / token rejected | "Could not start redemption. Please try again." | "Your session has expired — sign in again to claim." + routed to login |
| Platform 500 / 504 / empty body | **"Network error — please try again."** | **"We couldn't confirm your claim. Check My Deals before trying again."** |
| Connection actually dropped | "Network error — please try again." | Same check-first message |
| 200 with no ticket id | Navigated to a broken URL | Check-first message |

## Duplicate / idempotency evidence

The scenario, answered against the shipped RPC:

1. `claim_deal` commits, inserting a `pending` redemption for (deal, user).
2. The HTTP response is lost.
3. The shopper follows the new copy and opens My Deals — **the ticket is there**;
   it was committed in step 1 and nothing downstream can remove it.
4. The shopper retries anyway — `claim_deal` re-checks for a `pending`,
   unexpired redemption on that (deal, user) pair and raises
   `active_claim_already_exists`. The route maps it to 409 and the shopper is
   told they already hold a claim.

**No second usable ticket, and no second fee.** The KES 30 success fee is
debited at merchant verification, once per redemption row — and no second row is
created. This protection already existed in
`supabase/migrations/20260730180000_restore_claim_deal_pause_gate.sql`; **no
schema, RLS or RPC change was needed or made.** A regression test now locks the
mapping to it.

The one residual: the pre-existing claim is only found while it is `pending` and
unexpired, which is the intended window.

## Tests run

New coverage, 18 + 12 cases:

- `maanta-app/src/lib/__tests__/claim-response.test.ts` — success; 200 with no
  ticket id; seven structured backend errors preserved verbatim; both typed
  redirects; four non-JSON shapes (HTML 500, HTML 504, empty body, truncated
  JSON) proving no throw and the check-first copy; an explicit assertion that the
  word "network" never reaches the shopper; transport failure. Uses the real
  `Response` class — a stub that always parses cleanly would have passed against
  the old code too.
- `maanta-app/src/app/api/redemptions/__tests__/route.test.ts` — `deal_not_active`
  → 410; permission-denied → typed 401 with the DB wording asserted absent;
  `unauthorized` → same; signed-out 401 typed; duplicate claim → 409;
  unrecognised error stays a generic 500 with no internals; **what3words that
  never answers still returns the ticket** (the incident mechanism); provider
  throwing still returns the ticket; and the happy path still writes
  `review_required` — the control is bounded, not removed.

| Command | Result |
|---|---|
| `npm run lint` | ✅ clean |
| `npm run typecheck` | ✅ clean |
| `npm test` | ✅ 85 files, 678 tests (was 651) |
| `npm run build` | ✅ incl. `check:tokens`, `check:canonicals`, `check:forms` |
| `make db-verify` | **not run** — no Docker and no Supabase CLI in this environment. No SQL changed, so no migration or `supabase/tests/*.sql` is implicated; CI's `db-tests` job still runs them |

## Production verification checklist

Documented, **none performed**.

1. Look up whether the reported user's ticket exists, via an authorized,
   privacy-safe admin/support route — not a raw query, and without exposing the
   phone number or user id.
2. Pull Vercel logs for `POST /api/redemptions` in the incident window: status,
   duration, and whether the invocation was killed at the platform limit.
3. Record the redacted failure cause — a `claim_deal RPC failed:` line points at
   an unmapped RPC error; no line plus a duration at the ceiling points at the
   timeout.
4. Confirm whether GPS was granted, since the enrichment block only runs when it
   was.
5. Confirm whether what3words was attempted and whether it timed out — reason
   codes only, no coordinates, no address, no key.
6. Deploy the fix and confirm the deployment is Ready and serving `main`.
7. Validate a claim on a path that consumes no merchant-funded deal and creates
   no unintended fee. **Note:** a claim alone raises no fee — the KES 30 is
   debited at verification — but it does consume a claim slot, so pick the
   target deliberately.
8. Confirm a successful claim reaches the ticket even when enrichment fails, by
   observing a 200 with the ticket id while the log shows the abandonment line.

## Rollback considerations

Low risk, and revertible in pieces:

- **Client** (`claim-response.ts`, `claim-flow.tsx`) — pure presentation and
  routing. Reverting restores the old masking; nothing else depends on it.
- **Timeouts** (`what3words.ts`) — reverting restores unbounded calls, which is
  the defect. `AbortSignal.timeout` is feature-detected, so a runtime without it
  degrades to the previous behavior rather than throwing.
- **Route** (`redemptions/route.ts`) — the enrichment body is unchanged, only
  wrapped. Reverting the wrapper restores the old ordering.
- **No migration, no RLS, no RPC, no schema change**, so there is nothing to roll
  back on the database side and no ordering constraint against a deploy.
- The new error mappings are additive; existing statuses and messages are
  unchanged, so a client on an older bundle still behaves as before.

## Drift register — sequencing, and why no row was added here

The register has no open item covering claim response reliability. D29 (nullable
deal expiry) and D84 (the phone-gate comment) are different findings. **A row is
warranted — and adding it on this branch would break CI.**

`maanta-app/src/lib/__tests__/drift-register.test.ts` enforces unique IDs *and*
contiguous D-numbering. This branch is cut from `main`, where the register ends
at **D90**. PR #200 is open and unmerged and adds **D91–D95**. So:

- numbering this row **D91** collides with #200 on whichever merges second;
- numbering it **D96** leaves a D90→D96 hole and fails contiguity if this
  branch merges first.

Either order breaks a guard. The row therefore lands once merge order is
settled — text drafted below, ready to paste with the correct number.

> **D9x | open | code-outlier | 2026-08-14 | Core loop** — *A shopper whose
> claim committed could be told the network failed.* The client parsed the
> response body before checking `res.ok` and inside the `fetch` try, so any
> non-JSON response — a platform 500, a function timeout — threw into a `catch`
> that reported "Network error — please try again." Meanwhile the route ran an
> unbounded what3words call plus three round trips between the committed claim
> and the response, so a slow provider produced exactly that non-JSON timeout.
> The two defects compose into the worst available outcome on a money surface:
> a committed claim reported as a failure, with wording that invites a retry.
> **Evidence / next step:** response-path defects fixed and guarded
> (`maanta-app/src/lib/__tests__/claim-response.test.ts`,
> `maanta-app/src/app/api/redemptions/__tests__/route.test.ts`);
> `docs/ops/claim-response-reliability-fix-2026-08-14.md`. **Stays open until
> the production log line for the reported invocation identifies the actual
> cause** — the fix removes a plausible mechanism, which is not the same as
> observing the one that fired. | eng |

## Related

- `docs/ops/claim-failure-investigation-2026-08-14.md` — the read-only diagnosis
- `docs/skills/paused-deal-semantics.md` — pause enforcement, unchanged here
- `docs/skills/money-trust-engineering-guardrails.md`
