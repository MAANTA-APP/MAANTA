# Clearing the marketplace before Merchant 01 — evidence and apply packet

**Date:** 2026-08-25 · **Status:** investigation complete, **awaiting founder
authorization** · **Owner:** founder (production mutation)

Founder ruling 2026-08-24: demo mode OFF before Merchant 01 is shown the live
marketplace. A first independent merchant or shopper who sees a synthetic
marketplace contaminates the evidence the pilot exists to collect.

This document answers the three questions that had to be settled **before** any
production write, from production itself rather than from `docs/ops/demo-mode.md`.
Nothing here has been executed. **Claude has not mutated production.**

---

## The headline finding, which changes what the founder should expect

**With demo mode off, the marketplace serves 0 live deals — not 1.**

The briefing for this work said "~293 live synthetic deals against 1 non-demo".
The 293 is exact. The 1 is not: both non-demo deals are **expired**, so the
live count with the flag off is **zero**.

| | demo mode ON (now) | demo mode OFF |
|---|---|---|
| `deals_public_browse` | **293** | **0** |
| `merchants_public_browse` | **212** | **2** |

Measured 2026-08-25 against production by running the view predicate with the
demo clause forced false:

```
deals_browse_now  deals_browse_if_demo_off  merch_browse_now  merch_browse_if_demo_off
293               0                         212               2
```

The two non-demo deals:

| id | title | expired |
|---|---|---|
| `683e9951` | 75% Off All NFC Tags | 2026-08-17 |
| `5ab34941` | E2E2308 sweep deal (not a real offer) | 2026-08-24 21:16 UTC |

The two surviving merchants are the internal records classified in **D184** —
`bf66a041` SKANDI SKAN and `67fe233d` E2E Full Sweep Shop. Both stay visible
because they are `active`; neither has a live deal.

**This is correct, and it should not be diagnosed as a fault.** An empty
marketplace is the honest state of Node 0 before its first genuine merchant.
Merchant 01's own Deal 01 will be the first live deal on the platform. The
operator and the founder should both expect an empty feed the moment the flag
goes off, so that nobody "fixes" it by turning demo mode back on at the worst
possible moment.

---

## 1. What an anonymous caller gets with the flag off

**Nothing synthetic, through either read path.** Two separate mechanisms, both
verified, and they agree.

**SQL side.** The browse views carry the predicate themselves —
`pg_get_viewdef` from production:

```sql
-- deals_public_browse
... AND (NOT d.is_demo OR is_demo_mode()) AND (NOT m.is_demo OR is_demo_mode());
-- merchants_public_browse
... AND (NOT is_demo OR is_demo_mode());
```

With `is_demo_mode()` false these reduce to `NOT is_demo`. A deal is hidden if
**either** it or its merchant is synthetic.

**Grants.** An anonymous caller cannot go around the views. `anon` holds
`SELECT` on `deals_public_browse` and `merchants_public_browse` and on neither
base table — the D147 revoke, still in force:

| table | anon | authenticated |
|---|---|---|
| `deals_public_browse` | SELECT | SELECT |
| `merchants_public_browse` | SELECT | SELECT |
| `deals` | *(none)* | REFERENCES/TRIGGER/TRUNCATE only |
| `merchants` | *(none)* | REFERENCES/TRIGGER/TRUNCATE only |

**App side.** The shopper feed does not read the views — it reads base tables
through the service client, RLS bypassed — so it needs its own filter, and has
one. `withPublicMerchant` / `withPublicMerchantRows` in `src/lib/data.ts`
**default to excluding demo**; a surface can only show synthetic rows by passing
`{ includeDemo }`, which makes every demo branch greppable. `isDemoModeEnabled()`
resolves anything other than the exact string `true` — a typo, an empty value, a
missing key, an unreachable database — to **off**, and is deliberately uncached
so a warm server cannot keep serving synthetic data after the switch. The
`getLiveDeals` cache key includes the mode (`"demo"` / `"real"`), so flipping the
flag cannot be served a stale demo-mode cache entry.

**The one caveat that is not covered by the flag:** `MAANTA_DEMO_MODE` in the
app environment is a *second* switch governing analytics tagging only. It is
read from the server bundle and **changes only on redeploy**. Flag off + env
still set means genuine launch traffic is tagged `environment: "demo"` in
PostHog. It does not affect what a shopper sees. Move both together.

## 2. Does the reseed keep running?

**No. Both cron jobs no-op with the flag off** — read from `cron.job` and the
function bodies in production, not from the documentation. Note there are
**three** jobs, not the one the briefing mentioned:

| jobid | schedule | command | guarded? |
|---|---|---|---|
| 1 | `0 2 * * *` | `handle_trial_expiry()` | skips demo unconditionally |
| 2 | `7 * * * *` | `reseed_demo_flash_deals()` | **yes** |
| 3 | `30 2 * * *` | `refresh_demo_seed_deals()` | **yes** |

`reseed_demo_flash_deals()` opens `v_enabled := public.is_demo_mode(); IF NOT
v_enabled THEN RETURN 0; END IF;`. `refresh_demo_seed_deals()` opens
`IF NOT public.is_demo_mode() THEN RETURN 0; END IF;`.

So the ~70 deals/day stops the moment the flag flips. **No cron job needs to be
unscheduled**, which also means the demo environment is fully restorable by
flipping the flag back.

## 3. Do rows have to be retired as well as unflagged?

**No — and they should not be.** The flag alone produces a verifiably clean
marketplace (§1), and it is the only fully reversible option.

`wipe_demo_data(TRUE)` is a hard `DELETE`. Its retention rules are careful and
correct — audit-row survival is decided by the row's **subject**, never its
actor, so a demo shopper claiming at a real merchant's counter does not delete
that real merchant's guardian, fraud or ops record (migration
`20260730150000`, founder decision 2026-07-30 Option C) — but retention rules
make a wipe *safe*, not *undoable*. Once the 213 merchants, 2,276 deals, 341
users and 396 redemptions are gone, the rehearsal environment cannot be
reconstituted for a demo or an investor screenshot without re-seeding from
scratch.

Recommendation: **flip the flag, wipe nothing.** Revisit a wipe only if a
specific need appears — and note `make demo-wipe` already refuses to run while
demo mode is on, shows a dry run, and requires typing `wipe`.

Census at time of writing (`public.demo_data_census`):

| table | demo | real |
|---|---|---|
| merchants | 213 | 2 |
| deals | 2,276 | 2 |
| users | 341 | 12 |
| redemptions | 396 | 5 |
| merchant_transactions | 4 | 4 |

Every "real" number above is a **record** count, not a customer count — see
**D184** and the D174 counters in `CLAUDE.md`.

---

## The apply packet — for the founder, not for Claude

Claude does not run migrations or mutate production
(`docs/ops/supabase-migrations.md`). This is a one-row `UPDATE`, reversible by
running the opposite target.

**Step 1 — flip the flag.** From the repo root, against production:

```
make demo-off
```

or equivalently:

```sql
UPDATE public.app_config SET value = 'false' WHERE key = 'demo_mode_enabled';
SELECT public.is_demo_mode();   -- expect: f
```

**Step 2 — verify from the database.** Expect `0` and `2`:

```sql
SELECT (SELECT count(*) FROM public.deals_public_browse)     AS live_deals,
       (SELECT count(*) FROM public.merchants_public_browse) AS live_merchants;
```

**Step 3 — verify as an anonymous visitor.** **This step could not be run from
this session and is owed by the founder.** The sandbox proxy denies
`maanta.app`, `clerk.maanta.app` and the Vercel host (`CONNECT tunnel failed,
response 403`), and Chromium goes through the same proxy, so no browser check
was possible here. In a private window, signed out:

- `/feed`, `/browse`, `/map` and `/search` show **no deals** and an empty state,
  not synthetic ones.
- The **demo-data banner is gone** from the shopper and merchant shells.
- A search for a known demo title — e.g. `Abaya restock` or `Bakhoor gift box` —
  returns nothing.
- A known demo shop page (any `/shops/<demo id>`) no longer resolves publicly.

**Step 4 — the analytics twin.** Unset `MAANTA_DEMO_MODE` in the Vercel
environment and redeploy, or accept that genuine Node 0 traffic is tagged
`environment: "demo"` in PostHog until the next deploy. This does not affect
what a shopper sees.

**Rollback:** `make demo-on`. The rows were never deleted, so the rehearsal
marketplace returns intact.

---

## What was verified, and what was not

**Verified against production** (read-only): both browse view definitions; the
`anon`/`authenticated` grant matrix; all three `cron.job` rows and the demo
guard in both reseed function bodies; the demo/real census; the live-vs-off
browse counts; the expiry of both non-demo deals; the identity of both non-demo
merchants.

**Verified in the repo:** the app-side visibility helpers, the fail-safe
resolution in `isDemoModeEnabled()`, the mode-keyed cache, the wipe retention
migration, the `Makefile` targets.

**NOT verified — owed by the founder:** every browser-side check in Step 3. No
HTTP request to `www.maanta.app` was possible from this session. Nothing in this
document infers a rendered result from a database read.
