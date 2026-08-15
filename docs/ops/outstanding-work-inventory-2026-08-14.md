# Outstanding-work inventory — 2026-08-14

**Mode:** Reviewer (read-only). **Nothing was merged, deployed, configured or
probed to produce this document.** Every claim below is either a direct
read-back from GitHub/Vercel/production HTTP, or is explicitly marked as an
inference or as unverified.

Purpose: replace the narrative summary of remaining work with measured state,
before any merge, device test, or live probe is authorized.

## 0. Connector status — the stated blocker does not exist

The task framing said the GitHub and Vercel connectors were disconnected and
had to be reconnected first. **Both are connected and answering in this
session.** No reconnection was needed, and none was performed.

| Service | Evidence |
|---|---|
| GitHub | `pull_request_read` and `list_pull_requests` returned live data for `MAANTA-APP/MAANTA` (PR #201 body, checks, statuses, comments) |
| Vercel | `list_teams` → `team_ryneBhGVyUrig0rN3JYsOSDo`; `get_project`, `list_deployments`, `get_deployment_build_logs`, `web_fetch_vercel_url` all returned live data for `prj_9ZcvFgpVsaUpP9hv2UlNoU5Sdw4c` (`maanta-nuia`) |

One real tooling gap: **the Vercel MCP surface exposes no environment-variable
read tool.** Deployment protection, projects, deployments and logs are
readable; env vars are not. Section 3's env-var conclusion is therefore an
inference from build behavior, and the confirming read must be done by a human
in the dashboard.

## 1. PR #201 — green on CI, red on Vercel, and behind `main`

`claude/pwa-real-device-checklist` @ `27fcd76`, docs-only (1 file, +312).

**Checks (read back 2026-08-14):**

| Check | Result |
|---|---|
| `ci` (lint · typecheck · test · build) | ✅ success |
| `db-tests` | ✅ success |
| CodeRabbit | ✅ success — "Mergeability Score: Minimal" |
| Cursor Approval / Security agents | neutral (not enabled) |
| Supabase Preview | skipped |
| **`Vercel` / `Vercel Deployments – MAANTA`** | ❌ **failure** — "1 required project failed to deploy" |

**Combined commit status: `failure`.** Human reviews: **zero** — `get_reviews`
returns `[]`. The only substantive comment is the author's own reviewer guide
asking a founder to confirm seven criteria; three of its self-identified gaps
were addressed in `27fcd76`, and no one has answered it.

**Two facts that change the recommended sequencing:**

1. **#201 is not independent of the Preview audit.** Its combined status is
   red *because of* the Preview failure. Ordering the Preview audit after the
   #201 merge assumes a green PR; #201 is not green. Whether the red status
   actually blocks the merge button depends on branch protection, which was
   not read.
2. **#201 is behind `main`.** Its base is `7b2b097`; `main` is now `a792ce6`
   (#205). The five intervening commits include **#200, already merged as
   `ee89b09`** — so #201's stated sequencing dependency ("do not run the final
   offline-copy verification until #200 is merged and deployed") is
   **satisfied**, and #200's offline wording is live in production
   (`a792ce6` is the commit the current production deployment was built from).

## 2. D93 — open, and the checklist that would close it is unmerged

`docs/maanta-drift-register.md:199`. D93 is open on two distinct things:

- **Repo-side, no decision needed:** padded raster icons at 192/512, a
  separate `maskable` entry with its own safe-zone artwork, and
  `apple-touch-icon` + `appleWebApp` metadata in `maanta-app/src/app/layout.tsx`.
  None of this is done, and **#201 does not do it** — #201 is the checklist
  only.
- **Device-side, blocking:** one Chrome-on-Android and one iOS-Safari
  measurement, recorded with date and build SHA.

The register requires **both platforms** to close the row. The checklist
document itself lives only on the #201 branch — it is not on `main`, so there
is currently no merged procedure for the device pass.

## 3. Vercel Preview — root cause found, and it is not code

**Every Preview deployment in the last 20 is `ERROR`. Every Production
deployment is `READY`.**

```
2026-08-14 07:49  READY   production  main
2026-08-14 06:25  ERROR   preview     claude/incident-drift-rows-d96-d97
2026-08-14 05:20  ERROR   preview     dependabot/.../next-16.3
2026-08-14 05:20  ERROR   preview     dependabot/.../vitest-4
2026-08-14 05:00  ERROR   preview     claude/clerk-strategy-ci-smoke
...  (10 further preview ERRORs, back to 2026-08-10)
```

The failures span docs-only branches and dependabot bumps alike. A defect that
fails a pure-markdown branch is environmental, not a property of any diff.

**Build log, deployment `CaRzQoMLXSLBcSbgVgm4tAX48X53` (#201's Preview):**

```
Error: @clerk/nextjs: Missing publishableKey.
    at Object.throwMissingPublishableKeyError (.../chunks/210.js:16:1487)
Export encountered errors on following paths:
	/(shopper)/deals/page, /(shopper)/notifications/preferences/page,
	/(shopper)/profile/page, /(shopper)/tickets/page, /(shopper)/you/help/page,
	/app-bootstrap/page, /demo/page, /merchant/onboarding/page,
	/onboarding/page, /otp/page, /select-mall/page, /verify-phone/page
Error: Command "npm run build" exited with 1
```

**Mechanism, traced through the repo:**

`maanta-app/src/components/auth/auth-providers.tsx:15` mounts `ClerkProvider`
only when `isClerkAuthClient()` is true, passing
`publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}`.
`maanta-app/src/lib/auth/strategy-client.ts:53` defines `isClerkAuthClient()`
as `explicitClientStrategy() === "clerk"` — it reads
**`NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` alone**, inlined at build time.

For the Preview build to reach `throwMissingPublishableKeyError`, ClerkProvider
must have mounted, so `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` resolved to `clerk`
in that build, while `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` resolved to
`undefined`. **Inferred Preview env shape: the strategy variable is set for
Preview (likely "All Environments"), the Clerk publishable key is scoped to
Production only.** Confirm in the dashboard before acting — this session cannot
read env vars.

Consistent with the diagnosis: with *no* auth env set, `DEFAULT_AUTH_STRATEGY`
is `supabase` (`strategy.ts:80`), ClerkProvider never mounts, and the build
succeeds — which is exactly why CI is green while Preview is red.

### Remediation proposal — approval required, nothing changed

Two options. **Recommendation: (A).**

**(A) Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (and `CLERK_SECRET_KEY`) to the
Preview environment.** Preview then builds and behaves like production.

- Cost: a Clerk key must be present in Preview. Use the **development**
  instance key that production is already serving (§4) — this adds no exposure
  that production does not already have.
- Benefit, and the reason to prefer it: D96 and D70 are both defects that
  *only* execute when both strategy vars say `clerk` — "production and nowhere
  else". A Preview that builds and runs the Clerk branch is the first
  pre-production environment that could have caught either. #204's CI smoke
  test covers strategy resolution; it does not render pages.

**(B) Set `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY=supabase` for Preview.** One
variable, no secret, Preview goes green immediately — but Preview then never
exercises the Clerk branch, permanently preserving the D96/D70 blind spot.
Cheaper now, and it re-buys the exact gap that produced the incident.

Either option is a Vercel dashboard change, not a code change. **No settings
were modified.**

## 4. Clerk — production is serving a *development* instance (confirmed)

Read back from `https://www.maanta.app/login`, 2026-08-14 15:00 UTC, HTTP 200:

- `data-clerk-publishable-key="pk_test_Y2hlZXJmdWwtc2FpbGZpc2gtMy5jbGVyay5hY2NvdW50cy5kZXYk"`
  — base64-decodes to `cheerful-sailfish-3.clerk.accounts.dev$`
- Clerk JS is loaded from `https://cheerful-sailfish-3.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js`
- Response header **`x-clerk-auth-reason: dev-browser-missing`** — a
  development-instance-only code path
- `x-clerk-auth-status: signed-out`

So the `pk_test_` usage is not a suspicion; it is measured, on the apex
production domain, on the current build. `.env.example:18` states the intended
production value is a `pk_live_…` key, so **the deployed state contradicts the
repo's own documented production configuration.**

The full task-4 assessment — capacity limits, test-email/SMS behavior, the
`public.users.clerk_user_id` identity consequences of a cutover, and the
rollback plan — is **not done** and is not attempted here. What is settled is
the premise it was to investigate: yes, production runs a development
instance today.

**Not yet established:** whether this is a deliberate pilot decision or an
oversight. The decisions log has no entry either way. That is a founder
question, not an engineering finding.

## 5. B2 — unchanged, still unapproved

`docs/ops/clerk-supabase-server-client-p0-2026-08-14.md:178`: steps 1–4 done,
**step 5 (the B2 till probe) unapproved and unexecuted**, deliberately not
represented as complete. D96 (`docs/maanta-drift-register.md:202`) says the
same in the same words: the merchant till is fixed at the shared factory and
CI-covered, but **not production-verified**.

Nothing in this session changed that, and no probe was performed.

## Recommended sequencing, revised

The original order was #201/D93 → B2 → Preview audit → Clerk. The measured
state argues for moving the Preview decision first:

1. **Decide the Preview remediation (§3).** It is the reason #201's combined
   status is red, so it gates the merge rather than following it. One dashboard
   change, no code.
2. **Answer #201's reviewer guide, update the branch to `main`, then merge.**
   The branch is 5 commits behind; #200 is already merged, so the sequencing
   caveat in #201's description is satisfied.
3. **Run the device checklist (D93).** Note it closes only the *measurement*
   half of D93 — the icon/metadata work is separate and untouched.
4. **B2**, as bounded: one invalid code, one submission, no retry, then a
   read-only log review.
5. **Clerk production-instance assessment**, informed by §4.

## Open decisions for a human

| # | Decision | Why it is not mine to make |
|---|---|---|
| 1 | Preview remediation (A) or (B) | (A) spends a key placement to close a known blind spot; (B) is cheaper and keeps the blind spot. A cost/risk trade, not a correctness question |
| 2 | Is production-on-`pk_test_` intentional? | No decisions-log entry exists either way |
| 3 | Merge #201 with a red Vercel status, or wait for green? | Depends on branch protection and on decision 1 |
| 4 | Authorize B2 | Live money-path surface; requires explicit founder authorization per the incident doc |

## Verification record

- **Read:** PR #201 (details, check runs, statuses, reviews, comments); open PR
  list; Vercel team/project/deployments; build logs for
  `CaRzQoMLXSLBcSbgVgm4tAX48X53`; `https://www.maanta.app/login` (HTTP 200);
  `strategy.ts`, `strategy-client.ts`, `auth-providers.tsx`,
  `app-bootstrap/page.tsx`, `.env.example`; drift rows D93/D94/D96/D97.
- **Not read:** Vercel environment variables (no MCP tool exists); branch
  protection rules; Clerk dashboard.
- **Not run:** no build, no test suite, no migration, no deployment.
- **Not changed:** no merge, no push to `main`, no Vercel setting, no Clerk
  configuration, no probe of any live route.

## Addendum — founder rulings received later on 2026-08-14

The open-decisions table above is superseded as follows:

1. **Preview remediation: Option A ruled** — publishable key to Preview scope
   only, one write, operator-executed, stop-on-failure, Option B explicitly
   rejected. Full authorization text, pre-verified preconditions and the
   outcome-interpretation table (including the split-brain scenario where a
   200 would mislead): `docs/ops/preview-auth-parity-option-a-2026-08-14.md`.
2. **Sequencing ruled**: Preview fix first (it gates #201), then rebase +
   merge #201, then the D93 device measurement — with the D93 icon/metadata
   work held apart as a distinct implementation task.
3. **B2 and the Clerk production-instance assessment: held** until #201/D93
   complete. Decision 4 (B2 authorization) therefore remains open by design.
4. Decision 2's premise ("no decisions-log entry exists either way") was
   accurate when written and is now tracked properly: **D98** (Preview env
   parity) and **D99** (production on the Clerk development instance) opened
   in `docs/maanta-drift-register.md`, and the ruling itself is recorded in
   `docs/maanta-decisions-log.md` (2026-08-14 entry). D99 also surfaced that
   the 2026-07-28 log entry and two status docs record an earlier `pk_live`
   read-back — so the dev-instance measurement contradicts prior recorded
   state, not just `.env.example` intent.

## Addendum 2 — resolution, 2026-08-15

**D98 is closed.** Preview builds and serves under the Clerk strategy: final
deployment `dpl_CfQwc68r4cdwHCcwjdKA8CJKaxVG` (commit `27fcd76`), READY
08:56:36 UTC 2026-08-15, build clean, Clerk middleware and SSR completing —
after the founder-approved secret-key extension and the env-snapshot lesson
(save the variable first, redeploy second). The Clerk client widget on the
ephemeral `*.vercel.app` host remains an **accepted limitation** under the
Option C posture (decisions log, 2026-08-15) — no strategy change, no Clerk
domain/origin change, no staging domain, no allowlist entry while Production
shares the dev instance.

The remediation also surfaced two rows, both opened and closed 2026-08-15:
**D100** (production aliases briefly pointed at the unmerged #201 build via
dashboard redeploy/promote — restored to `main`, no-manual-promote rule now
explicit) and **D101** (the dev-keys claim in
`docs/skills/get-started-blank-screen-fix.md`, corrected).

Sequencing now: #201 branch-update → founder review → merge → D93 device
measurement. **B2 and the D99 assessment: unchanged, held.**
