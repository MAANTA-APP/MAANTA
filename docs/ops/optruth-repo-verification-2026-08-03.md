# optruth — repo-side verification (2026-08-03)

**Companion to the Notion page "MAANTA optruth — production verification
(2026-08-03)".** That page verified live Supabase, Vercel, Sentry and the public
site, and was explicit about its own limit:

> **Coverage limit — read this before trusting any repo claim below.** The
> session that produced this page had **no GitHub access** … Nothing here was
> read from the repo.

This document is the other half. Everything below was read from the repo at
`main`/`origin` and from the live systems where noted. It resolves three of that
page's six next-actions, corrects one of its factual claims, and leaves the
remaining three where they belong — with a human.

**Method:** repo read at `origin/main` (`1826dc5`), git history, and the GitHub
API. Not re-derived from Notion.

---

## Verdict on the six next-actions

| # | Action | Status after this pass |
|---|---|---|
| 1 | Point production back at `main` | **Human.** Open as drift **D79** |
| 2 | `supabase db push` on production | **Human.** Claude does not run migrations. Open as **D25** |
| 3 | Decide `demo_mode_enabled` | **Human.** Product call, not a repo change |
| 4 | Triage the `/verify-phone` Sentry error | **Done — it was a live bug. Fixed, D80** |
| 5 | Re-derive the landing order from the repo | **Done — derived below** |
| 6 | Do the 93 seeded Elite trials consume real slots? | **Done — no, they do not** |

---

## 4 · `/verify-phone` — live bug, not a dead path

The page asked: *"Either it's a dead code path (then delete it) or the phone gate
has a live Clerk/Supabase token-mode mismatch (then it's a pilot blocker)."*

**It is the second, and the Sentry error was the smaller half of the problem.**

The mechanism, end to end:

1. `src/app/verify-phone/page.tsx` was `"use client"` in its entirety and gated
   on `phoneOtpEnabled()`.
2. `phoneOtpEnabled()` is `isClerkAuth()` — true only when **both**
   `MAANTA_AUTH_STRATEGY` and `NEXT_PUBLIC_MAANTA_AUTH_STRATEGY` are `clerk`.
3. Next.js inlines only `NEXT_PUBLIC_*` into client bundles. The server-only
   variable reads `undefined` in a browser, so **the gate was false on every
   hydration, production included.**
4. The page therefore always rendered its Supabase branch, whose
   `SupabaseSignedIn` calls `supabase.auth.getSession()`.
5. In Clerk mode `createClient()` builds that client with the `accessToken`
   option, and `getSession()` on such a client throws.

That throw is Sentry `JAVASCRIPT-NEXTJS-4` verbatim. But the silent cost is
larger: **the Clerk phone-OTP flow never rendered at all**, on the surface a
shopper must pass to claim a deal. Server-side render took the Clerk branch;
hydration replaced it with the Supabase one.

The repo's own `auth-strategy.test.ts` already encoded the truth —
*"does not enable clerk when only the public var is clerk"* is exactly the
browser's condition. The page simply called a server-only helper from a client
bundle.

**Fixed:** `page.tsx` is now a server component that evaluates the gate where
both variables are readable, rendering client children from
`verify-phone-client.tsx`. The both-vars rule is **preserved, not relaxed** —
deciding on the server is what makes it enforceable. Guarded by
`maanta-app/src/lib/__tests__/client-server-env-boundary.test.ts`, mutation-proven
against the pre-fix shape. Recorded as **D80**.

> **Note for the Sentry triage:** the issue should not be resolved on the
> strength of this fix alone until a real Clerk-mode browser hits
> `/verify-phone` and the OTP form renders. The fix is verified by build and
> guard, not yet by a live pass.

---

## 5 · The landing order, re-derived

The page flagged `#148 → #137 / #143 / #94 / #131` as stale and said re-deriving
it "needs someone with GitHub access". Derived from `origin/main` history and the
GitHub API:

| PR | Notion says | Actually |
|---|---|---|
| **#148** | head of the landing order | **Closed without merging**, 2026-07-30. Not in `main` history |
| **#137** | pending | **Merged** — `b0be812` |
| **#143** | pending | **Open** (not draft), created 2026-07-30 |
| **#94** | pending | **Open** (not draft), created 2026-07-26 |
| **#131** | pending | **Open** (not draft), created 2026-07-29 |

**The order is not merely stale — its head is gone.** #148 was closed unmerged,
so the sequence it anchored no longer describes anything, and #137 has already
landed.

**How far the three survivors have been overtaken:** 18 PRs merged into `main`
since #148 closed — `#151, 152, 154, 155, 156, 157, 158, 159, 160, 161, 162,
163, 164, 165, 166, 167, 169, 170`. `main` is at `1826dc5` ("Sync docs with code
reality (#170)"). Any of #143 / #94 / #131 will need rebasing before it means
anything, and #94 in particular is eight days and thirty-odd merges behind.

Also open, not in the Notion order at all: **#168** (this session's audit
branch), plus #132, #102, #99, #56, #35 and nine drafts.

**Recommendation, not a decision:** rather than re-sequencing five PRs, close or
rebase #94 and #131 explicitly. A landing order whose head was closed four days
ago is costing more to maintain than it is worth.

---

## 6 · Seeded Elite trials do **not** consume real slots

The page asked whether the 93 seeded `elite_trial_active` grants eat into the
frozen first-100 BBS offer. **They do not**, and the schema says so twice
independently — `20260730130000_enforce_elite_trial_first_100_cap.sql`:

```sql
-- elite_trial_cap_status(): the count itself
SELECT COUNT(*) INTO v_granted
  FROM public.merchants
 WHERE elite_trial_granted_at IS NOT NULL
   AND node = v_launch_node
   AND is_demo = FALSE;          -- demo rows never enter the count
```

```sql
-- elite_trial_slot_available_for(): eligibility short-circuits before the count
IF COALESCE(p_is_demo, FALSE) THEN
  RETURN TRUE;                   -- "Rehearsal data is not the launch offer
END IF;                          --  and is not capped by it."
```

So a seeded trial neither consumes a slot nor is blocked by an exhausted cap.
**All 100 real slots remain available.**

Where the worry came from is worth fixing: the `app_config` note the page quoted
says only *"Counted against `merchants.elite_trial_granted_at`, which is never
cleared, so a slot is consumed for good"* — true, but it omits the demo
exclusion, which is the part that answers the question. The two function
`COMMENT`s do state it. The config-key note is the one a reader hits first.

**Confidence that this is live, not just in-repo:** the migration is
`20260730130000`, below production's newest applied version (`20260730160000`),
and it is the migration that inserts the `elite_trial_merchant_cap` key the
optruth page read as `100` from live `app_config`. Its presence there is evidence
the migration applied.

---

## Correction to the optruth page: there is no `170000`

The page's verdict says "`170000` / `180000` absent — the pause gate is not
live", and §2 reasons about "whatever `170000` adds".

**No `20260730170000` exists in this repo**, and no `20260730160000` does either.
Migrations at or after `20260730150000` are, in full:

```
20260730150000_demo_wipe_audit_trail_retention.sql
20260730180000_restore_claim_deal_pause_gate.sql
20260730190000_paused_deals_discovery_filter.sql
20260802120000_nodes_registry.sql
```

So:

- **The pause gate is `180000` + `190000`**, not `170000`/`180000`. Both are
  absent from production, so the page's *conclusion* is right — a paused deal
  still accepts claims in production — but the version numbers naming it are not.
- **The unapplied set is three files, not two:** `180000`, `190000`, and
  `20260802120000_nodes_registry.sql` (added 2026-08-02, tracked as **D72**).
- Production's `160000 = correct_success_fee_config_notes` is not a new finding.
  It is **D24**, open since 2026-07-30: prod's ledger and this repo disagree
  about which migration each version number *is*. The page rediscovered D24 from
  the live side, which is a useful independent confirmation.

Applying the nodes migration takes `ShareRowExclusive` on `deals` and
`merchants` — measured, not assumed — so it blocks claims briefly while browse
and feed keep serving. Pick a quiet counter moment, not a maintenance window.

---

## Still human-only

1. **Production serves an open PR branch** (**D79**). Merge #168 or roll back to
   the newest `main` deployment. Verify by re-reading the Vercel deployment and
   confirming `githubCommitRef` is `main` — and compare **trees, not SHAs**, since
   a squash merge mints a new SHA.
2. **`supabase db push`** — three unapplied migrations above. Claude does not run
   migrations against production (`docs/ops/supabase-migrations.md`).
3. **`demo_mode_enabled = true`** in production. A product call. Note it is a
   database row, not an env var, so it cannot be checked by reading `.env` —
   `make demo-status`.

---

## Last updated

2026-08-03 — repo read at `origin/main` `1826dc5`; live checks as cited.
Cross-references: **D24**, **D25**, **D72**, **D79**, **D80**.
