# Demo mode — review checklist

**PR:** https://github.com/MAANTA-APP/MAANTA/pull/128
**Branch:** `claude/demo-mode-node0-rt4bfy` → `main`
**Reviewer:** founder

Originally written for #127, which carried this work and the landing-page
redesign together. **The split happened** — the landing half stayed on #127 and
this is the demo-mode half. The two share zero files and merge independently.

This PR is a **sync-up**: the production database is already ahead of the app.
Five migrations are applied to `axrrslqssmbngbataejg`, demo mode is `true`, and
the deployed app knows nothing about any of it. Merging is what makes the flag
actually govern what the public sees.

Review it as a product decision, not an ops cleanup.

---

## 0. The split — done

Measured before doing it, not assumed: the two tracks touched **zero files in
common**, and all 10 demo-mode commits cherry-picked onto `main` with **0
conflicts**.

| Track | PR | Files |
|---|---|---|
| **Demo mode** (this) | #128 | 25 — `lib/data.ts`, `lib/demo-mode.ts`, `lib/analytics.ts`, `demo-mode-banner.tsx`, 3 layouts, 7 migrations, seed, tests, Makefile, docs |
| **Landing redesign** | #127 | 8 — `(public)/page.tsx`, `for-merchants/page.tsx`, `landing-early-access.tsx`, `waitlist-form.tsx`, `lib/waitlist.ts`, tests, brief |

Merge order does not matter. **This one is what production is waiting on** — the
mismatch between database and app is the more urgent of the two.

---

## 1. Demo-mode correctness

The property to convince yourself of: **synthetic rows are excluded unless
something explicitly asks for them, and every ambiguous state resolves to
launch behaviour.**

- [ ] **`src/lib/demo-mode.ts`** — `isDemoModeEnabled()`
      Only an exact `'true'` returns true. A missing key, empty value, typo or
      unreachable database all return **false**. Confirm the `catch` returns
      `false` and not `true`. This is the single most important line in the PR.
      Also check the comment explaining why it is *deliberately uncached* — a
      TTL cache would outlive the request and keep serving demo data after the
      switch was flipped off.

- [ ] **`src/lib/data.ts`** — `withPublicMerchant` / `withPublicMerchantRows`
      `includeDemo` defaults to **false**, so a caller who forgets the option
      gets launch-safe behaviour. Confirm the deals helper filters **both**
      sides (`is_demo` *and* `merchants.is_demo`) — a real deal hanging off a
      synthetic merchant must still be hidden.
      Every demo branch in the app is greppable. Verified counts:
      `grep -rn "{ includeDemo }" src/ | grep -v __tests__` → **6 call sites**
      (search ×2, shop page, BBS Mall counts ×2, `getDeal`), and
      `grep -rn "await isDemoModeEnabled()" src/ | grep -v __tests__` →
      **6 resolutions** (the banner plus one per surface, with `getLiveDeals`
      resolving once and threading it into all three rails).
      Anything beyond those is a branch worth asking about.

- [ ] **`src/components/demo-mode-banner.tsx`** + the three layouts
      `(public)`, `(shopper)`, `merchant/(app)`. Returns `null` when off, so
      there is no launch-mode footprint. Ask yourself whether three layouts is
      full coverage for the surfaces you would screenshot.

- [ ] **`src/lib/analytics.ts`**
      Reads `MAANTA_DEMO_MODE` from env, **not** the database — deliberate, so
      analytics never adds a query to the verify path. The cost is two switches
      instead of one. If that trade-off bothers you, this is the place to say so.

- [ ] **`supabase/tests/demo_mode_test.sql`**
      Scenarios A–G. Note the guard at the top: the suite **refuses to run**
      against any database holding demo rows that aren't its own fixtures,
      because F and G call `wipe_demo_data(TRUE)` which deletes *every* demo
      row. Passed in CI on this PR.

---

## 2. `20260729141000` — the billing-logic change

The one file worth reading line by line. It replaces `handle_trial_expiry()`,
which is frozen business logic.

- [ ] **Confirm the body is otherwise verbatim.** The claim is that only two
      `AND NOT is_demo` predicates were added. Verify it yourself:

```bash
diff <(sed -n '/CREATE OR REPLACE FUNCTION public.handle_trial_expiry/,/^\$\$;/p' \
        maanta-app/supabase/migrations/20260701111223_handle_trial_expiry_phase2.sql) \
     <(sed -n '/CREATE OR REPLACE FUNCTION public.handle_trial_expiry/,/^\$\$;/p' \
        maanta-app/supabase/migrations/20260729141000_demo_mode_isolation.sql)
```

Expect exactly two added lines. Anything else is a problem.

- [ ] **Confirm the skip is unconditional** — not gated on demo mode being on.
      A synthetic merchant is never a real subscription to manage, whatever the
      UI is currently showing.

- [ ] **Context for why this mattered:** the cron was live and had no demo
      predicate, so it was generating grace periods, `tier_flags` and
      `agent_tasks` against 213 fake merchants, landing in the admin queues
      indistinguishable from real ones.

- [ ] **This migration is already applied to production.** Reviewing it changes
      nothing about the database — it is already the live definition. What you
      are reviewing is whether to keep it.

---

## 3. Landing-page redesign

Moved to **#127** with the code. Two calls still sit with you there: whether the
redesign ships today, and whether the **KES 300 opening credit for the first 100
BBS Mall merchants** is still open — `/for-merchants` states it as a live offer.

Neither blocks this PR.

---

## 4. Production risk

**Already live, regardless of this PR:**
- 5 migrations applied, versioned to match their filenames
- `demo_mode_enabled = true`
- 213 tagged demo merchants, 339 synthetic redemptions
- **311 demo deals total** (291 seeded + 20 reseeded) of which **231 were live**
  when measured on 2026-07-29. Those two numbers count different things and are
  both quoted below, so run both rather than treating a difference as a fault:

  ```sql
  -- total tagged, whatever their state
  SELECT count(*) FROM public.deals WHERE is_demo;                 -- 311
  -- what a shopper could actually see: active, unpaused, unexpired
  SELECT count(*) FROM public.deals
   WHERE is_demo AND is_active AND NOT is_paused AND expires_at > NOW();  -- 231
  ```

  The gap is expired and inactive rows and moves on its own as deals age out and
  the hourly reseed tops up. **Re-run both at review time** — a stale expected
  value is worse than no expected value. Investigate only if the *total* drops
  (nothing should be deleting demo deals) or if the *live* count sits at 0 while
  demo mode is on (the reseed has stopped)
- `maanta_demo_reseed` cron, hourly at `:07`

**What merging changes:**
- The banner starts rendering
- `withPublicMerchant` starts excluding demo rows
- `make demo-off` becomes genuinely launch-safe *at the app layer* — today it
  is not, because the deployed app has no demo predicate at all
- The landing redesign goes live to the public

**What merging does not change:**
- Any database state. All migrations are already applied.
- Whether synthetic data is currently visible — it already is, undisclosed.
  Merging is what puts a banner on it.

**If you do not merge:** production keeps serving ~311 synthetic deals with no
disclosure, and the flag keeps having no effect. That is the status quo, not a
regression — but it is the thing this PR exists to fix.

**Rollback — read this before reverting.** A plain revert of the merge commit is
**not** neutral. It removes the app-layer filtering and the disclosure banner
while the demo rows stay in the database and `demo_mode_enabled` stays `true` —
which puts production back to serving synthetic data with nothing saying so.
That is the status quo this PR exists to end, so reverting into it should be a
decision, not an accident.

Safe order, if you need to revert:

1. `make demo-off` — flip `demo_mode_enabled` to `false`. The SQL browse views
   stop returning demo rows immediately, independent of any deployed code.
2. Optionally `make demo-wipe` (dry-run first) to remove the rows entirely.
3. *Then* revert the merge and let the deploy finish.
4. Smoke-check the public surfaces in §5 and confirm no synthetic data is
   reachable — that is what tells you the revert landed safely.

Database state is otherwise unaffected by the revert; each migration carries its
own rollback SQL in its header if you want to go further.

---

## 5. Post-merge verification

> **The banner was verified on a deployment — but not this branch's.**
> On 2026-07-29 14:25 UTC, `maanta-nuia-git-claude-maanta-plugin-setup-rt4bfy`
> served this code against the **production** database (where demo mode is
> already `true`) and the disclosure banner rendered: `role="status"`, rust on
> `bg-brand-tint`, "Demo mode — sample data for rehearsal. These shops, deals
> and codes are not real."
>
> That proved the thing worth proving — `isDemoModeEnabled()` reads the
> production `app_config` correctly from the app layer, so the read path is not
> theoretical. **But that branch has since been rewritten to the landing-page
> half and no longer contains any of this code**, so its preview URL is no
> longer evidence for this PR. Treat the banner check below as outstanding and
> re-run it against **#128's own preview** before demoing to anyone.
>
> **Also still unproven end-to-end:** the *toggle*. Flipping the flag off and
> watching the feed empty is covered by the DB views and by `visibility.test.ts`,
> but has not been exercised against a deployed build.

- [ ] **Wait for the production deployment to go `READY`** (target `production`,
      not a preview).
- [ ] **Banner renders.** Load `/` and `/feed` — the amber "Demo mode — sample
      data for rehearsal" strip must be visible while demo mode is on.
      **If it is missing, stop and investigate before showing anyone.**
- [ ] **Deal covers render.** Demo flash deals should show the SAMPLE / demo
      data placeholder, not a broken image.
- [ ] **The flag actually governs — on every public surface, not just `/feed`.**
      `/feed` is one of six. A regression in an untested surface passes a
      one-route check. With `demo_mode_enabled = true` each of these should show
      demo data; set it to `false`, reload, and each should show none.
      Set it back to `true` when done.
      **This is the check that proves the merge did what it was for.**

| Surface | With flag ON | With flag OFF |
|---|---|---|
| `/` (landing) | banner visible | no banner |
| `/feed` | demo deals in the rails | rails empty (or real deals only) |
| `/browse` + `/search?q=` | demo shops match | no demo shops match |
| `/shops/{demo-id}` | storefront + its deals render | 404 |
| `/deals/{demo-id}` | detail renders | 404 |
| `/malls/bbs-mall` | demo counts included | demo counts excluded |

- [ ] **Move both switches together, and check both directions.**
      `demo_mode_enabled` governs *visibility*; `MAANTA_DEMO_MODE` (Vercel env)
      governs *analytics tagging*. They are separate levers and can drift, which
      is the one thing to actively prevent — flag ON with the env unset means
      synthetic activity lands in PostHog **untagged**, inflating real numbers;
      flag OFF with it set means genuine launch traffic is labelled
      `is_demo:true` and gets filtered out of the numbers you care about.

      So: set `MAANTA_DEMO_MODE=true` in Vercel Production **and redeploy** in the
      same operation as turning demo mode on, and unset **and redeploy** in the
      same operation as turning it off. Verify by firing one event in each state
      and confirming `is_demo` and `environment` in PostHog match the state you
      are in. Failure is in the safe direction (untagged = today's behaviour),
      but it is still two levers, not one.
- [ ] **Confirm both cron jobs still active:**
      `SELECT jobname, active FROM cron.job;` → `maanta_demo_reseed` and
      `maanta_handle_trial_expiry`.
- [ ] **Update the runbook** — mark §3 verified once the banner is confirmed.

---

## Merge decision rule

Merge **if both hold:**
1. `ci` and `db-tests` are green.
2. §1 and §2 read correctly to you — especially the `handle_trial_expiry` diff.

The landing redesign is no longer a condition on this PR; it is #127.

**Immediately after merging, before anything else:** run `make db-push` for the
two pending migrations (`20260729170000`, `20260729180000`). Without 180000 the
hourly reseed saturates and the demo pool silently drains; without 170000 a
`make demo-wipe` can abort on a foreign-key violation. Neither is urgent within
the first hour, but both should land the same day.

**Note on approval:** the Cursor Approval Agent declined to auto-approve because
the Security Agent produced no signal — it completed in about a second with
`neutral`, which reads as "did not run" rather than "ran and objected". That is
a policy gate, not a finding. The PR needs your explicit approval; it will not
auto-merge on green.
