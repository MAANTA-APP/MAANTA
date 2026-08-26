# Production dark deploy — Fast Visit + Points schema, merchant QR + queue schema (2026-08-26)

**Session type:** controlled production migration + dark smoke, founder-authorized.
**Verdict: DARK DEPLOY: GO.** Schema is live, the feature is dark
(`fast_visit_enabled = 'false'`), the existing product is verified unregressed,
and the KES 30 verified-redemption money path is untouched.

Companion document: `docs/ops/rc-2026-08-26-fast-visit-qr-release-candidate.md`
(the pre-merge audit, merge order, rollback plan and smoke-test design this
session executed).

## What changed on production

| Step | Migration | Ledger entry | MCP-minted version, repaired |
|---|---|---|---|
| 103 | `20260826120000_fast_visit_points.sql` | `20260826120000_fast_visit_points` | minted `20260826182023` → repaired same session |
| 104 | `20260826130000_merchant_qr_queue.sql` | `20260826130000_merchant_qr_queue` | minted `20260826182152` → repaired same session |

The mint-and-repair pattern held **twelve for twelve** across the project's
MCP applies. Both applies used the byte content of `origin/main` (sha256 of
the 103 file verified identical between `origin/main` and the checkout before
the apply; both files hash-matched `origin/main` blobs).

**Final ledger: 104/104.** Full ordered version+name diff of
`supabase_migrations.schema_migrations` (104 rows, 104 distinct versions,
high-water `20260826130000_merchant_qr_queue`) against
`supabase/migrations/` on `origin/main` (104 files): exact match, no
duplicates, no forks, no gaps.

## Phase Zero (before any write)

- Working tree clean; `origin/main` = `413c8af` carrying all three merge
  commits (`a9bbd3f` PR A, `fb4d33a` PR B, `413c8af` PR C).
- Production ledger read back **102/102**, tail
  `20260824130000_redemptions_claimed_at`, exact ordered match with the repo's
  first 102 files.
- `fast_visit_enabled` was **absent** from `app_config` (dark by absence —
  the 103 migration seeds it `'false'`; a nuance vs the handoff's "remains
  false", recorded here, not drift).
- Baseline authority: exactly one overload each of `verify_redemption`
  (success-fee logic present), `claim_deal`, `onboard_merchant`; none of the
  new objects pre-existed.
- Statement-level review of both migration files: no statement touches
  `verify_redemption`, `claim_deal`, or any fee object.

## Migration 103 verification (read back from production)

- `redemptions.arrived_at` and `redemptions.fast_visit_qualified_at`: present,
  nullable, **no default**; **0 rows** hold either value — nothing backfilled.
- `reward_events`: RLS enabled, 2 SELECT-only policies (own/admin), UNIQUE
  `reference`, CHECKs on `reward_type` and `points > 0`; authenticated has
  SELECT only; anon nothing; 0 rows.
- `record_shopper_arrival` / `award_fast_visit_points`: SECURITY DEFINER,
  pinned search_path, EXECUTE only for service_role/postgres (anon and
  authenticated: no). D192 boundary live.
- Deployed bodies carry the D191 semantics: the gate + inclusive 15-minute
  rule are read **at arrival** and the verdict persisted; the award requires
  `fast_visit_qualified_at`, is row-locked, idempotent via `unique_violation`,
  and provably contains **no** `fast_visit_enabled()` call in executable code
  (the string's only occurrence is a comment line).
- `app_config`: `fast_visit_enabled = 'false'`, `fast_visit_points = '50'`;
  `public.fast_visit_enabled()` returns **false**.

## Migration 104 verification (read back from production)

- `merchants.qr_token`: text NOT NULL with CSPRNG default; **215/215**
  merchants hold valid distinct 32-hex tokens; unique index present.
- Token not client-readable: base-table SELECT on `merchants` denied to anon
  and authenticated (D147 held through the ALTER); `qr_token` appears in **0**
  browse views.
- `merchant_presentations`: RLS enabled, 2 SELECT-only policies, partial
  unique index on waiting rows, merchant/status/expiry index, status CHECK,
  3 FKs; authenticated SELECT-only, anon nothing, service_role full; 0 rows.
- Function surface unchanged: still exactly one overload each of
  `onboard_merchant`, `verify_redemption`, `claim_deal`. 215 merchants /
  353 users unchanged.

## Dark smoke (feature OFF)

**Deployment:** Vercel production deployment READY, built from `main` @
`413c8af`; `/api/healthz` → `{"status":"ok","commit":"413c8af","ref":"main"}`.

**HTTP (unauthenticated, via Vercel-side fetch — the session's egress proxy
blocks maanta.app directly):**

- `/` renders the marketing homepage: correct headline, no demo banner on a
  marketing route, no `{{TOKEN}}`, no Elite price string anywhere.
- `/qr/<32 zeros>` (well-formed unknown token): 200, shopper shell with the
  demo banner, signed-out scanner redirected `/login?next=/qr/…`. No 500.
- `/qr/not-a-token` (malformed): 200, renders the designed unavailable state
  ("This code doesn't match a MAANTA shop… You can still claim and redeem
  deals as usual") — this also exercises the live `qr_token` lookup path.
- `/merchant/redeem` signed out: serves sign-in with `next=/merchant/redeem` —
  the till stays auth-gated; the manual 6-digit keypad path is unchanged
  behind it.

**Live negative security tests (executed as the actual roles on production;
all seven DENIED with `insufficient_privilege`):**

1. `authenticated` EXECUTE `record_shopper_arrival` — denied
2. `authenticated` EXECUTE `award_fast_visit_points` — denied
3. `anon` EXECUTE `record_shopper_arrival` — denied
4. `anon` EXECUTE `award_fast_visit_points` — denied
5. `authenticated` SELECT `merchants.qr_token` — denied
6. `authenticated` INSERT `reward_events` — denied (no self-award)
7. `authenticated` INSERT `merchant_presentations` — denied (no forged check-in)

**Data reads:** `deals_public_browse` 248 rows (demo supply serving
discovery); redemption reporting reads real numbers
(failed=1, pending=8, success=394 — demo-dominated per D188; count field
evidence only by joining through merchant/deal); `reward_events` 0;
`merchant_presentations` 0; `fast_visit_enabled()` false.

Not testable without a signed-in human session (deferred to the founder's
device pass or the field script): ticket countdown rendering, `/you` rewards
row absence, an actual keypad verify on the demo instance. Nothing in this
session's evidence suggests regression there — PR A shipped days of green
vitest coverage on exactly those bands, and no server 500 appeared on any
probed surface.

## Production writes made this session (complete list)

1. `apply_migration` of `20260826120000_fast_visit_points.sql` (DDL as on main).
2. Ledger repair: minted `20260826182023` → `20260826120000`.
3. `apply_migration` of `20260826130000_merchant_qr_queue.sql` (DDL as on main).
4. Ledger repair: minted `20260826182152` → `20260826130000`.

Nothing else: no row of product data was inserted, updated or deleted (the
negative tests were denied by design; the smoke scratch table was a session
temp table). `fast_visit_enabled` was seeded `'false'` by the migration and
never flipped. No QR printed or distributed.

## Drift

None found. Two routine documentation follow-ups (not register rows):

- `CLAUDE.md` still reads "102/102" — bump to 104/104 (with D191/D192/D193
  cross-references) at the next authorized docs change.
- The RC report's §B apply-order section is now executed history.

## Rollback readiness

Unchanged from the RC report §D: revert the app merge(s) on main if needed
(each package UI/route-isolated); `fast_visit_points = '0'` stops new awards;
the gate stays `'false'` until the founder flips it; both migrations are
additive — leave schema in place rather than dropping on a money-adjacent
table.

## What remains founder-held

- Flip `app_config.fast_visit_enabled` to `'true'` (only when counter QRs
  physically exist at Node 0).
- Print/distribute the merchant counter QR.
- Begin the controlled Merchant 01 Fast Visit field test.
