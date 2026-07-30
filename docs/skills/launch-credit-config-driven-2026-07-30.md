# Skills: the Node 0 opening credit is config-driven copy

Date: 2026-07-30 · Session mode: **Builder** · Branch: `claude/maanta-role-hardening-62ut64`

## What was wrong

Closing drift D-12 established the rule: **a public offer must be backed by
config or policy before it is advertised.** The Elite launch offer failed that
test outright — nothing backed it — so it was withdrawn.

The Node 0 opening credit is the opposite case, and that is what made it easy to
miss. It *is* fully governed: an `app_config` key, a decisions-log entry, and a
grant written inline in `activate_merchant`. **Only the copy was ungoverned.**

`activate_merchant` grants the credit only when four gates pass
(`20260716084804_node0_opening_credit_on_activation.sql`):

| Gate | Key |
|---|---|
| A positive amount | `node0_opening_credit_kes` |
| Inside the launch window | `node0_launch_period_ends_at` |
| Under the merchant cap | `node0_opening_credit_merchant_cap` |
| The merchant is at the launch node | `node0_launch_node` |

`/for-merchants` hardcoded two of those values:

```ts
const OPENING_CREDIT = 300;
const OPENING_CREDIT_CAP = 100;
const CREDITED_REDEMPTIONS = Math.floor(OPENING_CREDIT / SUCCESS_FEE);
```

So the page kept promising **"First 100 shops start with KES 300 credit"** —

- after ops retuned the amount or the cap (the gate is live; the copy was not);
- after `node0_launch_period_ends_at` passed;
- after the 100th merchant was credited; and
- even with the promo switched off by setting the amount to 0, which the
  migration explicitly documents as the kill switch.

The previous comment in the file *named* this risk — *"pull it once the window
closes or the cap fills, or a merchant reads a promise the product will not
keep"* — and left it as a manual chore nobody was assigned. A merchant walking in
on the promise of KES 300 and being activated with a zero balance is a trust
failure at the worst possible moment.

## What changed

`src/lib/launch-credit.ts` is the single home for the rule, split the way
`feed-sections.ts` and `topup-settlement.ts` are: a **pure** decision function
plus a thin server read.

```ts
launchCreditOffer(config, creditedCount, now)
  → { live: true, amountKes, merchantCap, launchNode, windowEndsAt }
  | { live: false, reason: "disabled" | "window-closed" | "cap-filled" | "unavailable" }
```

It mirrors the SQL `IF` block condition for condition, including the boundary:
the SQL is `NOW() < v_launch_end`, so the offer closes **at** the timestamp, not
after it. `getLaunchCreditOffer()` reads the four keys in one query, counts
credited merchants only when a cap exists, and hands both to the pure rule.

The page is now an async server component that renders **from** the offer. Both
promo blocks — the hero pill and the "your first N are on us" card — are behind
`offer.live`, so they vanish together the moment the gate stops granting.

### Fail closed, always

Every uncertain path resolves to **showing nothing**:

| Situation | Result |
|---|---|
| Config read errors | `unavailable` — no promo |
| Cap set but uncountable | `unavailable` — a cap we can't measure is assumed full |
| `node0_launch_period_ends_at` unparseable | `unavailable` — junk is not a licence to advertise forever |
| Amount missing or junk | `disabled` — never falls back to the frozen 300 |
| Service client unavailable (no env) | `unavailable`, and the page still renders |

That last row matters: the read is wrapped so a config outage costs a marketing
line, never the whole public page. The asymmetry is deliberate — **failing to
show a real offer costs a conversion; showing a withdrawn one costs trust.**

Two copy edge cases fall out of the same principle:

- **Uncapped promo** (`merchantCap: null`) drops the "first N" claim — *"New
  shops start with KES 300 credit"* — rather than inventing a cap.
- **A credit too small to cover one redemption** (say KES 20 at a KES 30 fee)
  keeps the card but drops the derived headline, because *"your first 0 are on
  us"* is worse than saying nothing. `creditedRedemptions` floors, so a partial
  redemption is never counted as one.

The one gate the page **cannot** evaluate is `merchants.node = node0_launch_node`
— a visitor has no merchant row yet. So the copy names the launch node from
config (*"the first 100 shops we activate at BBS Mall"*) rather than implying
every shop anywhere qualifies.

### The success fee came along

`SUCCESS_FEE = 30` was hardcoded on the same page, and
`CREDITED_REDEMPTIONS = credit / fee` derives from it — so fixing the credit
without the fee would still have produced a wrong number. The page now reads
canonical `getSuccessFee()`, the same helper `/merchant/plan/success-fee` and the
onboarding wizard use (`src/lib/data.ts:77` — *"never hardcode KES 30"*).

**One hand-written number is left, deliberately:** the `KES 30` in the static
`<head>` description. `metadata` is a static export, the fee is frozen and
explicitly not under review, and turning it into an async `generateMetadata` for
a number that cannot change would be ceremony. It is commented at the site with
what to do if that ever stops being true.

### Rendering cost

Reading `app_config` means the page can no longer be prerendered, so it carries
`export const dynamic = "force-dynamic"` — the repo's existing convention for
config-reading pages. Build output confirms `ƒ /for-merchants`. ISR was the
tempting alternative but it would need database access **at build time**, which
CI does not have.

## Guards

- `src/lib/__tests__/launch-credit.test.ts` — 29 tests: the window boundary in
  both directions, the cap boundary (99 live / 100 closed / 137 closed),
  uncapped, disabled-by-zero, missing-amount, the launch-node COALESCE, a renamed
  node, `creditedRedemptions` flooring, and every fail-closed path in the read.
- `src/__tests__/cash-only-and-copy.test.ts` — a copy guard asserting the page
  imports `getLaunchCreditOffer`, declares no `OPENING_CREDIT` constant, contains
  no literal `First 100 shops` or `KES 300`, and gates **at least two** blocks on
  `offer.live`.

Both guard assertions were negative-tested by reintroducing the hardcode — the
constant and the literal string each fail the test on their own, not just
together.

## Follow-up, closed the same day: the cap was counted globally

Flagged above as out of scope for the copy fix, then fixed — because it is not a
cosmetic issue. `activate_merchant` counted **every** `node0_opening_credit:%`
ledger row regardless of node:

```sql
SELECT COUNT(*) INTO v_credited_count
  FROM public.merchant_transactions
 WHERE transaction_type = 'topup' AND payment_provider = 'manual'
   AND provider_reference LIKE 'node0_opening_credit:%';
```

That is correct while exactly one node has ever run the promo, and wrong the
moment a second one does. The concrete failure: once Node 0's 100 merchants are
credited and ops points `node0_launch_node` at the next mall, **the new node's
promo is dead on arrival.** Every activation there grants nothing while
`/for-merchants` advertises the credit — and it fails silently on both sides. No
error is raised; the merchant is simply activated with a zero balance, at the one
moment the product has their full attention.

**Reproduced before fixing.** With the cap forced to 1, one credit granted at the
launch node, and `node0_launch_node` then moved, the new node's merchant was
activated with balance `0.00` instead of the credit.

### The fix

Migration `20260730120000_node_scoped_opening_credit_cap.sql` scopes the count to
the launch node by joining `merchants`, so each node gets its own first-N
allowance. The advisory lock is scoped the same way
(`hashtext('node0_opening_credit:' || v_launch_node)`) — two nodes counting
concurrently is correct, because they count disjoint sets, while activations
within a node still serialise, which is what makes the cap atomic.

Everything else is byte-for-byte the prior definition: the frozen amount and cap,
all four gate conditions, the pending-only guard, and the ledger row's shape. The
idempotency anchor `provider_reference = 'node0_opening_credit:<merchant_id>'`
stays merchant-keyed and therefore stays UNIQUE — **changing its format would let
an already-credited merchant be credited again under a new reference**, which is
why the node is not encoded there.

### The same bug existed on the read side

`getLaunchCreditOffer` counted globally too, so the public page would have hidden
a live promo at a new node. It now filters through a PostgREST inner join
(`merchants!inner(node)` + `.eq("merchants.node", …)`), using the same
`effectiveLaunchNode()` default as the rule, so the page and the grant agree.

### Known limit, deliberately not solved

The count attributes each credit to the merchant's **current** node, because the
ledger row has nowhere to snapshot the node at grant time. Nothing in the app
mutates `merchants.node` — onboarding sets it once and `authenticated` writes to
core tables are revoked — so the two are identical today. If node changes ever
become a real operation, the count must move to a snapshot taken at grant time
rather than a live join. Adding a parallel grant-audit table purely to remember a
node would have duplicated the ledger, which is already the money record.

Also still **one node at a time**: `node0_launch_node` is a single value, so only
one node qualifies at any moment. This fix makes *sequential* nodes work (Node 0,
then Node 1). Running two nodes' promos simultaneously needs a per-node config
shape — a product decision, not a bug fix.

### Guards

`supabase/tests/node0_opening_credit_test.sql` gains two scenarios:

- **E** — a filled node must not exhaust the next node's allowance.
- **F** — the cap still binds *within* a node. This is the guard against
  "fixing" E by quietly not enforcing the cap at all, and it is the reason E is
  safe to trust.

Scenario E was negative-tested by restoring only the old function body (extracted
from the security-hardening migration, since that file is not idempotent against
an already-migrated database) and confirming E fails with *"new node expected
300, got 0.00"* while A–D still pass.

## Verification

`npm run lint` · `npm run typecheck` clean · `npm test` **542 passing**
(53 files) · `npm run build` green, `ƒ /for-merchants`.

SQL: all **17** suites in `supabase/tests/` pass, validated locally against
Postgres 16 with a Supabase shim (roles, `auth`/`storage`/`cron` schemas, the
`auth.jwt/role/uid` helpers, postgis, and `search_path = public, extensions`),
every migration applied in order from a clean database. They also run in CI
`db-tests` against a real `supabase start`.

## Applied to prod — 2026-07-30

Project `axrrslqssmbngbataejg` (eu-west-1).

**Pre-flight, before touching anything.** Confirmed prod carried the pre-fix
definition (global lock, no join) and read the live promo state:

| Check | Value |
|---|---|
| `node0_launch_node` | BBS Mall |
| Credit / cap / window | 300 / 100 / 2026-12-15 |
| **Opening credits granted so far** | **0** |
| Distinct merchant nodes | 3 — BBS Mall, CBD Galleria, Westlands Hub |

Zero credits granted made this an unusually safe window: with the count at 0 the
change is **behaviour-identical on the day**, scoped or global. There was nothing
to repair or backfill. And because prod already carries all three nodes, the fix
landed before the bug could bite anything real.

**Post-apply verification** (read-only, `pg_proc`): node-scoped count present,
per-node lock present, old global lock gone, and every guard intact — admin gate,
pending-only guard, `SECURITY DEFINER`, pinned `search_path = public, pg_temp`,
and the merchant-keyed idempotency anchor. One overload only; grants unchanged
(`authenticated`, `service_role`, `postgres`); frozen config values unchanged;
the cap key's notes now say per-node. `get_advisors` shows nothing new — the
`activate_merchant` `authenticated`-executable warning is pre-existing and by
design (the admin gate lives inside the function), and the three
`security_definer_view` errors are the documented 2026-07-23 trade-off.

**The SQL test suite was deliberately NOT run against prod** — its scenarios
insert merchants and mutate `app_config`. Prod verification is read-only
inspection; behaviour is proven on the local shim.

**Migration-history repair.** `apply_migration` stamped its own version
(`20260730011416`) rather than the repo filename's `20260730120000`. Every other
row in prod's history matches its repo filename exactly, and leaving the mismatch
would make a later `supabase db push` treat the file as un-applied and re-run it.
The row's version was updated to `20260730120000` — the same thing
`supabase migration repair` does. Re-application would have been harmless
(`CREATE OR REPLACE` plus an idempotent `UPDATE`), but the repo is the
authoritative record of DB behaviour and prod's history should stay auditable
against it.
