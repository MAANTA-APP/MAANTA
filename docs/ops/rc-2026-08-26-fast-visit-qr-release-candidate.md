# Release candidate report — expiry-timing UX, Fast Visit + Points, merchant QR + queue

Date: 2026-08-26 · Author: Claude (release-engineering takeover session)
Scope: the three founder-authorized packages (decisions log 2026-08-26, second
entry). Nothing merged, nothing applied to production, no PR opened, demo mode
untouched, `fast_visit_enabled` still seeded `'false'` — every action in this
report that mutates production is founder-held.

## Verdict

**GO for founder release authorization**, with one process condition: the CI
`db-tests` job (real Supabase over the fresh chain) must run green on each PR
before its merge. This session verified the equivalent locally — a fresh
104-migration chain plus all 35 SQL suites on Postgres 16 with a
Supabase-shim (roles, `auth.*`, RLS, default privileges, storage/cron shims) —
but that is a mirror of the CI gate, not the CI gate. No browser/E2E run
(D172's golden-path gate remains unprovisioned; consistent with repo state).

## Baseline verified

- `main` = `b35d703` — unmoved since the branches were cut, so no drift-ID or
  migration-collision repair was needed on main's side.
- The three branches were fetched and matched the expected heads exactly
  (A `3189b75`, B `c7a3c3c0`, C `dacbaeaa`); ancestry as expected (A and B off
  main, C stacked on B). No PRs exist for any of the three.
- Production ledger per CLAUDE.md: 102/102, tail `20260824130000`. Both new
  migrations sit strictly above it (`20260826120000` < `20260826130000`), so
  ordering is safe and nothing reuses a taken version.

## The stack after this session

```
main b35d703
└── claude/pr-a-claim-expiry-timing  3189b75  (unchanged)
    └── claude/pr-b-fast-visit-points  4b7ed28  (restacked onto A + fix commit)
        └── claude/pr-c-merchant-qr-queue  7378835  (restacked onto fixed B)
```

B was restacked onto A because both edit `tickets/[id]/page.tsx` (A replaces
the server-timezone `hhmm()` with `absoluteTimeLabel`; B adds the Fast Visit
panel and reward block to the same regions). Stacking resolves the conflict
now, deterministically, and matches the release order: after A merges, B's PR
diff against main collapses to its own commits; likewise C after B.
Force-pushes used `--force-with-lease` against the exact audited heads.

## PR A — claim/expiry timing UX · `claude/pr-a-claim-expiry-timing` @ `3189b75` — **GO**

- 6 files: `claimed-code.tsx`, `tickets/[id]/page.tsx`, new
  `lib/claim-ticket-time.ts` + 2 test files, drift register (D190 opened and
  closed; D167 item 3 marked fixed). **No migration. Presentation only.**
- Verified against the checklist: authoritative expiry stays
  `redemptions.expires_at`; no expiry/grace/lifecycle change; the countdown
  now rolls `1449:12` into `1d 0h 9m 12s` while keeping visible ticking
  seconds in every band (the anti-screenshot device); absolute times render
  in Africa/Nairobi with an honest day word (today/tomorrow/yesterday/date)
  instead of the server's UTC + hardcoded "today"; the code card is untouched
  and dominant; merchant verification untouched.
- Gates (this session): lint ✓ · typecheck ✓ · vitest 1188/1188 ✓ · build +
  token/canonical/server-form guards ✓. No SQL touched; chain unchanged.
- Security review: nothing to find — no new inputs, no data-model change.

## PR B — Fast Visit + MAANTA Points · `claude/pr-b-fast-visit-points` @ `4b7ed28` — **GO**

Migration `20260826120000_fast_visit_points.sql`:
`redemptions.arrived_at`, `redemptions.fast_visit_qualified_at` (new — see
fix), append-only `reward_events` ledger (UNIQUE reference idempotency key,
RLS own/admin SELECT only, client writes revoked), `fast_visit_enabled()`
reader, `record_shopper_arrival`, `award_fast_visit_points`, config rows
`fast_visit_points` ('50') and `fast_visit_enabled` ('false' — **dark**).

### The merge-blocking bug, fixed (drift **D191**, opened and closed on the branch)

As inherited, qualification was decided at AWARD time from the CURRENT gate:
`record_shopper_arrival` stamped `arrived_at` with no gate check and
`award_fast_visit_points` read `fast_visit_enabled()` when called. So a scan
made while the feature was OFF became reward-eligible if the founder later
flipped it ON (retroactive qualification), and a shopper who qualified while
ON silently lost the earned reward if it was flipped OFF before staff
verified. Both directions violated the locked rule.

The fix (commit `4b7ed28`, smallest safe shape — the migration was revised in
place because it exists nowhere but this unmerged branch):

- `record_shopper_arrival` decides the whole qualification **at first
  arrival** — gate ON at that instant, `claimed_at` known, arrival ≤
  `claimed_at` + 15:00 (inclusive) — and persists the verdict as
  `fast_visit_qualified_at` in the same row-locked UPDATE that stamps
  `arrived_at`. Immutable ever after; a re-scan moves neither.
- `award_fast_visit_points` **requires the persisted verdict and no longer
  reads the gate at all**; the immutable timestamps are re-checked as
  belt-and-braces. `fast_visit_points = 0` remains the operator kill switch
  for new awards.
- The shopper panel and the check-in response report the persisted verdict;
  `lib/fast-visit-window` no longer exports any client-side eligibility
  predicate (a timestamps-only mirror cannot know whether the gate was on at
  arrival), and a test pins that no such export returns.

### Proof, run in this session (local harness mirroring CI db-tests)

- Fresh chain (103 migrations) + `fast_visit_points_test.sql`: **all
  scenarios pass** — A schema/RLS/grants; B+C full loop through the real
  RPCs (claim → arrival → verify → exactly one award; replay a no-op;
  merchant wallet unchanged by the award); D wrong merchant refused; E wrong
  shopper refused without an existence oracle; F **arrival-time boundary**:
  14:59 ✓, exactly 15:00 ✓ (inclusive, deterministic via transaction-stable
  NOW()), 15:01 ✗ with the late arrival still recorded as a normal check-in,
  `claimed_at` NULL never qualifies; G no arrival/unverified → nothing;
  H expired and non-pending refuse arrival; **I1** gate OFF → in-window scan
  → gate ON → re-scan (no upgrade) → real `verify_redemption` → **no award,
  zero ledger rows**; **I2** gate ON → qualifying scan → gate OFF → real
  verify → **award still lands, exactly one row**.
- Negative control: the same suite run against the **unfixed** migration
  fails (first at the missing column; with the column grafted on, at "the
  qualification verdict must be persisted at arrival") — the guard
  demonstrably bites on the old behavior.
- Live RLS probe: shopper reads only their own `reward_events`; another
  authenticated user reads zero rows, cannot INSERT, cannot execute the
  award RPC (insufficient_privilege on both).
- App gates: lint ✓ · typecheck ✓ · vitest 1217/1217 ✓ · build + 3 guards ✓.

### Security review (B)

All three functions are SECURITY DEFINER with pinned `search_path`
(`public, pg_temp`). Award executable by service_role/postgres only;
arrival by authenticated (own-claim check inside) + service_role; the gate
reader by anon too — a config-state disclosure of the same benign class as
`is_demo_mode()` (D153's family; noted, not a blocker). Idempotency is a
real UNIQUE constraint checked via `unique_violation` inside the function;
concurrent double-calls serialize on the FOR UPDATE row lock; balances are
derived SUMs. The KES 30 path: `claim_deal` and `verify_redemption` are not
re-issued (comment mentions only), the award moves no merchant money
(asserted in scenario B), and the verify route's award call is best-effort
try/catch with the merchant response byte-identical either way (vitest
pins this, including the RPC-throws case and guardian-blocked never
calling it). Historical `claimed_at` NULLs stay NULL and never qualify —
no D164 history fabrication, and `reward_events` deliberately carries no
`is_demo` (D188: demo-ness derives through the merchant/deal join).

## PR C — merchant QR + shopper queue · `claude/pr-c-merchant-qr-queue` @ `7378835` — **GO**

Migration `20260826130000_merchant_qr_queue.sql`: `merchants.qr_token`
(NOT NULL UNIQUE, 32-hex from pgcrypto CSPRNG — 128 bits, enumeration
hopeless), ephemeral `merchant_presentations` queue (RLS own/admin SELECT,
client writes revoked, one WAITING row per redemption via partial unique
index, ~10-minute TTL by `expires_at`, no cron). One comment updated this
session so the `fast_visit_eligible` snapshot column documents that it
mirrors the persisted arrival-time verdict (D191), not an award-time
re-derivation. Restacked onto fixed B; no code change needed — the check-in
route already consumes the RPC's `fast_visit_eligible` return, which now IS
the persisted verdict, so "You made it" can no longer promise points the
award will refuse.

### Threat model walked, with where each is held

- Malformed token → shape-checked (`^[0-9a-f]{32}$`) before any query;
  enumeration → 128-bit CSPRNG; suspended/hidden/shadow-banned shop →
  identical 404 to a wrong token.
- Merchant A's token + merchant B's claim → merchant resolved **from the
  token server-side, never the body**, and `record_shopper_arrival` enforces
  the same-merchant rule where the timestamp is written (SQL scenario D).
- Shopper A using shopper B's redemption id → RPC refuses with the same
  `arrival_claim_not_found` as a nonexistent id (no probe oracle, scenario E);
  the arrival RPC is called on the **authenticated** client so the DB-side
  ownership check is live (the route comment names the service-client trap).
- Expired / already-redeemed claim → typed refusals (scenarios H), mapped to
  410/409.
- Duplicate and concurrent duplicate scan → first-arrival-wins inside the
  RPC + partial unique index collapses the insert race into a renew (23505
  handled).
- Stale/cancelled/dismissed queue rows → status+TTL filtered in the staff
  query; a ticket verified since check-in drops via the join to the live
  redemption; queue expiry and dismissal touch the queue row only, never the
  claim (vitest pins the dismiss route's single-table write).
- Staff A on merchant B's queue → `requireMerchant("can_verify")` and the
  `merchant_id` predicate comes from the authenticated context on both read
  and dismiss (doubly scoped with the row id).
- Shopper calling merchant queue routes → refused by `requireMerchant`.
- PII → the staff payload is first name + last initial (`staffFacingName`),
  deal title, arrival time, eligibility, claim code — full name/phone/email
  never leave the server (vitest pins the minimisation).
- QR scan causing redemption or moving money → impossible by construction:
  the scan path touches `record_shopper_arrival` and the queue table only;
  tapping a queue row **navigates** to the existing keypad with the code
  pre-filled, and the flow from preflight on (resolve → fee disclosure →
  explicit Confirm → `verify_redemption`) is byte-for-byte the manual path.
  Manual entry keeps working unchanged — the keypad is seeded through the
  same state the keys write.
- Token exposure → not in either public browse view (SQL scenario B pins
  it), base-table merchant reads are revoked since D147, and the dashboard
  shows the QR link to the **owner** only.

Gates: lint ✓ · typecheck ✓ · vitest 1243/1243 ✓ · build + 3 guards ✓ ·
fresh 104-migration chain + **all 35 SQL suites green** (33 pre-existing —
money paths, guardian, browse views, demo isolation — plus the two new
ones), i.e. the two new migrations break nothing that was previously
guarded.

## A. Merge order (each on a green CI board, founder-authorized)

1. PR A (`claude/pr-a-claim-expiry-timing` → main).
2. PR B (`claude/pr-b-fast-visit-points` → main; diff collapses to its two
   commits once A is in).
3. PR C (`claude/pr-c-merchant-qr-queue` → main; collapses likewise after B).

## B. Migration apply order (human-run per repo rule; read the ledger FIRST)

1. Confirm `supabase_migrations.schema_migrations` still reconciles 102/102
   with tail `20260824130000` (D121 lesson — ledger, not directory).
2. Apply `20260826120000_fast_visit_points.sql` → repair the MCP-minted
   version to the repo filename **before anything else** (ten for ten so
   far) → read back: both new redemptions columns nullable/no-default,
   `reward_events` RLS + UNIQUE reference, award RPC not executable by
   authenticated, config rows present with `fast_visit_enabled = 'false'`.
3. Apply `20260826130000_merchant_qr_queue.sql` → repair version → read
   back: `qr_token` NOT NULL/UNIQUE/32-hex on all rows, no browse-view leak,
   `merchant_presentations` RLS + partial unique index.
4. Ledger target: **104/104 by version and name.**

Both migrations are additive (new columns/tables/functions/config); neither
rewrites an existing function, so applying before or after the deploy is
behaviourally safe — deployed code never references the new objects until
its own package deploys, and the new objects change nothing existing code
reads. Apply-then-merge (the D164 pattern) is recommended.

## C. Deployment order

Merge A → Vercel deploys → spot-check a ticket screen. Merge B → deploy →
verify nothing shopper-visible changed (gate dark). Merge C → deploy →
`/qr/<garbage>` renders the unavailable state; owner dashboard shows the QR
link. Production behaviour changes only when the founder flips
`app_config.fast_visit_enabled` — which stays OFF until counter QRs
physically exist at Node 0 and the founder authorizes.

## D. Rollback plan

- **App**: revert the offending merge on main (normal PR revert); each
  package is UI/route-isolated, so reverting C or B does not disturb A.
- **Feature**: set `fast_visit_enabled = 'false'` — reward UI and NEW
  qualifications stop instantly (already-persisted verdicts keep their
  earned awards, by design); set `fast_visit_points = '0'` to stop new
  awards outright without touching the gate.
- **Schema**: no destructive rollback needed or wanted — both migrations are
  additive; leave the columns/tables in place (empty and unread) rather than
  dropping on a money-adjacent table. `reward_events` rows are promotional
  only and carry no KES.

## E. Post-deploy smoke test (production, before the field script)

1. `/tickets/<pending>`: countdown shows humanised bands; times read in
   Nairobi wall clock; no Fast Visit panel (gate dark).
2. `/you`: no Rewards row (gate dark, zero balance).
3. Merchant keypad: resolve + verify a code exactly as before (demo
   instance), fee disclosure unchanged; confirm no reward row lands while
   dark **and** `arrived_at`/`fast_visit_qualified_at` stay NULL.
4. `/qr/<owner's real token>` signed out → login redirect; signed in with no
   claim → "no active claim" + shop link; `/qr/<32 zeros>` → unavailable.
5. `select count(*) from reward_events` → 0.

## F. Node 0 real-phone test script (when the founder turns it on)

1. Founder flips `fast_visit_enabled = 'true'`; print the owner-dashboard QR
   link as an entrance and a till sticker (same token).
2. Test shopper claims a deal → ticket shows the 15:00 reward countdown
   under the code.
3. Scan the printed QR on the phone → "You're checked in / staff will call
   your name" + "You made it" if inside the window; ticket now shows the
   arrived state; staff `/merchant/redeem` shows the queue row (first name +
   last initial, "Fast Visit" tag).
4. Staff taps the row → keypad pre-filled → resolve → fee disclosure →
   Confirm → verified; shopper success screen shows "+50 MAANTA Points";
   `/you/rewards` shows the balance and the arrival duration.
5. Repeat with a deliberate >15-minute wait → no reward language anywhere,
   claim redeems normally, no points.
6. Repeat a duplicate scan + a shopper cancel + a staff dismiss → claim
   unaffected in all three; manual code entry with the queue untouched still
   verifies.
7. Read back: exactly one `reward_events` row per rewarded redemption;
   KES 30 fee rows unchanged in shape. **Use test accounts — none of this is
   field evidence, and the two counters rule (D174/D184/D188) applies.**

## G. Known limitations (recorded, accepted for Node 0)

- **QR scan is check-in evidence, not proven physical presence** (§4 ruling):
  a photographed token can be scanned remotely. Every consequence is capped
  by staff verification — an arrival alone moves no money and awards no
  points. No geofencing/rotating-QR/attestation added, per the ruling. The
  residual: a shopper could remote-scan within 15 minutes to bank
  qualification, then arrive late and still collect points when staff
  verify. Points are non-cash promotion; accepted at Node 0 density, noted
  for the fraud review the day points matter.
- The queue hands `can_verify` staff the claim code before the shopper
  reaches the counter — deliberate (it feeds the existing keypad flow), same
  trust boundary as the shopper reading their code aloud; verify-anyway +
  dispute handling covers misuse, and it is tenant-scoped.
- `/qr/<token>` and the check-in flow are not behind `fast_visit_enabled` —
  unreachable in practice until a QR is printed, but a leaked token lets a
  shopper check in with no reward while dark. Harmless (queue entry only);
  flag if the founder prefers the whole surface gated.
- CI's real Supabase `db-tests` and Cursor Security Agent have not run on
  these branches (no PRs exist); the local harness mirrored db-tests
  faithfully but is not the authoritative gate. E2E golden path remains
  unprovisioned (D172, deferred).

## H. Remaining founder decisions

1. Authorize opening the three PRs (real CI on each) and the merge order in A.
2. Authorize the two production applies (B section) — Claude does not apply.
3. When to print QRs and flip `fast_visit_enabled` — field-day call; demo
   mode tension (2026-08-26 ruling) unchanged by this release.
4. Whether `/qr` should be gated behind `fast_visit_enabled` too (G, item 3)
   — current design says no; costless to add later.
5. `fast_visit_points` value — seeded 50, config-tunable, no code change.

## I. Recommendation

**GO FOR FOUNDER RELEASE AUTHORIZATION** — conditional only on the standard
process: real CI green per PR at merge time, applies founder-authorized and
ledger-repaired, feature dark until the founder flips it.
