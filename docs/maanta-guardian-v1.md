# MAANTA Guardian v1 — Redemption-time fraud checks

**Status:** implemented (this session). Supersedes the "proposed, not implemented"
line in the Decisions Log for the three redemption-time check families below.
**Scope:** Node 0 (BBS Mall) only. Redemption-time checks only — **not** a global
risk-scoring engine. Guardian v1 evaluates a single redemption at the moment a
merchant verifies its OTP and produces one recommendation for that redemption.

Authority for the surrounding invariants: `CLAUDE.md` (Frozen business rules),
`docs/maanta-decisions-log.md`, and the money-path migrations
(`20260702092952…core_loop`, `20260709191750…override_dispute`,
`20260720014135…link_success_fee_ledger`).

---

## 1. Where Guardian runs

Guardian v1 is a **verify-time** step inside `verify_redemption`. It runs:

1. **after** the OTP is matched to a live, unexpired, `pending` redemption
   (so we never leak fraud state to an attacker probing random codes), and
2. **before** the user-visible status and the money step are finalised.

It is a separable module: `public.guardian_evaluate(p_redemption_id, p_now)`
does all the signal work, writes the audit rows, and returns a structured JSON
result. `verify_redemption` only reads the recommendation and maps it to
system behaviour. Guardian holds **no** payment-provider knowledge — it is
app-level logic over the `redemptions` history.

This is additive to the pre-existing **claim-time** pass (`guardian_check`,
called from `/api/redemptions` after a claim). Claim-time flags remain
"verify-anyway" warnings; only verify-time **block-severity** hits can hold or
decline, and only under the conservative thresholds below.

`p_now` is an injectable clock (defaults to `NOW()`) so the SQL/RPC tests build
fixed-timestamp histories and never depend on wall-clock time.

---

## 2. Signals and thresholds

All windows are relative to `p_now`. Velocity/collusion counts consider prior
`status = 'success'` redemptions and **include** the redemption being verified
(`+1` for the current attempt). Geofence reads only the current row.

| Check | Signal | `warn` (allow + flag) | `block` |
|---|---|---|---|
| `velocity_shopper` | same `user_id`, successful redemptions in a 10-min window | ≥ 5 | ≥ 8 → **hard** |
| `velocity_merchant` | same `merchant_id`, successful redemptions in a 5-min window | ≥ 20 | — (warn only; a busy counter is legitimate) |
| `velocity_deal` | same `user_id` **and** `deal_id`, successful redemptions in a 60-min window | ≥ 5 | ≥ 6 → **soft** |
| `geofence` | `distance_from_shop` (metres) recorded at claim time; `NULL` ⇒ skip | > 250 m | > 2000 m → **hard** |
| `collusion` | same `deal_id`+`merchant_id` in a 30-min window: `T` = total successful, `D` = distinct users | `T ≥ 5 AND D ≤ 2` | `T ≥ 8 AND D ≤ 2` → **soft** |

Thresholds are deliberately conservative and are **tunable live** via the
`app_config` row `guardian_thresholds` (a single JSON blob, keyed by check),
read by `guardian_evaluate` at entry — ops can retune without a redeploy
(2026-07-22). Every value has a hardcoded fallback in `guardian_evaluate` equal
to the shipped default in the table above; a missing key, a missing row, or a
malformed row falls back to those defaults, so a bad config can never fail
Guardian **open** (it never silently clears everything). The JSON shape:

```json
{
  "velocity_shopper":  {"window_minutes": 10, "warn": 5, "hard": 8},
  "velocity_merchant": {"window_minutes": 5,  "warn": 20},
  "velocity_deal":     {"window_minutes": 60, "warn": 5, "soft": 6},
  "geofence":          {"warn_m": 250, "hard_m": 2000},
  "collusion":         {"window_minutes": 30, "warn_total": 5, "soft_total": 8, "max_distinct": 2}
}
```

Two properties are load-bearing:
the block bands sit above plausible legitimate repeat activity (a shopper who
redeems a genuinely multi-claim deal a handful of times is warned, not blocked),
and `velocity_deal`'s soft band (6) stays **below** `velocity_shopper`'s hard
band (8) so one shopper cycling one deal *holds* for review rather than being
declined. Merchant velocity never blocks and geofence with no GPS never
penalises — both by design, to protect the busy or GPS-denied honest counter.

**Overall recommendation** = the strongest outcome across all checks:

- any **hard** block hit → `hard_block`
- else any **soft** block hit → `soft_block`
- else any **warn** hit (incl. pre-existing claim-time flags) → `flag`
- else → `clear`

`hard` is reserved for the physically/robotically unambiguous cases (off-mall by
>2 km; ≥6 shopper redemptions in 10 minutes). `soft` covers strong-but-arguable
patterns (one shopper cycling one deal; a tiny group cycling one deal) that
deserve a human look rather than an outright decline.

---

## 3. Outcomes and interaction with money-path statuses

The frozen money model is untouched: the KES 30 fee and the strict 3-state
`feeChargeStatus` (`charged` | `owed` | `unknown`, where `unknown` never
collapses into `owed`) only ever move on the **success** path, which is
byte-for-byte the existing logic. Block/held paths move **no money at all**, so
YOU PAY arithmetic, the zero-balance gate, and the fee-status meanings cannot be
affected by Guardian.

| Recommendation | Redemption status | Fee / money | Shopper + merchant see | Audit |
|---|---|---|---|---|
| `clear` | `success` | fee applied as today → `charged`/`owed`/`unknown` | normal success | `guardian_events` overall `info` row |
| `flag` (allow + flag) | `success` | fee applied as today (unchanged) | normal success (verify-anyway preserved) | `guardian_events` `warn` rows + `fraud_events` + `agent_tasks.dispute_review`; `disputed = true` |
| `soft_block` | `flagged` (held) | **no fee moves** | non-accusatory "needs a quick review" message | `guardian_events` `block` rows + `fraud_events` + `dispute_review`; released later by admin |
| `hard_block` | `failed` (declined) | **no fee moves** | non-accusatory "couldn't complete, try later" message | `guardian_events` `block` rows + `fraud_events` + `dispute_review` |

**Verify-anyway refinement (recorded in the Decisions Log).** The frozen
verify-anyway rule continues to hold for `clear`/`flag`: the shopper is never
blocked for a warning or for merchant wallet state. Block-severity Guardian hits
are the *sole, auditable* exception, are chosen conservatively, and move no
money. This is the documented interaction the session was scoped to add.

`fee_charge_status` is returned as `NULL` on `held`/`blocked` (no fee decision
was made) — it is **not** one of the 3 money states, so the money model's
vocabulary stays closed.

### Admin override path (soft-block release)

A soft-blocked redemption is **held**, not lost. `admin_release_redemption(
p_redemption_id, p_approve)` (admin-gated) is the override hook:

- `p_approve = true` → `flagged` → `success` **and** applies the KES 30 fee
  through the same `deduct_success_fee_or_record_arrears` path, returning the
  ordinary `charged`/`owed`/`unknown`. The money model runs here exactly as it
  would have on a clear verify.
- `p_approve = false` → `flagged` → `failed`, no fee.

Hard-blocks are terminal in v1 (declined; no release path) — they represent the
egregious tail.

---

## 4. Data structures

New, minimal, reversible:

- **`public.guardian_events`** — granular per-redemption audit, keyed by
  `redemption_id` (`ON DELETE CASCADE`):
  `check_type` (`velocity_shopper`|`velocity_merchant`|`velocity_deal`|`geofence`|`collusion`|`overall`),
  `severity` (`info`|`warn`|`block`), `recommendation` (on the `overall` row),
  `metadata` jsonb (counts, window, distance), `created_at`.

The existing **`fraud_events`** table (merchant/user-level routing + trust) and
**`agent_tasks.dispute_review`** queue are reused unchanged for warn+ hits, so
the existing admin fraud surfaces keep working. `redemptions.fraud_flags` /
`review_required` continue to carry the durable per-row markers.

No money-path table or column changes.

---

## 5. Admin / support hook (future UI entry point)

`admin_redemption_detail(p_redemption_id)` (admin-gated) returns the redemption
row plus its `guardian_events` (as a jsonb array, newest first) and the overall
`guardian_recommendation`. This is the single entry point the Guardian admin UI
reads. The existing `/admin/redemptions` fraud queue already lists `fraud_events`
by type (geofence/velocity/collusion) and continues to receive Guardian's routed
events.

**Admin UI (built 2026-07-22).** `/admin/redemptions` now leads with a **Held for
review** queue (soft-blocked redemptions awaiting release — no fee has moved on
them) and links every redemption to a detail page `/admin/redemptions/[id]`. The
detail page reads `admin_redemption_detail`, shows the overall Guardian
recommendation chip (`Clear`/`Flagged`/`Held`/`Blocked`), a plain-English
timeline of the `guardian_events` with per-check severity, and — for a held
redemption — the override actions: **Release &amp; charge fee** (→
`admin_release_redemption(id, true)`, applies the KES 30 fee via the frozen money
path) or **Reject** (→ `admin_release_redemption(id, false)`, fails it with no
fee). API route: `POST /api/admin/redemptions/[id]/release`. All copy is
non-accusatory and in-ink; recommendation chips are greyscale-readable and
amber-free (red confined to the held chip's border and the blocked chip's fill).

---

## 6. Testing

`supabase/tests/guardian_v1_test.sql` (runs in CI `db-tests`) builds
fixed-timestamp histories and drives `verify_redemption` through **clear**,
**allow+flag** (geofence warn), **soft-block** (deal velocity) with its admin
release, **hard-block** (geofence > 2 km and shopper velocity), and **collusion**
scenarios. Each asserts the redemption status, the `guardian_events` rows and
overall recommendation, and the money-path records (no fee on held/blocked; the
ordinary fee on clear and on admin release). Time is injected via `p_now`, so
the suite is deterministic.

---

## 8. Analytics (Guardian outcomes)

Every verify emits one **`guardian_outcome`** PostHog event so we can watch how
often Guardian fires and whether the thresholds need tuning.

**Emission.** `src/lib/analytics.ts` (`captureGuardianOutcome`) is called from
`/api/redemptions/verify` for **every** outcome — `clear`, `flag`, `soft_block`,
`hard_block` — right after the RPC returns, *before* the block/held branches.
It is:

- **dependency-free** — one `fetch` to PostHog's `/capture/` endpoint, no SDK;
- **off by default** — a no-op unless `POSTHOG_PROJECT_KEY` is set, so dev / CI /
  tests emit nothing and `npm run build` stays clean (`POSTHOG_HOST` defaults to
  the EU cloud);
- **best-effort and non-blocking** — the call is `void`ed, swallows every error,
  and bounds itself with a 2 s timeout, so the counter (verify) path is never
  delayed or broken by a metrics ping (frozen "never block the shopper").

Env: `POSTHOG_PROJECT_KEY` (the `phc_…` project key) and optional `POSTHOG_HOST`
(see `.env.example`).

**Event shape.** `event = "guardian_outcome"`, `distinct_id = merchant.id`
(attributes the verify to the counter), with properties:

| property | values |
|---|---|
| `recommendation` | `clear` \| `flag` \| `soft_block` \| `hard_block` |
| `severity` | `info` \| `warn` \| `block` |
| `redemption_status` | `success` \| `held` \| `blocked` |
| `fee_charge_status` | `charged` \| `owed` \| `unknown` \| `null` |
| `disputed`, `deal_id`, `redemption_id`, `merchant_id`, `node` | context |

**Dashboard — "Guardian outcomes".** A trends insight over time, breakdown by
`recommendation`, is the recommendation-rate chart. Because it depends only on
the event + one property it is a single `query-trends` insight on a `Guardian`
dashboard. Provisioning is one PostHog step once the connector is approved for
this session (the PostHog MCP `exec` tool requires interactive approval):

```text
# recommendation rate over time (daily, last 30d), one line per recommendation
posthog:exec call query-trends {
  "series": [{ "kind": "EventsNode", "event": "guardian_outcome", "math": "total" }],
  "breakdownFilter": { "breakdowns": [{ "property": "recommendation", "type": "event" }] },
  "trendsFilter": { "display": "ActionsLineGraph" },
  "interval": "day", "dateRange": { "date_from": "-30d" }
}
# then insight-create with that query (name "Guardian outcomes over time")
# and dashboard-create name "Guardian", adding the insight.
```

A useful companion insight is **block rate**: the same series filtered to
`recommendation ∈ {soft_block, hard_block}` as a proportion of all
`guardian_outcome` events. The event only appears in PostHog's schema after the
first production verify, so the insight starts empty and populates from launch.

---

## 7. Non-goals for v1

- No global/standing risk score; no device-graph or cross-session modelling
  beyond the single-redemption window.
- No new shopper- or merchant-facing UI (only the non-accusatory copy already
  routed through the existing in-ink error style).
- No changes to YOU PAY, the KES 30 pin, the fee-status meanings, the
  zero-balance gate, or any frozen UI colour/copy rule.
