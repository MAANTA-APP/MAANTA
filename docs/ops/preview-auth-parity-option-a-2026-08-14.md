# Preview auth parity — Option A runbook (founder-ruled 2026-08-14)

**Ruling:** fix Preview first, before the #201 merge, because the red Preview is
what blocks #201 and because a Preview that exercises the Clerk branch removes
the exact environment-parity blind spot behind **D70** and **D96** — both
defects that executed only where both strategy vars said `clerk`, i.e.
production and nowhere else.

**Option A chosen:** give Preview the Clerk publishable key and keep Preview on
the Clerk strategy. **Option B rejected:** switching Preview to the Supabase
strategy would make deploys green by bypassing the same Clerk branch Production
executes, preserving a known regression-detection gap.

Drift row: **D98** (open). Decisions-log entry: 2026-08-14.

**Who does what:** the env write and the redeploy are Vercel-dashboard actions —
this Claude session's Vercel tooling has no environment-variable read or write
capability and no redeploy control, so **the operator performs exactly two
dashboard actions**; every verification step below is read-only and this
session can execute all of them on request and report.

---

## Operator instructions (founder-authored, verbatim in substance)

### Goal

Unblock Preview deployments and make Preview exercise the Clerk client branch
that Production uses.

### Allowed Vercel change — one write, nothing else

Add this environment variable to the Vercel project `maanta-nuia`
(`prj_9ZcvFgpVsaUpP9hv2UlNoU5Sdw4c`):

```text
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
```

**Scope: Preview only.** Not Production, not Development.

Value: the same public `pk_test_…` publishable key currently served by the live
Production Clerk development instance. Pre-verified by read-back of
`https://www.maanta.app/login` (HTTP 200, 2026-08-14 15:00 UTC):

```text
pk_test_Y2hlZXJmdWwtc2FpbGZpc2gtMy5jbGVyay5hY2NvdW50cy5kZXYk
```

(Base64 payload decodes to `cheerful-sailfish-3.clerk.accounts.dev$` — the
development instance. This is a *publishable* key, public by design and already
embedded in every production page; recording it here reveals nothing.)

Do not copy, rotate, reveal, or alter any secret key.

### Preconditions — record before writing anything

1. In the Vercel dashboard, confirm Preview currently has
   `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=clerk`, or document the exact observed
   value. *(Session evidence, inference only: the failing Preview builds mount
   ClerkProvider, which requires that the inlined client strategy resolved to
   `clerk` — but the dashboard read is the confirmation; this session cannot
   read env vars.)* **While there, also record — record only, change nothing —
   the observed Preview values/presence of `MAANTA_AUTH_STRATEGY` and
   `CLERK_SECRET_KEY`.** The outcome-interpretation table below is keyed on
   them.
2. Confirm Production's public Clerk publishable key corresponds to the
   existing `*.clerk.accounts.dev` development instance identified in the
   read-only audit. **✅ Pre-verified above** (key + decode + the
   dev-instance-only `x-clerk-auth-reason: dev-browser-missing` response
   header).
3. Confirm the change target is Preview only — not Production and not
   Development.
4. Record the existing Preview deployment failure signature.
   **✅ Pre-verified:** `@clerk/nextjs: Missing publishableKey` thrown during
   prerender, "Export encountered errors" on 12 routes, `npm run build` exit 1
   — deployment `CaRzQoMLXSLBcSbgVgm4tAX48X53` (PR #201, commit `27fcd76`),
   and identically on every Preview deployment 2026-08-10 → 2026-08-14.

### Explicitly not authorized

- No Production environment-variable change.
- No Development environment-variable change.
- No `CLERK_SECRET_KEY`, Supabase key, Stripe key, or any other
  secret/configuration mutation.
- No change of either auth strategy to Supabase merely to make Preview green.
- No code change, no database/RLS/RPC/schema/migration change.
- No Clerk dashboard or instance change.
- No production deploy, rollback, or transaction.

**Scope note (session reading of the above):** the allowed-change list names
exactly one variable. If precondition 1 finds the Preview server-side vars
absent or misaligned, that is a *report*, not a write — the founder's "keep …
aligned" clause is an instruction to preserve, not to add.

### Required verification — after the Preview-only variable is saved

1. Redeploy the existing #201 Preview deployment/commit
   (`CaRzQoMLXSLBcSbgVgm4tAX48X53` / `27fcd76`, dashboard **Redeploy**). Do not
   change #201's code to trigger a new build.
2. Confirm the deployment becomes `READY`.
3. Confirm build logs no longer show `Missing publishableKey`.
4. Perform an unauthenticated read-only fetch of the Preview `/login` route:
   it must return successfully and load Clerk without the missing-key error.
   Do not sign in or create an account.
5. Report the deployment ID, commit, status, the absence of the original
   error, and the read-only fetch result.
6. Stop. **Do not merge #201 yet.**

If any precondition is not satisfied or the redeploy fails, stop and report.
Do not make a fallback strategy change.

### Session-added detail on steps 2–4 (read-only; no new authorization)

- **A 401/auth wall on the Preview URL is expected and is NOT the failure
  signature.** Vercel Authentication is enabled on this project at scope
  `all_except_custom_domains` (protection read-back 2026-08-14), so anonymous
  curl of any `*.vercel.app` preview URL shows Vercel's SSO page. Do step 4
  from a browser signed into the Vercel team — or hand steps 2–5 to this
  session, which fetches through Vercel-authenticated tooling.
- **Step 4's "loads Clerk" must be checked in the served HTML, not just the
  status code**, because one failure mode returns a clean 200 (scenario 3
  below). PASS = the HTML contains the Clerk sign-in shell and the clerk-js
  script tag carrying the pk. FAIL = the HTML contains the Supabase email-OTP
  login form instead.
- **One extra read-only probe settles the env state without a dashboard trip:**
  `GET <preview-url>/api/healthz?ready=1` is public (no admin auth) and returns
  boolean presence for the five core vars including `CLERK_SECRET_KEY` and
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — booleans only, never values
  (`maanta-app/src/lib/health.ts`, `readiness()`).

---

## Outcome interpretation — what each result means

Repo-verified mechanism (workflow-audited 2026-08-14; file:line refs in the
session record): the build failure's only consumer of the key is
`ClerkProvider`'s `publishableKey` prop in
`maanta-app/src/components/auth/auth-providers.tsx`; nothing in the repo throws
at **build** time on a missing `CLERK_SECRET_KEY` (only presence booleans in
`maanta-app/src/lib/health.ts`) or a missing `MAANTA_AUTH_STRATEGY` (falls back
to `supabase`). All 12 failing routes fail through the same layout-mounted
provider, and none calls a Clerk server API at prerender. **The build is
therefore predicted green after the one-variable change regardless of the
server-side vars.** What differs is the *runtime* behavior of the resulting
deployment, keyed on Preview's server-side env — which this session cannot
read:

| # | Preview server env (observed at precondition 1) | Middleware branch | `/login` fetch result | Verdict |
|---|---|---|---|---|
| 1 | `MAANTA_AUTH_STRATEGY=clerk` **and** `CLERK_SECRET_KEY` present | Clerk | 200; HTML carries the Clerk sign-in shell | **Full parity — verification passes.** |
| 2 | `MAANTA_AUTH_STRATEGY=clerk`, `CLERK_SECRET_KEY` **absent** | Clerk, throws at request time | 500 on every route (`MIDDLEWARE_INVOCATION_FAILED`, missing-secretKey in function logs) | **Stop and report** (per the founder's failure rule). The report becomes the "separate audit" the secret-key exclusion anticipates. |
| 3 | `MAANTA_AUTH_STRATEGY` **absent** (secret irrelevant on this path) | Supabase (`isClerkAuth()` needs both vars) | 200 — but **split-brain**: server renders the Supabase email login while the clerk-inlined client bundle mounts ClerkProvider, and hydration then throws the D70-class `getSession`-on-accessToken-client error | **Superficially passes step 4, actually broken.** The HTML check above catches it: Supabase form present = scenario 3. Stop and report. |

Scenario 3 is why the HTML check is mandatory: it is the one outcome where
"deployment READY + 200 + no missing-key error" would mislead. Its remedy
(aligning `MAANTA_AUTH_STRATEGY` and adding the secret to Preview) is **not
authorized here** and would be a new founder decision.

Supabase-branch note (scenarios 3): the middleware's Supabase path requires
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(`maanta-app/src/lib/supabase/middleware.ts`); those were present in every
failing Preview build's env or the current previews would fail differently —
treat their absence as a fourth, unlikely, stop-and-report outcome.

---

## After Preview works (founder sequencing — held until then)

1. Rebase #201 onto current `main` (base moved: `7b2b097` → `a792ce6`; #200 is
   merged and live, so #201's offline-copy sequencing caveat is satisfied),
   rerun checks, get a fresh green Preview.
2. Review and merge #201.
3. Perform D93's **measurement** checklist (both platforms). The unresolved
   PWA-asset work — 192/512 raster icons, separate `maskable` artwork,
   `apple-touch-icon` + `appleWebApp` metadata — is a **distinct implementation
   task**, not silently folded into the device-evidence pass.
4. **B2 and the Clerk production-instance migration assessment stay held**
   until #201/D93 are complete. (The instance question itself is now tracked
   as drift **D99**.)

## Read-back checklist for closing D98

- [ ] Redeployed #201 Preview `READY`
- [ ] Build log clean of `Missing publishableKey`
- [ ] `/login` HTML = Clerk shell (not the Supabase form)
- [ ] `/api/healthz?ready=1` presence booleans recorded
- [ ] Scenario from the table above recorded with deployment ID + timestamp
- [ ] D98 closed citing this runbook + `docs/maanta-decisions-log.md`, or
      stop-and-report filed

---

## Outcome — 2026-08-15, read-back verified

Executed by the operator as three dashboard rounds, each verified from the
session side:

1. **Publishable key added; redeploy 23:56 UTC 2026-08-14**
   (`dpl_7znMWag7JVK25KWtaQFqmce1ZnNg`): build green — the original D98
   signature gone — but the first request died in edge middleware:
   `@clerk/nextjs: Missing secretKey`, 08:37:35 UTC runtime log. Scenario 2
   from the table above, exactly as predicted.
2. **Secret saved after that redeploy:** same verbatim error. This established
   the **env-snapshot rule**: a Vercel deployment bakes its environment at
   creation — a variable saved later never reaches an existing deployment.
   Save first, redeploy second, always.
3. **Final redeploy after the save:** `dpl_CfQwc68r4cdwHCcwjdKA8CJKaxVG`,
   commit `27fcd76`, READY 08:56:36 UTC 2026-08-15, build log clean, Clerk
   middleware and SSR completing, per-commit Vercel status success at
   08:59:59 UTC. **D98 closed on this evidence.**

**Accepted residual (Option C ruling, 2026-08-15):** the Clerk client widget
does not initialize on the ephemeral `*.vercel.app` host — the app renders its
`ClerkFailed` fallback. This is instance origin policy (the allowlist is
enabled and empty), not a build or server failure; dev-class keys alone do not
exempt an origin (D101 corrected the doc that claimed otherwise). No origin
entry is authorized while Production shares the development instance (D99).
Preview's proven coverage: build, Clerk server middleware, SSR, anonymous
browsing — the D96 class. Widget/hydration coverage waits on the post-D99
origin-allowlist or staging-domain decision.

**Incident during execution (D100):** at 23:07/23:11 UTC the production
controls were used instead of the Preview redeploy — the production aliases
briefly pointed at the unmerged #201 build. Restored via founder-authorized
empty commit `6cf98d0`, re-verified by health probe. Standing rule from the
2026-08-15 decisions-log entry: **production is never changed from the
deployments dashboard**; ship via merge to `main` only.

Checklist state: every box above is satisfied except the `/login` HTML check,
which is satisfied **server-side** (SSR emits the Clerk shell — the
split-brain that check existed to catch is ruled out); widget initialization
is the accepted residual.
