# Demo mode

**Status:** implemented 2026-07-29, **not yet applied to production**
**Owner:** founder
**Switch:** `app_config.demo_mode_enabled` (default `false`)

Demo mode makes MAANTA look like a working marketplace during rehearsals,
screenshots, investor demos and onboarding previews — and switches off cleanly
before launch, taking its synthetic data with it.

---

## Why this exists

An audit of the live project on 2026-07-29 found:

| Table | Synthetic | Real |
|---|---|---|
| merchants | **213** | **0** |
| deals | **291** | **0** |
| users | 221 | **7** |
| redemptions | 5 | 0 |
| merchant_transactions | 4 | 0 |
| leads (waitlist) | — | 0 |

Every merchant and deal was already synthetic, from three seed batches
(`node0_rehearsal_seed.sql`, `node0_100_deals_seed.sql`,
`nairobi_nodes_150_merchants.sql`). They were distinguishable only by a
**UUID-prefix convention documented in each seed header** — `c0…`, `c1…`, `c2…`
for merchants, and so on.

A naming convention is not queryable. Nothing in app logic, cron, analytics or
admin views could tell synthetic rows from real ones. Two consequences were
already live:

1. **Real launch data would have landed indistinguishably** alongside 213 fake
   merchants, with no way to separate them afterwards.
2. **`handle_trial_expiry` was managing fake merchants.** The cron job is
   scheduled and had no demo predicate, so grace periods, `tier_flags` rows and
   `agent_tasks` were being generated against synthetic merchants and landing in
   the admin queues looking exactly like real ones.

Demo mode replaces the convention with explicit, indexed, queryable state.

---

## Architecture

```
app_config.demo_mode_enabled ──┬── SQL:  public.is_demo_mode()
   (single source of truth)    └── App:  lib/demo-mode.ts isDemoModeEnabled()
                                             │
   is_demo / demo_batch_id / demo_source     │
   on 5 tables                               │
        │                                    │
        ├── browse views (deals_public_browse, merchants_public_browse)
        ├── app visibility helpers (withPublicMerchant/-Rows)
        ├── handle_trial_expiry  → skips demo unconditionally
        ├── reseed_demo_flash_deals() → hourly pg_cron, demo-scoped
        └── wipe_demo_data()     → the launch off-switch
```

**Fail-safe in one direction.** Only the exact string `true` enables demo mode.
A typo, an empty value, a missing key or an unreachable database all resolve to
**off**. Showing real data during a demo is a cosmetic disappointment; showing
synthetic data at launch is a credibility failure — so every ambiguous state
resolves toward launch behaviour.

---

## Schema changes

Migration `20260729140000_demo_mode_tagging.sql`:

| Column | Type | Meaning |
|---|---|---|
| `is_demo` | `BOOLEAN NOT NULL DEFAULT FALSE` | The predicate everything filters on. NOT NULL so a forgotten value can never read as "maybe real". |
| `demo_batch_id` | `UUID` | Groups one seeding run, so a single batch can be wiped or audited alone. |
| `demo_source` | `TEXT` | Which generator produced it (`nairobi_150`, `autoreseed`, `demo_activity`…). Survives into analytics exports. |

Applied to: **`users`, `merchants`, `deals`, `redemptions`,
`merchant_transactions`** — plus partial indexes (`WHERE is_demo`) so both
"give me the real rows" and "give me all the demo rows" stay cheap.

**Backfill** tags the three shipped batches by UUID prefix. It is written as an
**allowlist** of known-synthetic prefixes, never a denylist, so a row can only
become demo by matching a batch we shipped. Deals and redemptions hanging off a
demo merchant are tagged by inheritance, which catches rows created by hand
during rehearsal.

New `app_config` keys: `demo_mode_enabled` (false), `demo_flash_deal_floor`
(12), `demo_flash_deal_ceiling` (40).

---

## Behaviour

### Seeding
- Merchants and deals: the three existing seed files (unchanged).
- Activity history: `supabase/seed/demo_activity_seed.sql` backfills ~a week of
  verified redemptions so verified-counts aren't all zero. **Inserted directly,
  not via the redemption RPCs** — those debit wallets, record arrears and fire
  Guardian, none of which should happen for synthetic history. These rows are
  inert records, not simulated money movements.
- Re-running replaces its own batch rather than stacking.

### Reseed
`reseed_demo_flash_deals()`, hourly via pg_cron at `:07`:
- No-ops entirely unless demo mode is on.
- Fires only when live demo flash deals fall **below the floor** (12); tops up
  toward the **ceiling** (40).
- Caps **2 live flash deals per merchant**, so the pool is bounded by
  `eligible demo merchants × 2` regardless of the ceiling.
- Staggered expiries (2–14h) and staggered "posted" times, so the feed shows a
  natural spread rather than a wall of identical timers.
- Skips a title already live on that merchant.

### Isolation
- **Browse views** and the **app visibility helpers** hide demo rows unless
  demo mode is on. Real rows are never hidden by this, in either state.
- **`withPublicMerchant` / `withPublicMerchantRows` default to excluding demo.**
  A surface can only show synthetic rows by passing `{ includeDemo }` — which
  makes every demo branch greppable for `includeDemo:`.
- A deal is hidden if **either** it or its merchant is synthetic.
- **`handle_trial_expiry` skips demo merchants unconditionally** — whether or
  not demo mode is on, because a synthetic merchant is never a real
  subscription to manage.

### Disclosure
`DemoModeBanner` renders on the shopper, merchant and public layouts whenever
demo mode is on, and renders *nothing* when it's off. A screenshot taken during
a rehearsal carries the disclosure with it.

### Analytics
Server events carry `is_demo` and, in demo mode, `environment: "demo"` — set
from `MAANTA_DEMO_MODE` in the app environment rather than a database read,
because analytics is best-effort and must never add a query to the verify path.

---

## Commands

| Command | What it does |
|---|---|
| `make demo-status` | Whether demo mode is on + demo/real row counts per table |
| `make demo-on` | Enable demo mode |
| `make demo-off` | Disable demo mode (data stays, becomes invisible) |
| `make demo-seed` | Seed demo activity history |
| `make demo-reseed` | Force a flash-deal top-up now |
| `make demo-wipe` | Dry-run, then prompt, then delete every demo row |

All target `DATABASE_URL` if set, otherwise the local stack.

Direct SQL equivalents:

```sql
SELECT public.is_demo_mode();                 -- is it on?
SELECT * FROM public.demo_data_census;        -- demo vs real counts
SELECT public.reseed_demo_flash_deals();      -- returns deals created
SELECT * FROM public.wipe_demo_data();        -- DRY RUN (default)
SELECT * FROM public.wipe_demo_data(TRUE);    -- actually delete
```

---

## Launch cleanup checklist

Run in order. Every step is verifiable — do not tick from memory.

- [ ] **1. Turn demo mode off**
      `make demo-off` → confirm `demo_mode_on` is `f`.
- [ ] **2. Unset the analytics flag**
      Remove `MAANTA_DEMO_MODE` from the Vercel production environment
      (or set it to `false`). Redeploy so the change takes effect.
- [ ] **3. Review what will be deleted**
      `make demo-status` → note the demo row counts.
- [ ] **4. Wipe**
      `make demo-wipe` → review the dry run, type `wipe`.
- [ ] **5. Verify the census is clean**
      `make demo-status` → **every `demo_rows` value must read 0.**
- [ ] **6. Unschedule the reseed job**
      `SELECT cron.unschedule('maanta_demo_reseed');`
      Confirm: `SELECT jobname FROM cron.job;` no longer lists it.
      (The job self-disables via the demo-mode check, so this is belt-and-braces —
      but an unscheduled job cannot be re-enabled by someone flipping the flag.)
- [ ] **7. Confirm the trial cron is still scheduled**
      `SELECT jobname, active FROM cron.job;` → `maanta_handle_trial_expiry`
      must still be present and active. Step 6 must not have removed it.
- [ ] **8. Check the public surfaces by eye**
      Load `/`, `/feed`, `/malls/bbs-mall` → no demo banner, no synthetic shops,
      counts reflect real merchants only.
- [ ] **9. Confirm real data survived**
      `SELECT count(*) FROM public.users WHERE NOT is_demo;` → the 7 real users
      (plus anyone who signed up since) must still be there.

**Optional, after a clean launch:** drop the tagging columns entirely with the
rollback in the migration header. Not required — the columns are inert once
every row is `is_demo = false`, and keeping them means a future rehearsal
doesn't need the migration again.

---

## Risks and caveats

**Not applied to production.** All three migrations are written and tested but
have not been pushed. `make db-push` is human-run against
`axrrslqssmbngbataejg` by design.

**The backfill asserts an audit that may have aged.** It tags exactly the three
UUID prefixes measured on 2026-07-29 and raises a `NOTICE` listing any merchant
left untagged. If a real merchant has signed up since, it will correctly be
left alone — but read that notice rather than assuming.

**Two sources for the demo flag.** `app_config` drives data visibility;
`MAANTA_DEMO_MODE` drives analytics tagging. They can drift. The consequence of
drift is mild in the safe direction (events tagged `is_demo:false` during a
rehearsal — the same state as today) and the checklist clears both.

**Demo data is visible to anyone while demo mode is on.** The switch is global,
not per-session. There is no "demo for me, real for everyone else" — a public
visitor during a rehearsal sees the synthetic marketplace, with the banner.

**No testimonials or reviews were added.** Fabricated endorsements are not worth
the risk even behind a flag, and none of the app surfaces needed them to look
populated. The trust strip on the landing page still carries **no numbers** for
the same reason — see `docs/maanta-landing-page-redesign-brief.md`.

**Reseed cannot reach the floor with a small merchant pool.** With the
per-merchant cap of 2, the pool maxes at `eligible demo merchants × 2`. Below
the floor it will run hourly and create 0 — harmless, but it means the floor is
a target, not a guarantee. With 213 demo merchants this is not a live concern.

---

## Verification performed

Against Postgres 16 with a fixture mirroring the measured production prefix
distribution:

- Backfill tags 213 merchants and 292 deals (291 + 1 caught by inheritance)
  while preserving all 7 real users.
- `is_demo_mode()` returns true only for `true`/`TRUE`/`" true "`; `1`, `yes`,
  empty and a missing key all return false.
- Browse views: demo mode off → real rows only; on → real + demo. Real rows
  never hidden in either state.
- `handle_trial_expiry`: real merchant processed, 3 demo merchants skipped, no
  `agent_tasks` or `tier_flags` generated for them.
- Reseed: no-ops when off; when on, every created row is `is_demo` and attached
  only to demo merchants; saturates at the per-merchant cap and then returns 0
  indefinitely.
- `wipe_demo_data()`: dry run changes nothing; confirmed run removes all demo
  rows and leaves every real row intact.

`supabase/tests/demo_mode_test.sql` pins all six properties for CI, and asserts
in both directions — that real rows are unaffected by every demo code path, not
just that demo rows behave.

**Two bugs were found this way and fixed:** reseed grew without bound when the
merchant pool was smaller than the floor (now capped per merchant), and the
`anon`/`authenticated` grants needed those roles present.
